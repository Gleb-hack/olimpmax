import { setTimeout as sleep } from 'node:timers/promises';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { olympiads, planItems, reminders, users } from '../../db/schema.js';
import { readPlan, planKey } from '../plan.js';
import { moscowToday } from '../calendar.js';
import { dueReminders, upcomingEvents, type DueReminder, type ReminderItem } from './schedule.js';
import { keyboard, openAppButton, reminderKeyboard, reminderText, startParam } from './format.js';
import { toDeliveryError, type DeliveryError, type Messenger } from './max.js';

export type ReminderOptions = { includeEstimated: boolean };
/** A failed message is retried by later runs of the same day, at most this many attempts in total. */
export const MAX_ATTEMPTS = 3;
const MAX_USER_ID = /^[1-9][0-9]{0,15}$/;

export class NotificationError extends Error {
  constructor(public code: string, message: string, public statusCode: number) { super(message); }
}

export async function reminderItems(db: Database, userId: string, today: string): Promise<ReminderItem[]> {
  const plan = await readPlan(db, userId, today);
  return plan.items.map(item => ({ olympiadId: item.olympiad.id, title: item.olympiad.title, tracking: item.tracking, events: item.calendarEvents ?? [] }));
}

/** Users with reminders on, a real MAX id, no refusal from MAX since their last bot start and at least one tracked olympiad. */
function recipients(db: Database) {
  return db.select({ id: users.id, maxUserId: users.maxUserId }).from(users).where(and(
    eq(users.notificationsEnabled, true), isNull(users.botBlockedAt), sql`${users.maxUserId} ~ '^[1-9][0-9]{0,15}$'`,
    exists(db.select({ one: sql`1` }).from(planItems).where(and(eq(planItems.userId, users.id), eq(planItems.tracking, true)))),
  )).orderBy(users.createdAt);
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

export type RunStats = { users: number; messages: number; reminders: number; failed: number; unreachable: number };
/**
 * One pass of the morning mailing: for every recipient, what is due today (see REMINDER_OFFSETS) and not yet sent
 * goes out as a single message. Safe to call as often as you like: sent reminders are never repeated.
 */
export async function runReminders(db: Database, messenger: Messenger, options: ReminderOptions & {
  now?: Date; pauseMs?: number; log?: (message: string, extra?: Record<string, unknown>) => void;
}): Promise<RunStats> {
  const now = options.now ?? new Date();
  const today = moscowToday(now);
  const stats: RunStats = { users: 0, messages: 0, reminders: 0, failed: 0, unreachable: 0 };
  const identity = await messenger.identity();
  for (const user of await recipients(db)) {
    const claimed = await claim(db, user.id, dueReminders(await reminderItems(db, user.id, today), today, options));
    if (!claimed.length) continue;
    stats.users++;
    const ids = claimed.map(d => d.reminderId);
    try {
      await messenger.sendToUser(Number(user.maxUserId), reminderText(claimed), reminderKeyboard(claimed, identity));
      await settle(db, user.id, ids, now);
      stats.messages++; stats.reminders += claimed.length;
    } catch (error) {
      const failure = toDeliveryError(error);
      await settle(db, user.id, ids, now, failure);
      stats.failed++; if (failure.unreachable) stats.unreachable++;
      options.log?.('Напоминание не доставлено', { userId: user.id, unreachable: failure.unreachable, error: failure.message });
    }
    // MAX allows two messages a second per dialog; the pause also keeps the whole run well below the global limits.
    if (options.pauseMs !== 0) await sleep(options.pauseMs ?? 100);
  }
  return stats;
}

/** What `runReminders` would send today, without sending or recording anything: `pnpm bot:remind --dry-run`. */
export async function previewReminders(db: Database, options: ReminderOptions & { now?: Date }) {
  const today = moscowToday(options.now ?? new Date());
  const preview: { maxUserId: string; reminders: DueReminder[]; text: string }[] = [];
  for (const user of await recipients(db)) {
    const due = dueReminders(await reminderItems(db, user.id, today), today, options);
    if (!due.length) continue;
    const sent = await db.select({ olympiadId: reminders.olympiadId, eventKey: reminders.eventKey, bucket: reminders.bucket }).from(reminders)
      .where(and(eq(reminders.userId, user.id), eq(reminders.status, 'sent')));
    const done = new Set(sent.map(r => `${r.olympiadId}|${r.eventKey}|${r.bucket}`));
    const left = due.filter(d => !done.has(`${d.olympiadId}|${d.eventKey}|${d.bucket}`));
    if (left.length) preview.push({ maxUserId: user.maxUserId, reminders: left, text: reminderText(left) });
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

/** «Прислать тестовое напоминание» in the profile: the nearest real deadline of the plan, or a plain check message. */
export async function sendTestReminder(db: Database, messenger: Messenger, userId: string, options: ReminderOptions & { now?: Date }) {
  const now = options.now ?? new Date();
  const user = await userRow(db, userId);
  if (!MAX_USER_ID.test(user.maxUserId)) throw new NotificationError('BOT_UNAVAILABLE', 'Тестовое напоминание приходит в MAX: откройте Olimp внутри мессенджера.', 409);
  const today = moscowToday(now);
  const upcoming = upcomingEvents(await reminderItems(db, userId, today), today, 180, options);
  const nearest = upcoming[0];
  const list = nearest ? upcoming.filter(d => d.olympiadId === nearest.olympiadId).slice(0, 3) : [];
  const identity = await messenger.identity();
  const text = list.length ? reminderText(list, { test: true })
    : '🔔 <b>Тестовое сообщение Olimp</b>\n\nБот подключён: напоминания о сроках будут приходить в этот чат.\n\n'
      + 'Сейчас в плане нет отслеживаемых олимпиад с известными датами. Добавьте олимпиаду в план и оставьте отслеживание включённым.';
  try {
    await messenger.sendToUser(Number(user.maxUserId), text,
      list.length ? reminderKeyboard(list, identity) : identity ? keyboard([[openAppButton('Открыть Olimp', identity, startParam.plan)]]) : undefined);
  } catch (error) {
    const failure = toDeliveryError(error);
    if (failure.unreachable) {
      await db.update(users).set({ botBlockedAt: now.toISOString() }).where(eq(users.id, userId));
      throw new NotificationError('BOT_NOT_CONNECTED', 'Бот пока не может вам написать. Откройте чат с ботом Olimp, нажмите «Начать» и повторите.', 409);
    }
    throw new NotificationError('BOT_DELIVERY_FAILED', 'MAX не принял сообщение. Попробуйте ещё раз через минуту.', 502);
  }
  await db.update(users).set({ botBlockedAt: null }).where(eq(users.id, userId));
  return { sent: true as const, message: list.length ? 'Отправили напоминание о ближайшем сроке из плана. Проверьте чат с ботом Olimp.' : 'Отправили проверочное сообщение. Проверьте чат с ботом Olimp.' };
}

// ---- Called by the bot on updates from MAX ----

/** «Начать» in the bot dialog: the user can now receive messages. Creates the account if the mini-app was never opened. */
export async function recordBotStarted(db: Database, identity: { maxUserId: string; displayName: string }, now = new Date()) {
  const at = now.toISOString();
  const [user] = await db.insert(users).values({ ...identity, botStartedAt: at })
    .onConflictDoUpdate({ target: users.maxUserId, set: { displayName: identity.displayName, botStartedAt: at, botBlockedAt: null } })
    .returning({ id: users.id, registeredAt: users.registeredAt, notificationsEnabled: users.notificationsEnabled });
  return user!;
}
export async function recordBotStopped(db: Database, maxUserId: string, now = new Date()) {
  await db.update(users).set({ botBlockedAt: now.toISOString() }).where(eq(users.maxUserId, maxUserId));
}
export async function userByMaxId(db: Database, maxUserId: string) {
  const [user] = await db.select({ id: users.id, notificationsEnabled: users.notificationsEnabled, registeredAt: users.registeredAt })
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
export async function trackedOlympiads(db: Database, userId: string) {
  return db.select({ id: olympiads.id, title: olympiads.title }).from(planItems).innerJoin(olympiads, eq(olympiads.id, planItems.olympiadId))
    .where(and(eq(planItems.userId, userId), eq(planItems.tracking, true))).orderBy(planItems.savedAt);
}
