import type { Olympiad } from './api';

export const formats = { online: 'Дистанционно', onsite: 'Очно', hybrid: 'Очно-заочно', unknown: 'Формат не указан' };
export const calendarLabels = {
  unknown: 'Расписание не опубликовано', unverified: 'Расписание опубликовано', verified: 'Есть ближайшее событие',
  needs_review: 'Расписание обновлено', no_upcoming: 'Нет ближайших событий', not_held: 'Не проводится по данным источника',
};
// One label for the user's own grade, shared by the profile card and the grade chip.
export function profileGradeLabel(grade: number | null) { return grade ? `${grade} класс` : null; }
/** «III уровень», «II–III уровни», «ВсОШ». Only the level itself: the RSOSH list status is not appended. */
export function levelLabel(item: Pick<Olympiad, 'level'>) {
  const level = item.level?.trim();
  if (!level || level === '—' || level === '-') return 'Не указан';
  return level === 'ВсОШ' ? 'ВсОШ' : level.includes('–') ? `${level} уровни` : `${level} уровень`;
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
 * The «N дней» counter for the nearest stage: «35 дней до этапа «Муниципальный этап»» before it begins,
 * «13 дней до конца этапа «Отборочный этап»» while it runs or when only its deadline is known.
 * Counted from today in Moscow, so a cached card never shows a stale number; null when there is nothing ahead.
 */
export function stageCountdown(item: Pick<Olympiad, 'upcomingStage'>, today = moscowToday()) {
  const stage = item.upcomingStage;
  if (!stage) return null;
  const days = daysBetween(today, stage.date);
  if (days < 0) return null;
  const registration = stage.kind === 'registration' && (!stage.name || /^регистрац/i.test(stage.name.trim()));
  const value = days === 0 ? 'Сегодня' : `${days} ${daysWord(days)}`;
  const date = formatDay(stage.date);
  if (stage.event === 'ends') return {
    days, estimated: stage.estimated, date, ending: true, value,
    label: registration ? 'До конца регистрации' : 'До конца этапа', hint: `Окончание — ${date}`,
    /** The stage alone, for places that already say what is counted. */
    stage: registration ? 'регистрация' : stage.name ?? 'текущий этап',
    text: days === 0 ? (registration ? 'последний день регистрации' : stage.name ? `последний день этапа «${stage.name}»` : 'последний день этапа')
      : `до конца ${registration ? 'регистрации' : stage.name ? `этапа «${stage.name}»` : 'текущего этапа'}`,
  };
  return {
    days, estimated: stage.estimated, date, ending: false, value,
    label: 'До следующего этапа', hint: `Начало — ${date}`,
    stage: registration ? 'начало регистрации' : stage.name ?? 'следующий этап',
    text: days === 0 ? (registration ? 'открывается регистрация' : stage.name ? `начинается этап «${stage.name}»` : 'начинается следующий этап')
      : `до ${registration ? 'начала регистрации' : stage.name ? `этапа «${stage.name}»` : 'следующего этапа'}`,
  };
}
