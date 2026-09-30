import { setTimeout as sleep } from 'node:timers/promises';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { olympiads, planItems, reminders, users } from '../../db/schema.js';
import { readPlan, planKey } from '../plan.js';
import { dueReminders, eventsSnapshot, scheduleChange, type DueReminder, type ReminderItem, type ScheduleChange } from './schedule.js';
import { reminderKeyboard, reminderText } from './format.js';
import { toDeliveryError, type DeliveryError, type Messenger } from './max.js';
import { localDay, regionTimezone, withinHours, type SendingHours } from './timezones.js';

export type ReminderOptions = { includeEstimated: boolean };
/** Sending hours by the pupil's local time (region of the profile); none — send now, whatever the hour (`pnpm bot:remind`). */
export type RunOptions = ReminderOptions & { hours?: SendingHours };
/** A failed message is retried by later runs of the same day, at most this many attempts in total. */
export const MAX_ATTEMPTS = 3;

export class NotificationError extends Error {
  constructor(public code: string, message: string, public statusCode: number) { super(message); }
}

export async function reminderItems(db: Database, userId: string, today: string): Promise<ReminderItem[]> {
  const plan = await readPlan(db, userId, today);
  return plan.items.map(item => ({ olympiadId: item.olympiad.id, title: item.olympiad.title, tracking: item.tracking, status: item.status, events: item.calendarEvents ?? [] }));
}

/** Users with reminders on, a real MAX id, no refusal from MAX since their last bot start and at least one tracked olympiad. */
async function recipients(db: Database, now: Date, hours?: SendingHours) {
  const rows = await db.select({ id: users.id, maxUserId: users.maxUserId, region: users.region }).from(users).where(and(
    eq(users.notificationsEnabled, true), isNull(users.botBlockedAt), sql`${users.maxUserId} ~ '^[1-9][0-9]{0,15}$'`,
    exists(db.select({ one: sql`1` }).from(planItems).where(and(eq(planItems.userId, users.id), eq(planItems.tracking, true)))),
  )).orderBy(users.createdAt);
  // «Today» is the pupil's local day: within the sending hours it is the Moscow day everywhere in Russia, but the
  // local day keeps the rule honest for Kamchatka at 01:00 Moscow time.
  return rows.map(row => ({ ...row, timezone: regionTimezone(row.region) }))
    .filter(row => !hours || withinHours(now, row.timezone, hours))
    .map(row => ({ ...row, today: localDay(now, row.timezone) }));
}

/** Stored date snapshots of a user's plan: olympiad id → keys, null until the first run saw the item. */
async function snapshots(db: Database, userId: string) {
  const rows = await db.select({ olympiadId: planItems.olympiadId, snapshot: planItems.eventsSnapshot }).from(planItems).where(eq(planItems.userId, userId));
  return new Map(rows.map(row => [row.olympiadId, row.snapshot]));
}
/** Compare-and-set of a snapshot: only one worker moves it from `from` to `to`, so a change is announced once. */
async function swapSnapshot(db: Database, userId: string, olympiadId: number, from: string[] | null, to: string[]) {
  const same = from === null ? isNull(planItems.eventsSnapshot) : sql`${planItems.eventsSnapshot} = ${JSON.stringify(from)}::jsonb`;
  const rows = await db.update(planItems).set({ eventsSnapshot: to }).where(and(planKey(userId, olympiadId), same)).returning({ id: planItems.olympiadId });
  return rows.length > 0;
}
/**
 * Date changes to announce in today's message. A first sight of an olympiad only records its dates; a quiet change
 * (a date vanished) only updates them. The announced changes are claimed here and given back if sending fails.
 */
async function claimChanges(db: Database, userId: string, items: ReminderItem[], today: string, options: ReminderOptions) {
  const stored = await snapshots(db, userId);
  const claimed: (ScheduleChange & { previous: string[] })[] = [];
  for (const item of items) {
    if (!item.tracking || item.status === 'done' || !stored.has(item.olympiadId)) continue;
    const previous = stored.get(item.olympiadId) ?? null;
    if (previous === null) {
      const first = eventsSnapshot(item, today, options);
      if (first.length) await swapSnapshot(db, userId, item.olympiadId, null, first);
      continue;
    }
    const change = scheduleChange(item, previous, today, options);
    if (!change || !await swapSnapshot(db, userId, item.olympiadId, previous, change.snapshot)) continue;
    if (change.events.length) claimed.push({ ...change, previous });
  }
  return claimed;
}
async function releaseChanges(db: Database, userId: string, changes: (ScheduleChange & { previous: string[] })[]) {
  for (const change of changes) await swapSnapshot(db, userId, change.olympiadId, change.snapshot, change.previous);
}

/**
 * Takes the reminders this run may send. New rows are inserted as `pending`; an existing row is taken again only
 * if an earlier attempt failed (and attempts remain) or a `pending` claim was abandoned by a crashed run.
 * Two workers running at once never send the same reminder twice.
 */
async function claim(db: Database, userId: string, list: DueReminder[]) {
  if (!list.length) return [];
  const rows = await db.insert(reminders)
    .values(list.map(d => ({ userId, olympiadId: d.olympiadId, eventKey: d.eventKey, eventDate: d.eventDate, bucket: d.bucket })))
    .onConflictDoUpdate({
      target: [reminders.userId, reminders.olympiadId, reminders.eventKey, reminders.bucket],
      set: { status: 'pending', attempts: sql`${reminders.attempts} + 1`, error: null, updatedAt: sql`now()` },
      setWhere: sql`(${reminders.status} = 'failed' and ${reminders.attempts} < ${MAX_ATTEMPTS})
        or (${reminders.status} = 'pending' and ${reminders.updatedAt} < now() - interval '30 minutes')`,
    })
    .returning({ id: reminders.id, olympiadId: reminders.olympiadId, eventKey: reminders.eventKey, bucket: reminders.bucket });
  const ids = new Map(rows.map(r => [`${r.olympiadId}|${r.eventKey}|${r.bucket}`, r.id]));
  return list.flatMap(d => { const id = ids.get(`${d.olympiadId}|${d.eventKey}|${d.bucket}`); return id ? [{ ...d, reminderId: id }] : []; });
}

async function settle(db: Database, userId: string, ids: string[], now: Date, failure?: DeliveryError) {
  const at = now.toISOString();
  if (!failure) {
    await db.update(reminders).set({ status: 'sent', sentAt: at, error: null, updatedAt: at }).where(inArray(reminders.id, ids));
    return;
  }
  await db.update(reminders).set({ status: 'failed', error: failure.message, updatedAt: at,
    ...(failure.unreachable ? { attempts: MAX_ATTEMPTS } : {}) }).where(inArray(reminders.id, ids));
  if (failure.unreachable) await db.update(users).set({ botBlockedAt: at }).where(eq(users.id, userId));
}

export type RunStats = { users: number; messages: number; reminders: number; changes: number; failed: number; unreachable: number };
/**
 * One pass of the daily mailing: for every recipient whose local time is within the sending hours, what is due
 * today (see REMINDER_OFFSETS) and not yet sent, plus dates that changed since the last pass, go out as a single
 * message. Safe to call as often as you like: sent reminders and announced changes are never repeated.
 */
export async function runReminders(db: Database, messenger: Messenger, options: RunOptions & {
  now?: Date; pauseMs?: number; log?: (message: string, extra?: Record<string, unknown>) => void;
}): Promise<RunStats> {
  const now = options.now ?? new Date();
  const stats: RunStats = { users: 0, messages: 0, reminders: 0, changes: 0, failed: 0, unreachable: 0 };
  const identity = await messenger.identity();
  for (const user of await recipients(db, now, options.hours)) {
    const items = await reminderItems(db, user.id, user.today);
    const claimed = await claim(db, user.id, dueReminders(items, user.today, options));
    const changes = await claimChanges(db, user.id, items, user.today, options);
    if (!claimed.length && !changes.length) continue;
    stats.users++;
    const ids = claimed.map(d => d.reminderId);
    try {
      await messenger.sendToUser(Number(user.maxUserId), reminderText(claimed, { changes }),
        reminderKeyboard([...claimed, ...changes.flatMap(change => change.events)], identity));
      if (ids.length) await settle(db, user.id, ids, now);
      stats.messages++; stats.reminders += claimed.length; stats.changes += changes.length;
    } catch (error) {
      const failure = toDeliveryError(error);
      if (ids.length) await settle(db, user.id, ids, now, failure);
      else if (failure.unreachable) await db.update(users).set({ botBlockedAt: now.toISOString() }).where(eq(users.id, user.id));
      // Unsent changes go back, so the next pass announces them again.
      await releaseChanges(db, user.id, changes);
      stats.failed++; if (failure.unreachable) stats.unreachable++;
      options.log?.('Напоминание не доставлено', { userId: user.id, unreachable: failure.unreachable, error: failure.message });
    }
    // MAX allows two messages a second per dialog; the pause also keeps the whole run well below the global limits.
    if (options.pauseMs !== 0) await sleep(options.pauseMs ?? 100);
  }
  return stats;
}

/** What `runReminders` would send today, without sending or recording anything: `pnpm bot:remind --dry-run`. */
export async function previewReminders(db: Database, options: RunOptions & { now?: Date }) {
  const preview: { maxUserId: string; reminders: DueReminder[]; changes: ScheduleChange[]; text: string }[] = [];
  for (const user of await recipients(db, options.now ?? new Date(), options.hours)) {
    const { today } = user;
    const items = await reminderItems(db, user.id, today);
    const due = dueReminders(items, today, options);
    const stored = await snapshots(db, user.id);
    const changes = items.flatMap(item => {
      const previous = stored.get(item.olympiadId);
      const change = previous ? scheduleChange(item, previous, today, options) : null;
      return change?.events.length ? [change] : [];
    });
    const sent = await db.select({ olympiadId: reminders.olympiadId, eventKey: reminders.eventKey, bucket: reminders.bucket }).from(reminders)
      .where(and(eq(reminders.userId, user.id), eq(reminders.status, 'sent')));
    const done = new Set(sent.map(r => `${r.olympiadId}|${r.eventKey}|${r.bucket}`));
    const left = due.filter(d => !done.has(`${d.olympiadId}|${d.eventKey}|${d.bucket}`));
    if (left.length || changes.length) preview.push({ maxUserId: user.maxUserId, reminders: left, changes, text: reminderText(left, { changes }) });
  }
  return preview;
}

async function userRow(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new NotificationError('UNAUTHORIZED', 'Войдите в аккаунт заново.', 401);
  return user;
}
export async function readNotificationSettings(db: Database, userId: string, messenger: Messenger | null) {
  const user = await userRow(db, userId);
  const identity = messenger ? await messenger.identity() : null;
  return { enabled: user.notificationsEnabled, botConnected: user.botStartedAt !== null && user.botBlockedAt === null,
    botUrl: identity ? `https://max.ru/${encodeURIComponent(identity.username)}` : null };
}
export async function setNotificationsEnabled(db: Database, userId: string, enabled: boolean, now = new Date()) {
  await db.update(users).set({ notificationsEnabled: enabled, updatedAt: now.toISOString() }).where(eq(users.id, userId));
}

// ---- Called by the bot on updates from MAX ----

/** «Начать» in the bot dialog: the user can now receive messages. Creates the account if the mini-app was never opened. */
export async function recordBotStarted(db: Database, identity: { maxUserId: string; displayName: string }, now = new Date()) {
  const at = now.toISOString();
  const [user] = await db.insert(users).values({ ...identity, botStartedAt: at })
    .onConflictDoUpdate({ target: users.maxUserId, set: { displayName: identity.displayName, botStartedAt: at, botBlockedAt: null } })
    .returning({ id: users.id, registeredAt: users.registeredAt, notificationsEnabled: users.notificationsEnabled, region: users.region });
  return user!;
}
export async function recordBotStopped(db: Database, maxUserId: string, now = new Date()) {
  await db.update(users).set({ botBlockedAt: now.toISOString() }).where(eq(users.maxUserId, maxUserId));
}
export async function userByMaxId(db: Database, maxUserId: string) {
  const [user] = await db.select({ id: users.id, notificationsEnabled: users.notificationsEnabled, registeredAt: users.registeredAt, region: users.region })
    .from(users).where(eq(users.maxUserId, maxUserId));
  return user ?? null;
}
/** Turns tracking of one plan olympiad on or off; returns its title, or null when it is not in the plan. */
export async function setTracking(db: Database, userId: string, olympiadId: number, tracking: boolean) {
  const [row] = await db.update(planItems).set({ tracking }).where(planKey(userId, olympiadId)).returning({ id: planItems.olympiadId });
  if (!row) return null;
  const [olympiad] = await db.select({ title: olympiads.title }).from(olympiads).where(eq(olympiads.id, olympiadId));
  return olympiad?.title ?? null;
}
export type PlanStatus = typeof planItems.$inferSelect['status'];
/**
 * «✅ Я зарегистрировался» and its undo in the bot: planned ⇄ registered. A status the pupil set further in the app
 * (taking part, finished) is never moved back. null — the olympiad is not in the plan.
 */
export async function setRegistered(db: Database, userId: string, olympiadId: number, registered: boolean) {
  const [from, to] = registered ? ['planned', 'registered'] as const : ['registered', 'planned'] as const;
  const [changed] = await db.update(planItems).set({ status: to }).where(and(planKey(userId, olympiadId), eq(planItems.status, from)))
    .returning({ status: planItems.status });
  const [row] = await db.select({ title: olympiads.title, status: planItems.status }).from(planItems)
    .innerJoin(olympiads, eq(olympiads.id, planItems.olympiadId)).where(planKey(userId, olympiadId));
  return row ? { title: row.title, status: row.status, changed: changed !== undefined } : null;
}
export async function olympiadTitle(db: Database, olympiadId: number) {
  const [row] = await db.select({ title: olympiads.title }).from(olympiads).where(eq(olympiads.id, olympiadId));
  return row?.title ?? null;
}
export async function trackedOlympiads(db: Database, userId: string) {
  return db.select({ id: olympiads.id, title: olympiads.title }).from(planItems).innerJoin(olympiads, eq(olympiads.id, planItems.olympiadId))
    .where(and(eq(planItems.userId, userId), eq(planItems.tracking, true))).orderBy(planItems.savedAt);
}
