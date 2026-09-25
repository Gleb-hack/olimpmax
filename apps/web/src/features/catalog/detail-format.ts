import type { z } from 'zod';
import type { OlympiadDetail, Stage } from '@olimp/contracts';
import { formatDay } from '../../lib/format';

export function registrationLabel(item: Pick<z.infer<typeof OlympiadDetail>, 'stages' | 'calendarState'>, today?: string) {
  if (item.calendarState === 'not_held') return 'Проведение не запланировано';
  const verified = registrationDeadline(item, today);
  if (verified) return formatDay(verified);
  const dates = item.stages.filter(stage => stage.kind === 'registration' && stage.origin === 'csv' && stage.rawDates)
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
