import type { Olympiad } from './api';

export const formats = { online: 'Дистанционно', onsite: 'Очно', hybrid: 'Очно-заочно', unknown: 'Формат не указан' };
export const calendarLabels = {
  unknown: 'Расписание не опубликовано', unverified: 'Расписание опубликовано', verified: 'Есть ближайшее событие',
  needs_review: 'Расписание обновлено', no_upcoming: 'Нет ближайших событий', not_held: 'Не проводится по данным источника',
};
// One label for the user's own grade, shared by the profile card and the grade chip.
export function profileGradeLabel(grade: number | null) { return grade ? `${grade} класс` : null; }
export function levelLabel(item: Pick<Olympiad, 'level' | 'levelStatus'>) {
  const level = item.level?.trim();
  if (!level || level === '—' || level === '-') return 'Не указан';
  const label = level === 'ВсОШ' ? 'ВсОШ' : level.includes('–') ? `${level} уровни` : `${level} уровень`;
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

export function moscowToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
export function daysWord(count: number) {
  const plural = new Intl.PluralRules('ru').select(count);
  return plural === 'one' ? 'день' : plural === 'few' ? 'дня' : 'дней';
}
/**
 * «35 дней до этапа «Муниципальный этап»» for the next stage that has not started yet. Counted from today in Moscow,
 * so a cached card never shows a stale number; null when the API found nothing to count or the stage has already begun.
 */
export function stageCountdown(item: Pick<Olympiad, 'upcomingStage'>, today = moscowToday()) {
  const stage = item.upcomingStage;
  if (!stage) return null;
  const days = daysBetween(today, stage.startsOn);
  if (days < 0) return null;
  const registration = stage.kind === 'registration' && (!stage.name || /^регистрац/i.test(stage.name.trim()));
  const target = registration ? 'начала регистрации' : stage.name ? `этапа «${stage.name}»` : 'следующего этапа';
  return {
    days, estimated: stage.estimated, date: formatDay(stage.startsOn),
    /** The stage alone, for places that already say «до следующего этапа». */
    stage: registration ? 'начало регистрации' : stage.name ?? 'следующий этап',
    value: days === 0 ? 'Сегодня' : `${days} ${daysWord(days)}`,
    text: days === 0 ? (registration ? 'открывается регистрация' : stage.name ? `начинается этап «${stage.name}»` : 'начинается следующий этап') : `до ${target}`,
  };
}
