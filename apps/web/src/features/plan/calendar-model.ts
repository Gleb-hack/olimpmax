import type { PlanEntry } from '../../lib/api';

export type CalendarItem = {
  key: string; date: string; olympiadId: number; title: string; estimated: boolean;
  tone: 'registration' | 'competition'; label: string;
};
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
      title: entry.olympiad.title, estimated: event.estimated, tone: registration ? 'registration' as const : 'competition' as const, label };
  })).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ru'));
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
export function visibleItems(items: CalendarItem[], shown: MonthRef, today: string, selected: string | null) {
  if (selected) return { heading: `События ${dayTitle(selected)}`, items: items.filter(item => item.date === selected) };
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
