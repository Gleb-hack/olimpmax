import type { Olympiad } from './api';

export const formats = { online: 'Дистанционно', onsite: 'Очно', hybrid: 'Очно-заочно', unknown: 'Формат не указан' };
export const calendarLabels = {
  unknown: 'Расписание пока неизвестно', unverified: 'Даты требуют уточнения', verified: 'Есть проверенная дата',
  needs_review: 'Расписание изменилось', no_upcoming: 'Нет ближайших событий', not_held: 'Не проводится по данным источника',
};
export function gradeLabel(item: Pick<Olympiad, 'gradeFrom' | 'gradeTo' | 'classesRaw'>) {
  if (item.gradeFrom && item.gradeTo) return `${item.gradeFrom === item.gradeTo ? item.gradeFrom : `${item.gradeFrom}–${item.gradeTo}`} кл.`;
  return item.classesRaw || 'Классы не указаны';
}
export function formatDay(day: string) { return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }); }
export function dateParts(day: string) {
  const date = new Date(`${day}T12:00:00+03:00`);
  return { day: date.toLocaleDateString('ru-RU', { day: 'numeric', timeZone: 'Europe/Moscow' }), month: date.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'Europe/Moscow' }).replace('.', '') };
}
