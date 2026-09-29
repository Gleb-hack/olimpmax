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

export type PlanStatus = PlanEntry['status'];
/** The order of the plan list: what is going on now first, then what is only planned; finished olympiads last. */
export const statusOrder: PlanStatus[] = ['in_progress', 'registered', 'planned', 'done'];
export const statusSections: Record<PlanStatus, string> = {
  in_progress: 'Участвую', registered: 'Зарегистрирован', planned: 'Планирую', done: 'Завершено',
};

/** Plan entries by status, in `statusOrder`; empty groups are left out, the order inside a group is kept. */
export function groupByStatus<T extends Pick<PlanEntry, 'status'>>(entries: T[]) {
  return statusOrder.map(status => ({ status, entries: entries.filter(entry => (entry.status ?? 'planned') === status) }))
    .filter(group => group.entries.length > 0);
}

/**
 * Stages a result can be recorded for: the named stages of the schedule the card shows (without registration),
 * in date order, then stages that already have a result but are no longer in the schedule.
 */
export function resultStageOptions(entry: Pick<PlanEntry, 'stages' | 'calendarEvents' | 'results'>) {
  const names = [
    ...[...entry.calendarEvents ?? []].sort((a, b) => a.date.localeCompare(b.date)).filter(event => event.stageKind !== 'registration').map(event => event.name),
    ...entry.stages.filter(stage => stage.kind !== 'registration').map(stage => stage.name),
    ...entry.results.map(result => result.stage),
  ].map(name => name?.trim() ?? '').filter(name => name && !/^регистрац/i.test(name));
  const seen = new Set<string>();
  return names.filter(name => { const key = name.toLocaleLowerCase('ru'); if (seen.has(key)) return false; seen.add(key); return true; });
}

/**
 * Upcoming events worth showing for the entry's status: a registered pupil no longer needs registration dates,
 * a finished olympiad needs none. Used by «Ближайшие этапы».
 */
export function eventRelevant(entry: Pick<PlanEntry, 'status' | 'stages'>, event: Pick<PlanCardEvent, 'stageId'>) {
  if (entry.status === 'done') return false;
  if (entry.status === 'planned' || entry.status === undefined) return true;
  return entry.stages.find(stage => stage.id === event.stageId)?.kind !== 'registration';
}
