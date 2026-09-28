import type { z } from 'zod';
import type { Stage, NextEvent, CalendarState, ScheduleStatus, UpcomingStage } from '../../../../packages/contracts/src/index.js';
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
/**
 * The next stage that has not started yet, for the «N дней до этапа» counter.
 * Calendars from olimpiada.ru and olympiads_clean usually omit the year: it is taken from the school season the schedule
 * was checked in (1 August — 31 July), and the result is marked `estimated`. Verified stages keep their exact dates.
 * Stages given only as a deadline («До 1 ноя») have no known start and are skipped; null — nothing reliable to count.
 */
export function upcomingStage(stages: CalendarStage[], options: {
  scheduleSource: 'catalog' | 'reference'; statusRaw: string; calendarState: z.infer<typeof CalendarState>; anchor: string; today: string;
}): z.infer<typeof UpcomingStage> | null {
  if (options.calendarState === 'not_held') return null;
  const origin = options.scheduleSource === 'reference' ? 'reference' : 'csv';
  const inferYears = options.scheduleSource === 'reference' || !staleStatus.test(options.statusRaw);
  const [anchorYear, anchorMonth] = options.anchor.split('-').map(Number) as [number, number];
  const seasonYear = anchorMonth >= 8 ? anchorYear : anchorYear - 1;
  const iso = (d: DayMonth, year: number) => {
    const date = new Date(Date.UTC(year, d.month - 1, d.day));
    return date.getUTCMonth() === d.month - 1 ? date.toISOString().slice(0, 10) : null;
  };
  // Nothing more than eleven months ahead: such a date belongs to another season.
  const horizon = addDays(options.today, 335);
  const found: z.infer<typeof UpcomingStage>[] = [];
  const own = stages.filter(stage => stage.origin === origin);
  for (const stage of stages) {
    if (stage.verification === 'verified') {
      if (stage.beginsOn) found.push({ name: stage.name, kind: stage.kind, startsOn: stage.beginsOn, estimated: false });
      continue;
    }
    if (stage.origin !== origin || stage.verification === 'needs_review' || !stage.rawDates) continue;
    const dates = parseRuDates(stage.rawDates);
    const start = dates ? dates.from ?? (dates.open ? null : dates.to) : null;
    if (!start) continue;
    const name = stageTitle(stage, own);
    if (start.year !== null) { const day = iso(start, start.year); if (day) found.push({ name, kind: stage.kind, startsOn: day, estimated: false }); continue; }
    if (!inferYears) continue;
    const day = iso(start, start.month >= 8 ? seasonYear : seasonYear + 1);
    if (day) found.push({ name, kind: stage.kind, startsOn: day, estimated: true });
  }
  return found.filter(s => s.startsOn >= options.today && s.startsOn <= horizon)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ?? null;
}
