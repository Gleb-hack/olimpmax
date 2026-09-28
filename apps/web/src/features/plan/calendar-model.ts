import type { PlanEntry } from '../../lib/api';

export type CalendarItem = {
  key: string; date: string; olympiadId: number; title: string; estimated: boolean;
  tone: 'registration' | 'competition'; label: string;
  /** The stage the event belongs to, so the start and the end of one stage can be joined into a period. */
  stage: string; stageName: string; kind: 'starts' | 'ends' | 'day';
};
/** A stage that lasts several days: every day from start to end, both included, belongs to it. */
export type CalendarRange = {
  key: string; olympiadId: number; title: string; tone: CalendarItem['tone']; name: string; start: string; end: string; estimated: boolean;
};
/** How a day of the grid sits inside the periods drawn on it. */
export type RangeDay = { tone: CalendarItem['tone']; start: boolean; end: boolean };
export type MonthRef = { year: number; month: number }; // month: 1–12

/** Events of the olympiads the user tracks, in date order. Paused olympiads stay in the list view only. */
export function planCalendarItems(entries: PlanEntry[]): CalendarItem[] {
  return entries.filter(entry => entry.tracking).flatMap(entry => (entry.calendarEvents ?? []).map(event => {
    const registration = event.stageKind === 'registration';
    const name = event.name?.trim() || 'Этап';
    const label = registration
      ? event.kind === 'starts' ? 'Начало регистрации' : event.kind === 'ends' ? 'Конец регистрации' : 'Регистрация'
      : event.kind === 'starts' ? `${name}: начало` : event.kind === 'ends' ? `${name}: окончание` : name;
    return { key: `${entry.olympiad.id}-${event.stageId}-${event.kind}`, date: event.date, olympiadId: entry.olympiad.id,
      title: entry.olympiad.title, estimated: event.estimated, tone: registration ? 'registration' as const : 'competition' as const, label,
      stage: `${entry.olympiad.id}-${event.stageId}`, stageName: registration ? 'Регистрация' : name, kind: event.kind };
  })).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ru'));
}

const addDays = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** Stages with both a start and a later end become periods, so the days between them are shown too. */
export function planCalendarRanges(items: CalendarItem[]): CalendarRange[] {
  const starts = new Map(items.filter(item => item.kind === 'starts').map(item => [`${item.stage}-${item.tone}`, item]));
  return items.flatMap(end => {
    const start = end.kind === 'ends' ? starts.get(`${end.stage}-${end.tone}`) : undefined;
    if (!start || start.date >= end.date) return [];
    return [{ key: end.stage, olympiadId: end.olympiadId, title: end.title, tone: end.tone, name: end.stageName, start: start.date, end: end.date, estimated: start.estimated || end.estimated }];
  });
}

/** Days covered by periods. Where periods of both kinds overlap, the selection/final one is drawn. */
export function rangeDays(ranges: CalendarRange[]): Map<string, RangeDay> {
  const covered = { competition: new Set<string>(), registration: new Set<string>() };
  for (const range of ranges) {
    // A year is plenty for any stage; the cap only guards against malformed data.
    for (let day = range.start, steps = 0; day <= range.end && steps < 400; day = addDays(day, 1), steps++) covered[range.tone].add(day);
  }
  const result = new Map<string, RangeDay>();
  for (const tone of ['registration', 'competition'] as const) {
    for (const day of covered[tone]) result.set(day, { tone, start: !covered[tone].has(addDays(day, -1)), end: !covered[tone].has(addDays(day, 1)) });
  }
  return result;
}

export function rangeTitle(start: string, end: string) {
  const [from, to] = [dayTitle(start), dayTitle(end)];
  const month = (value: string) => value.split(' ').slice(1).join(' ');
  return month(from) === month(to) && start.slice(0, 4) === end.slice(0, 4) ? `${from.split(' ')[0]}–${to}` : `${from} – ${to}`;
}

/** Periods going on during the day but neither starting nor ending on it. */
export function ongoingItems(ranges: CalendarRange[], day: string): CalendarItem[] {
  return ranges.filter(range => range.start < day && day < range.end).map(range => ({
    key: `${range.key}-during`, date: day, olympiadId: range.olympiadId, title: range.title, estimated: range.estimated, tone: range.tone,
    label: `${range.name}: идёт, ${rangeTitle(range.start, range.end)}`, stage: range.key, stageName: range.name, kind: 'day' as const,
  }));
}

export const monthOf = (day: string): MonthRef => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) });
export const shiftMonth = ({ year, month }: MonthRef, delta: number): MonthRef => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
export const monthKey = ({ year, month }: MonthRef) => `${year}-${String(month).padStart(2, '0')}`;
export const dayKey = ({ year, month }: MonthRef, day: number) => `${monthKey({ year, month })}-${String(day).padStart(2, '0')}`;

/** Weeks of the month, Monday first; null fills the days of neighbouring months. */
export function monthGrid({ year, month }: MonthRef): (number | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function monthTitle({ year, month }: MonthRef) {
  const name = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('ru-RU', { month: 'long', timeZone: 'UTC' });
  return `${name.charAt(0).toLocaleUpperCase('ru')}${name.slice(1)} ${year}`;
}
export function dayTitle(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** What the list under the calendar shows: the chosen day, or what is still ahead in the shown month. */
export function visibleItems(items: CalendarItem[], shown: MonthRef, today: string, selected: string | null, ranges: CalendarRange[] = []) {
  if (selected) return { heading: `События ${dayTitle(selected)}`, items: [...items.filter(item => item.date === selected), ...ongoingItems(ranges, selected)] };
  const prefix = monthKey(shown);
  const inMonth = items.filter(item => item.date.startsWith(prefix));
  const past = prefix < today.slice(0, 7);
  const ahead = past ? inMonth : inMonth.filter(item => item.date >= today);
  return { heading: past ? 'События месяца' : 'Ближайшие события', items: ahead };
}

/** «скоро»: tracked olympiads with a stage date in the next two weeks (exact or taken from the season). */
export function soonCount(entries: PlanEntry[], today: string, days = 14) {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return new Set(planCalendarItems(entries).filter(item => item.date >= today && item.date <= until).map(item => item.olympiadId)).size;
}
