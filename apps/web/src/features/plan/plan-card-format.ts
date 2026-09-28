import type { PlanEntry } from '../../lib/api';

export type PlanCardEvent = NonNullable<PlanEntry['olympiad']['nextEvent']>;

export function eventTiming(date: string, today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const unit = (count: number) => { const plural = new Intl.PluralRules('ru').select(count); return plural === 'one' ? 'день' : plural === 'few' ? 'дня' : 'дней'; };
  return {
    relative: days === 0 ? 'сегодня' : days > 0 ? `через ${days} ${unit(days)}` : `${-days} ${unit(-days)} назад`,
    urgency: days >= 0 && days <= 3 ? days === 0 ? 'сегодня' : days === 1 ? 'остался 1 день' : `осталось ${days} дня` : null,
  };
}

export function eventLabel(entry: Pick<PlanEntry, 'stages'>, event: PlanCardEvent) {
  const stage = entry.stages.find(stage => stage.id === event.stageId);
  if (stage?.kind === 'registration') return event.kind === 'ends' ? 'Дедлайн регистрации' : 'Начало регистрации';
  return event.kind === 'ends' ? 'Окончание этапа' : 'Начало этапа';
}

/**
 * The day shown in the card's date tile: the tracked next event, otherwise the stage the countdown counts to,
 * otherwise the first upcoming date of the plan calendar. Null only when the olympiad has no future dates at all.
 */
export function planCardDate(entry: Pick<PlanEntry, 'olympiad' | 'calendarEvents'>, next: PlanCardEvent | null | undefined, today: string) {
  if (next) return next.date;
  const upcoming = entry.olympiad.upcomingStage?.date;
  if (upcoming && upcoming >= today) return upcoming;
  return (entry.calendarEvents ?? []).map(event => event.date).filter(date => date >= today).sort()[0] ?? null;
}
