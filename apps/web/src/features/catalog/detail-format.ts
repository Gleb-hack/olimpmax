import type { z } from 'zod';
import type { OlympiadDetail, Stage } from '@olimp/contracts';
import { formatDay } from '../../lib/format';

type Detail = z.infer<typeof OlympiadDetail>;
/** Stages the card shows: the schedule chosen by the API (olympiads_clean or olimpiada.ru) plus checked dates. */
export function primaryStages(item: Pick<Detail, 'stages' | 'scheduleSource'>) {
  const origin = item.scheduleSource === 'reference' ? 'reference' : 'csv';
  return item.stages.filter(stage => stage.origin === origin || stage.verification === 'verified');
}
/** Why the reference schedule is not shown although the series has one. */
export function hiddenReferenceNote(item: Pick<Detail, 'stages' | 'scheduleSource' | 'seriesInfo'>) {
  if (item.scheduleSource === 'reference' || !item.stages.some(stage => stage.origin === 'reference')) return null;
  const quality = item.seriesInfo?.scheduleQuality;
  if (quality === 'placeholder') return 'Даты из справочника проекта похожи на шаблон и ждут проверки, поэтому показано расписание olimpiada.ru.';
  if (quality === 'outdated') return 'Даты из справочника проекта относятся к прошлому сезону, поэтому показано расписание olimpiada.ru.';
  if (quality === 'hidden') return null;
  return 'Даты из справочника проекта расходятся с расписанием этой олимпиады на olimpiada.ru, поэтому показано расписание olimpiada.ru.';
}
export function registrationLabel(item: Pick<Detail, 'stages' | 'calendarState' | 'scheduleSource'>, today?: string) {
  if (item.calendarState === 'not_held') return 'Проведение не запланировано';
  const verified = registrationDeadline(item, today);
  if (verified) return formatDay(verified);
  const dates = primaryStages(item).filter(stage => stage.kind === 'registration' && stage.verification !== 'verified' && stage.rawDates)
    .map(stage => `${stage.name || 'Регистрация'}: ${stage.rawDates}`);
  return dates.join(' · ') || 'В расписании не указан';
}

export function registrationDeadline(item: Pick<z.infer<typeof OlympiadDetail>, 'stages' | 'calendarState'>, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })) {
  if (item.calendarState === 'not_held' || item.calendarState === 'needs_review') return null;
  return item.stages.filter(stage => stage.kind === 'registration' && stage.verification === 'verified' && stage.endsOn && stage.endsOn >= today)
    .map(stage => stage.endsOn!).sort()[0] ?? null;
}

export function stageSummary(stages: z.infer<typeof Stage>[]) {
  const names = [...new Set(stages.filter(stage => stage.kind === 'competition').map(stage => stage.name).filter((name): name is string => !!name))];
  if (!names.length) return 'В расписании не указаны';
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} · ещё ${names.length - 2}` : names.join(' · ');
}
