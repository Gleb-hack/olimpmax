import type { z } from 'zod';
import type { CalendarEvent } from '../../../../../packages/contracts/src/index.js';

type Event = z.infer<typeof CalendarEvent>;
type StageKind = Event['stageKind'];
type EventKind = Event['kind'];

/**
 * A plan olympiad as the reminder rules see it: the same dated events the plan calendar shows.
 * `status` (plan status, default planned): a registered pupil gets no registration reminders, a finished olympiad none at all.
 */
export type ReminderItem = { olympiadId: number; title: string; tracking: boolean; events: Event[]; status?: PlanStatus };
type PlanStatus = 'planned' | 'registered' | 'in_progress' | 'done';
export type DueReminder = {
  olympiadId: number; title: string;
  /** Stable across re-imports (stage ids of the reference layer are not): kind of stage, kind of event, date. */
  eventKey: string; eventDate: string;
  /** The days-before threshold that fired (7, 3, 1, 0); for previews — the actual number of days. */
  bucket: number; daysLeft: number;
  stageKind: StageKind; eventKind: EventKind; stageName: string | null; estimated: boolean;
};

/**
 * How many days before an event the bot writes. A reminder fires once per threshold: a user who adds an olympiad
 * five days before the deadline gets the «7» reminder next morning, then «3», «1» and «0».
 * The end of a competition stage matters only for long windows (an online round «с 1 по 20 октября»);
 * see `WINDOW_DAYS`.
 */
export const REMINDER_OFFSETS: Record<StageKind, Partial<Record<EventKind, readonly number[]>>> = {
  registration: { ends: [7, 3, 1, 0], day: [3, 1, 0], starts: [0] },
  competition: { starts: [3, 1, 0], day: [3, 1, 0], ends: [1] },
  other: { starts: [1], day: [1] },
};
/** A competition stage this long or longer is a window for submitting work: its last day deserves a reminder. */
export const WINDOW_DAYS = 5;

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86_400_000);
}
/** The smallest threshold that still covers `daysLeft`, or null when the event is too far or already past. */
export function bucketFor(offsets: readonly number[], daysLeft: number) {
  if (daysLeft < 0) return null;
  const fitting = offsets.filter(offset => offset >= daysLeft);
  return fitting.length ? Math.min(...fitting) : null;
}

const toDue = (item: ReminderItem, event: Event, daysLeft: number, bucket: number): DueReminder => ({
  olympiadId: item.olympiadId, title: item.title, eventKey: `${event.stageKind}:${event.kind}:${event.date}`, eventDate: event.date,
  bucket, daysLeft, stageKind: event.stageKind, eventKind: event.kind, stageName: event.name, estimated: event.estimated,
});
const order = (a: DueReminder, b: DueReminder) => a.eventDate.localeCompare(b.eventDate)
  || Number(b.eventKind === 'ends') - Number(a.eventKind === 'ends') || a.olympiadId - b.olympiadId || a.eventKey.localeCompare(b.eventKey);
function unique(list: DueReminder[]) {
  const seen = new Set<string>();
  return list.filter(due => { const key = `${due.olympiadId}|${due.eventKey}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Everything the morning run should remind about today. Only tracked plan items; estimated dates are optional. */
export function dueReminders(items: ReminderItem[], today: string, options: { includeEstimated: boolean }) {
  const due: DueReminder[] = [];
  for (const item of items) {
    if (!item.tracking || item.status === 'done') continue;
    const registered = item.status !== undefined && item.status !== 'planned';
    const starts = new Map(item.events.filter(e => e.kind === 'starts').map(e => [e.stageId, e.date]));
    for (const event of item.events) {
      if (event.estimated && !options.includeEstimated) continue;
      if (registered && event.stageKind === 'registration') continue;
      if (event.stageKind === 'competition' && event.kind === 'ends') {
        const start = starts.get(event.stageId);
        if (!start || daysBetween(start, event.date) < WINDOW_DAYS - 1) continue;
      }
      const offsets = REMINDER_OFFSETS[event.stageKind][event.kind];
      if (!offsets) continue;
      const daysLeft = daysBetween(today, event.date);
      const bucket = bucketFor(offsets, daysLeft);
      if (bucket !== null) due.push(toDue(item, event, daysLeft, bucket));
    }
  }
  return unique(due.sort(order));
}

/**
 * The dates of one plan olympiad the pupil should know about, as stable keys (`eventKey`): future events that the
 * reminders would cover — tracked, not finished, registration dates only until the pupil registered. Sorted, unique.
 * Stored in `plan_items.events_snapshot`; a later difference means the schedule changed.
 */
export function eventsSnapshot(item: ReminderItem, today: string, options: { includeEstimated: boolean }) {
  const registered = item.status !== undefined && item.status !== 'planned';
  const keys = item.events.filter(event => event.date >= today && (!event.estimated || options.includeEstimated)
    && !(registered && event.stageKind === 'registration')).map(event => `${event.stageKind}:${event.kind}:${event.date}`);
  return [...new Set(keys)].sort();
}

/** How long after a date passed a new date of the same kind still counts as its extension. */
export const EXTENSION_DAYS = 14;
/** A date that moved or appeared: the event as it is now and, when it replaced exactly one old date of the same kind, that date. */
export type ChangedEvent = DueReminder & { previousDate: string | null };
export type ScheduleChange = { olympiadId: number; title: string; events: ChangedEvent[]; snapshot: string[] };

/**
 * What changed in the dates of a plan olympiad since the stored snapshot. Only new or moved dates make a notice:
 * a date that simply vanished from the source is more often a data slip than a cancelled round, so it only
 * updates the snapshot quietly (`events` empty). null — nothing to do (no snapshot yet is handled by the caller,
 * no dates at all now, or no difference).
 */
export function scheduleChange(item: ReminderItem, previous: readonly string[], today: string, options: { includeEstimated: boolean }): ScheduleChange | null {
  if (!item.tracking || item.status === 'done') return null;
  const snapshot = eventsSnapshot(item, today, options);
  // Everything disappeared at once: an empty or broken import, not a real change. Keep the old snapshot.
  if (!snapshot.length) return null;
  const dateOf = (key: string) => key.split(':')[2] ?? '';
  const kindOf = (key: string) => key.split(':').slice(0, 2).join(':');
  const now = new Set(snapshot);
  const added = snapshot.filter(key => !previous.includes(key));
  const vanished = previous.filter(key => dateOf(key) >= today && !now.has(key));
  // Dates simply passing is no change; the snapshot keeps them until something else moves.
  if (!added.length && !vanished.length) return null;
  // Old dates a new one may replace: the future ones that vanished and ones that passed lately — a deadline is often
  // extended after it passed («регистрация продлена до 12 октября»). An older past date is history: a new date then
  // is a new round, not a move.
  const replaced = previous.filter(key => !now.has(key) && daysBetween(dateOf(key), today) <= EXTENSION_DAYS);
  const events: ChangedEvent[] = [];
  for (const key of added) {
    const event = item.events.find(e => `${e.stageKind}:${e.kind}:${e.date}` === key);
    if (!event) continue;
    const sameKindAdded = added.filter(k => kindOf(k) === kindOf(key)).length;
    const sameKindReplaced = replaced.filter(k => kindOf(k) === kindOf(key));
    // «Регистрация до 12 октября (было 4 октября)» only when the pairing is unambiguous.
    const previousDate = sameKindAdded === 1 && sameKindReplaced.length === 1 ? dateOf(sameKindReplaced[0]!) : null;
    events.push({ ...toDue(item, event, daysBetween(today, event.date), 0), previousDate });
  }
  return { olympiadId: item.olympiadId, title: item.title, events: events.sort(order), snapshot };
}

/** Future events of tracked items within `horizon` days, nearest first: the /plan command and the test message. */
export function upcomingEvents(items: ReminderItem[], today: string, horizon: number, options: { includeEstimated: boolean }) {
  const list: DueReminder[] = [];
  for (const item of items) {
    if (!item.tracking) continue;
    for (const event of item.events) {
      if (event.estimated && !options.includeEstimated) continue;
      const daysLeft = daysBetween(today, event.date);
      if (daysLeft >= 0 && daysLeft <= horizon) list.push(toDue(item, event, daysLeft, daysLeft));
    }
  }
  return unique(list.sort(order));
}
