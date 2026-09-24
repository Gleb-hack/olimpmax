import type { z } from 'zod';
import type { OlympiadDetail, Stage } from '@olimp/contracts';

export function registrationDeadline(item: Pick<z.infer<typeof OlympiadDetail>, 'stages' | 'calendarState'>, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })) {
  if (item.calendarState === 'not_held' || item.calendarState === 'needs_review') return null;
  return item.stages.filter(stage => stage.kind === 'registration' && stage.verification === 'verified' && stage.endsOn && stage.endsOn >= today)
    .map(stage => stage.endsOn!).sort()[0] ?? null;
}

export function stageSummary(stages: z.infer<typeof Stage>[]) {
  const names = [...new Set(stages.filter(stage => stage.kind === 'competition').map(stage => stage.name).filter((name): name is string => !!name))];
  if (!names.length) return 'Этапы уточняются';
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} · ещё ${names.length - 2}` : names.join(' · ');
}
