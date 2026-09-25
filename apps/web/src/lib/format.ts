import type { Olympiad } from './api';

export const formats = { online: 'Дистанционно', onsite: 'Очно', hybrid: 'Очно-заочно', unknown: 'Формат не указан' };
export const calendarLabels = {
  unknown: 'Расписание не опубликовано', unverified: 'Расписание опубликовано', verified: 'Есть ближайшее событие',
  needs_review: 'Расписание обновлено', no_upcoming: 'Нет ближайших событий', not_held: 'Не проводится по данным источника',
};
export function levelLabel(item: Pick<Olympiad, 'level' | 'levelStatus'>) {
  const level = item.level?.trim();
  if (!level || level === '—' || level === '-') return 'Не указан';
  const label = level === 'ВсОШ' ? 'ВсОШ' : `${level} уровень`;
  return /проект/i.test(item.levelStatus ?? '') ? `${label} · проект РСОШ 2026/27` : label;
}
export function scheduleLabel(item: Pick<Olympiad, 'calendarRaw' | 'calendarState' | 'statusRaw' | 'nextEvent'>) {
  if (item.calendarState === 'not_held') return calendarLabels.not_held;
  if (item.nextEvent) return `${item.nextEvent.name || 'Этап'}: ${item.nextEvent.kind === 'ends' ? 'до' : 'с'} ${formatDay(item.nextEvent.date)}`;
  const lines = item.calendarRaw?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) ?? [];
  if (lines.length) return lines.slice(0, 2).join(' · ') + (lines.length > 2 ? ` · ещё ${lines.length - 2}` : '');
  return item.statusRaw?.trim() || calendarLabels[item.calendarState];
}
export function gradeLabel(item: Pick<Olympiad, 'gradeFrom' | 'gradeTo' | 'classesRaw'>) {
  if (item.gradeFrom && item.gradeTo) return `${item.gradeFrom === item.gradeTo ? item.gradeFrom : `${item.gradeFrom}–${item.gradeTo}`} кл.`;
  return item.classesRaw || 'Классы не указаны';
}
export function formatDay(day: string) { return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }); }
export function dateParts(day: string) {
  const date = new Date(`${day}T12:00:00+03:00`);
  return { day: date.toLocaleDateString('ru-RU', { day: 'numeric', timeZone: 'Europe/Moscow' }), month: date.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'Europe/Moscow' }).replace('.', '') };
}
