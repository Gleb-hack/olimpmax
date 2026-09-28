import type { z } from 'zod';
import type { Stage, NextEvent, CalendarState, ScheduleStatus, UpcomingStage, CalendarEvent } from '../../../../packages/contracts/src/index.js';
import { parseRuDates, type DayMonth } from '../reference/model.js';
type CalendarStage = z.infer<typeof Stage>;
export function moscowToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(day: string, count: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function stageEvents(stages: CalendarStage[], from: string, through?: string): z.infer<typeof NextEvent>[] {
  const events: z.infer<typeof NextEvent>[] = [];
  for (const stage of stages) {
    if (stage.verification !== 'verified' || !stage.sourceUrl) continue;
    for (const [kind, date] of [['starts', stage.beginsOn], ['ends', stage.endsOn]] as const) {
      if (!date || date < from || (through && date > through)) continue;
      events.push({ stageId: stage.id, name: stage.name, kind, date, timezone: 'Europe/Moscow', sourceUrl: stage.sourceUrl });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'ends' ? -1 : 1) || a.stageId.localeCompare(b.stageId));
}
export function calendarSummary(stages: CalendarStage[], status: z.infer<typeof ScheduleStatus>, today: string) {
  const nextEvent = status === 'not_held' ? null : stageEvents(stages, today)[0] ?? null;
  let calendarState: z.infer<typeof CalendarState>;
  if (status === 'not_held') calendarState = 'not_held';
  else if (stages.some(s => s.verification === 'needs_review')) calendarState = 'needs_review';
  else if (nextEvent) calendarState = 'verified';
  else if (stages.some(s => s.verification === 'verified')) calendarState = 'no_upcoming';
  else if (status === 'published') calendarState = 'unverified';
  else calendarState = 'unknown';
  return { nextEvent, calendarState };
}

/** «24.09.2026» (the export's «Дата проверки») or an ISO timestamp → YYYY-MM-DD. */
export function anchorDay(checked: string | undefined, importedAt: string) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(checked?.trim() ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : moscowToday(new Date(importedAt));
}
/**
 * Some olimpiada.ru calendars come as pairs of «Дополнительная дата» lines: the first carries the stage title, the second the
 * dates («Дополнительная дата: Муниципальный тур» + «Дополнительная дата: 20—25 ноя»). Recover the title from the pair.
 */
function stageTitle(stage: CalendarStage, list: CalendarStage[]) {
  if (!stage.name || !/^дополнительная дата$/i.test(stage.name.trim())) return stage.name;
  const previous = list[list.indexOf(stage) - 1];
  const title = previous && /^дополнительная дата$/i.test(previous.name?.trim() ?? '') && previous.rawDates && !parseRuDates(previous.rawDates) ? previous.rawDates.trim() : '';
  return title && title.length <= 120 && !/\d{1,2}\s+(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/i.test(title) ? title : null;
}
// The catalog status says the published calendar is a finished or future cycle, not the current one.
const staleStatus = /следующ\S* цикл|итоги опубликованы|нет ближайших|не проводится|информация ожидается|расписание не опубликовано/i;
type ScheduleOptions = { scheduleSource: 'catalog' | 'reference'; statusRaw: string; calendarState: z.infer<typeof CalendarState>; anchor: string };
/**
 * Every dated moment of the card's schedule for the plan calendar: the start and the end of each stage, or the day
 * of a one-day stage. Calendars from olimpiada.ru and olympiads_clean usually omit the year: it is taken from the school
 * season the schedule was checked in (1 August — 31 July), and such events are marked `estimated`.
 * Verified stages keep their exact dates. A closed cycle («итоги опубликованы») or a not-held olympiad gives no guesses.
 */
export function scheduleEvents(stages: CalendarStage[], options: ScheduleOptions): z.infer<typeof CalendarEvent>[] {
  if (options.calendarState === 'not_held') return [];
  const origin = options.scheduleSource === 'reference' ? 'reference' : 'csv';
  const inferYears = options.scheduleSource === 'reference' || !staleStatus.test(options.statusRaw);
  const [anchorYear, anchorMonth] = options.anchor.split('-').map(Number) as [number, number];
  const seasonYear = anchorMonth >= 8 ? anchorYear : anchorYear - 1;
  const iso = (d: DayMonth) => {
    const year = d.year ?? (d.month >= 8 ? seasonYear : seasonYear + 1);
    const date = new Date(Date.UTC(year, d.month - 1, d.day));
    return date.getUTCMonth() === d.month - 1 ? date.toISOString().slice(0, 10) : null;
  };
  const own = stages.filter(stage => stage.origin === origin);
  const events: z.infer<typeof CalendarEvent>[] = [];
  const push = (stage: CalendarStage, name: string | null, kind: 'starts' | 'ends' | 'day', date: string | null, estimated: boolean) => {
    if (date) events.push({ stageId: stage.id, name, stageKind: stage.kind, kind, date, estimated });
  };
  for (const stage of stages) {
    if (stage.verification === 'verified') {
      if (stage.beginsOn && stage.beginsOn === stage.endsOn) push(stage, stage.name, 'day', stage.beginsOn, false);
      else { push(stage, stage.name, 'starts', stage.beginsOn, false); push(stage, stage.name, 'ends', stage.endsOn, false); }
      continue;
    }
    if (stage.origin !== origin || stage.verification === 'needs_review' || !stage.rawDates) continue;
    const dates = parseRuDates(stage.rawDates);
    if (!dates) continue;
    const yearless = dates.to.year === null || (dates.from !== null && dates.from.year === null);
    if (yearless && !inferYears) continue;
    const name = stageTitle(stage, own);
    if (dates.from) { push(stage, name, 'starts', iso(dates.from), dates.from.year === null); push(stage, name, 'ends', iso(dates.to), dates.to.year === null); }
    else push(stage, name, dates.open ? 'ends' : 'day', iso(dates.to), dates.to.year === null);
  }
  return withoutVerifiedDuplicates(events, new Set(stages.filter(s => s.verification === 'verified').map(s => s.id)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * How far apart a catalog date and a verified date of the same kind of stage may be and still be the same moment.
 * Registration gets a wider window: catalog texts often keep last season's deadline, and there is usually one registration.
 */
export const DUPLICATE_WINDOW_DAYS = { registration: 60, competition: 14, other: 14 } as const;
const startLike = (kind: string) => kind === 'starts' || kind === 'day';
const endLike = (kind: string) => kind === 'ends' || kind === 'day';
const stageName = (name: string | null) => name?.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() || null;
/** «Other» stages in catalog texts are usually rounds («Отборочный этап для 8-10 классов»): compared as competition. */
const kindGroup = (kind: z.infer<typeof CalendarEvent>['stageKind']) => kind === 'registration' ? 'registration' : 'competition';
/**
 * A verified stage and the catalog text usually describe the same moment («до 1 ноя» and the organizer's 31 October).
 * A catalog event is dropped when, for the same kind of stage (registration or rounds):
 * — a verified event of the same kind of moment (start or end) lies within DUPLICATE_WINDOW_DAYS or has the same stage name;
 * — or it falls before the last verified event: the organizer's schedule already covers that part of the season,
 *   and an older catalog date there is stale (a finished cycle, or another profile's dates copied to the whole series).
 * So the calendar, the counter and bot reminders show the verified dates; catalog stages after them (a final not yet
 * announced) stay. Verify a season from its start: verifying only a late stage hides the catalog's earlier rounds.
 */
function withoutVerifiedDuplicates(events: z.infer<typeof CalendarEvent>[], verifiedIds: Set<string>) {
  if (!verifiedIds.size) return events;
  const verified = events.filter(e => verifiedIds.has(e.stageId));
  const last = new Map<string, string>();
  for (const v of verified) { const group = kindGroup(v.stageKind); if (!last.has(group) || v.date > last.get(group)!) last.set(group, v.date); }
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return events.filter(event => {
    if (verifiedIds.has(event.stageId)) return true;
    const group = kindGroup(event.stageKind);
    if (last.has(group) && event.date < last.get(group)!) return false;
    return !verified.some(v => kindGroup(v.stageKind) === group
      && ((startLike(event.kind) && startLike(v.kind)) || (endLike(event.kind) && endLike(v.kind)))
      && (days(v.date, event.date) <= DUPLICATE_WINDOW_DAYS[v.stageKind] || (stageName(v.name) !== null && stageName(v.name) === stageName(event.name))));
  });
}

/**
 * The nearest stage for the «N дней» counter, in the order the schedule goes. A stage that has not begun counts to its start;
 * a running stage, or one given only as a deadline («до 11 октября»), counts to its end — so a running selection round is
 * not skipped in favour of the final. On the same day a deadline goes first. null — nothing reliable ahead.
 */
export function upcomingStage(stages: CalendarStage[], options: ScheduleOptions & { today: string }): z.infer<typeof UpcomingStage> | null {
  // Nothing more than eleven months ahead: such a date belongs to another season.
  const horizon = addDays(options.today, 335);
  const events = scheduleEvents(stages, options);
  const starts = new Map(events.filter(event => event.kind === 'starts').map(event => [event.stageId, event.date]));
  const next = events.filter(event => event.date >= options.today && event.date <= horizon
      && (event.kind !== 'ends' || !starts.has(event.stageId) || starts.get(event.stageId)! < options.today))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.kind === 'ends') - Number(a.kind === 'ends'))[0];
  return next ? { name: next.name, kind: next.stageKind, event: next.kind === 'ends' ? 'ends' : 'starts', date: next.date, estimated: next.estimated } : null;
}
