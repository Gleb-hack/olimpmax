import type { CatalogQuery } from '@olimp/contracts';
import type { Olympiad, PlanEntry } from '../../lib/api';
import { dateParts } from '../../lib/format';
import { eventTiming } from '../plan/plan-card-format';

/** A verified plan event from /me/plan/events. */
export type PlanEventItem = { olympiadId: number; stageId: string; name: string | null; date: string; kind: 'starts' | 'ends' };

/** One row of «Не пропусти» (Figma «Олимп — Обзор», DueRow): the date badge, the olympiad and what happens then. */
export type DueItem = { olympiadId: number; date: string; month: string; day: string; title: string; note: string; estimated: boolean };

type Candidate = { date: string; name: string | null; kind: 'starts' | 'ends'; stageKind: 'registration' | 'competition' | 'other' | null; estimated: boolean };

const lower = (text: string) => text.charAt(0).toLocaleLowerCase('ru') + text.slice(1);
const upper = (text: string) => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1);

/** «дедлайн регистрации», «старт регистрации», «отборочный этап», «окончание этапа». */
export function dueMoment(candidate: Pick<Candidate, 'name' | 'kind' | 'stageKind'>) {
  const registration = candidate.stageKind === 'registration' || (!candidate.stageKind && /^регистрац/i.test(candidate.name?.trim() ?? ''));
  if (registration) return candidate.kind === 'ends' ? 'дедлайн регистрации' : 'старт регистрации';
  const name = candidate.name?.trim();
  if (candidate.kind === 'ends') return name ? `завершается ${lower(name)}` : 'окончание этапа';
  return name ? lower(name) : 'начало этапа';
}

/** The nearest dated moment of one tracked plan olympiad: verified event, then the counted stage, then the plan calendar. */
function nearest(entry: PlanEntry, events: PlanEventItem[], today: string): Candidate | null {
  const stageKind = (stageId: string) => entry.stages.find(stage => stage.id === stageId)?.kind ?? null;
  const verified = events.filter(event => event.olympiadId === entry.olympiad.id && event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (verified) return { date: verified.date, name: verified.name, kind: verified.kind, stageKind: stageKind(verified.stageId), estimated: false };
  const stage = entry.olympiad.upcomingStage;
  if (stage && stage.date >= today) return { date: stage.date, name: stage.name, kind: stage.event, stageKind: stage.kind, estimated: stage.estimated };
  const dated = (entry.calendarEvents ?? []).filter(event => event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (dated) return { date: dated.date, name: dated.name, kind: dated.kind === 'ends' ? 'ends' : 'starts', stageKind: dated.stageKind, estimated: dated.estimated };
  return null;
}

/**
 * «Не пропусти»: the nearest dates of the tracked olympiads in the plan, one row per olympiad, soonest first.
 * A date without a year in the source (estimated) reads «Примерно через …».
 */
export function dueItems(entries: PlanEntry[], events: PlanEventItem[], today: string, limit = 2): DueItem[] {
  return entries.filter(entry => entry.tracking).flatMap(entry => {
    const moment = nearest(entry, events, today);
    if (!moment) return [];
    const timing = eventTiming(moment.date, today);
    const parts = dateParts(moment.date);
    const when = moment.estimated ? `примерно ${timing.relative}` : timing.urgency ?? timing.relative;
    return [{
      olympiadId: entry.olympiad.id, date: moment.date, month: parts.month, day: parts.day, estimated: moment.estimated,
      title: entry.olympiad.title, note: `${upper(when)} · ${dueMoment(moment)}`,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.olympiadId - b.olympiadId).slice(0, limit);
}

type Preferences = { grade: number | null; subjects: number[]; online: boolean; onsite: boolean };

/** True when the profile says enough for a personal selection. */
export const hasPreferences = (profile: Preferences) => profile.grade !== null || profile.subjects.length > 0;

/**
 * «Подобрано для тебя»: the catalog filtered the way the assistant fills in missing criteria from the profile
 * (subjects, grade, and a format only when exactly one of online/onsite is chosen).
 */
export function recommendationQuery(profile: Preferences, pageSize = 6) {
  const query = new URLSearchParams();
  if (profile.subjects.length) query.set('subjectIds', profile.subjects.join(','));
  if (profile.grade) query.set('grades', String(profile.grade));
  if (profile.online !== profile.onsite) query.set('formats', profile.online ? 'online' : 'onsite');
  query.set('sort', 'complete' satisfies CatalogQuery['sort']);
  query.set('pageSize', String(pageSize));
  return query.toString();
}

/** New suggestions first; olympiads that no longer take place are left out. */
export function pickRecommendations(items: Olympiad[], savedIds: Set<number>, limit = 2) {
  const open = items.filter(item => item.calendarState !== 'not_held');
  return [...open.filter(item => !savedIds.has(item.id)), ...open.filter(item => savedIds.has(item.id))].slice(0, limit);
}

/** «Поручи это Олимпу»: each action sends a ready question; the server adds the profile and the plan to it. */
export const olimpActions = [
  { id: 'plan', icon: 'calendar', tone: 'blue', title: 'Составить план', subtitle: 'Расставить приоритеты и дедлайны',
    prompt: 'Составь план подготовки по олимпиадам из моего плана: расставь приоритеты и ближайшие дедлайны.' },
  { id: 'chances', icon: 'trending-up', tone: 'green', title: 'Оценить шансы', subtitle: 'Анализ твоей готовности к олимпиаде',
    prompt: 'Оцени мои шансы на олимпиадах из моего плана с учётом моего класса и предметов.' },
  { id: 'university', icon: 'graduation-cap', tone: 'amber', title: 'Подобрать вуз под цель', subtitle: 'Куда поступить с твоими результатами',
    prompt: 'Какие вузы дают льготы за олимпиады из моего плана? Подбери вузы под мою цель.' },
] as const;
