import type { z } from 'zod';
import { benefitLabel, type Benefit as BenefitSchema, type OlympiadDetail, type Stage } from '@olimp/contracts';
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

type Benefit = z.infer<typeof BenefitSchema>;
export type UniversityBenefits = { slug: string; name: string; city: string; initials: string; summary: string; organizer: boolean; lines: { title: string; requirement: string }[] };

const prefixes = new Set(['НИУ', 'НИЯУ', 'НИТУ', 'РТУ', 'ФГБОУ', 'им.', 'им']);
/** «МФТИ» → «МФ», «НИУ ВШЭ» → «ВШ», «Финансовый университет» → «ФУ»: the avatar of a university card. */
export function universityInitials(name: string) {
  const words = name.split(/\s+/).filter(word => word && !prefixes.has(word));
  const abbreviation = words.find(word => /^[А-ЯЁA-Z]{2,}$/u.test(word));
  if (abbreviation) return abbreviation.slice(0, 2);
  return words.slice(0, 2).map(word => word.charAt(0).toLocaleUpperCase('ru')).join('') || '?';
}
export const shortBenefit = (b: Pick<Benefit, 'kind' | 'diploma'>) => `${b.kind === 'bvi' ? 'БВИ' : '100 баллов ЕГЭ'}${b.diploma === 'winner' ? ' победителям' : ''}`;
export function requirementText(b: Pick<Benefit, 'requirement' | 'minScore'>) {
  if (!b.requirement) return 'Минимальный балл ЕГЭ для подтверждения не указан';
  return b.minScore === null ? b.requirement : `Подтвердить: ${b.requirement}`;
}
const words = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
// Words every other university has in its full name: they say nothing about which university it is.
const genericWords = new Set(['национальный', 'исследовательский', 'университет', 'государственный', 'федеральный', 'российский', 'имени', 'институт', 'академия']);
/** The olympiad's own university: «МГИМО (У) МИД России» ↔ «МГИМО», or most words of the full name among the organizer's. */
export function isOrganizer(university: Benefit['university'], organizers: string[]) {
  return organizers.some(organizer => {
    const own = new Set(words(organizer));
    if (/^[А-ЯЁA-Z]{3,}$/u.test(university.name) && own.has(university.name.toLocaleLowerCase('ru'))) return true;
    // «(национальный исследовательский университет)» is a status, not part of the name.
    const full = words((university.fullName ?? '').replace(/\([^)]*\)/g, ' ')).filter(word => word.length >= 4 && !genericWords.has(word));
    return full.length >= 2 && full.filter(word => own.has(word)).length / full.length >= 0.7;
  });
}
/**
 * «Вузы с льготами» (Figma «Олимпиада — Физтех»): one card per university, БВИ before 100 баллов.
 * The organizing university goes first, the rest keep alphabetical order.
 */
export function universityBenefits(items: Benefit[], organizers: string[] = []): UniversityBenefits[] {
  const groups = new Map<string, UniversityBenefits & { raw: Benefit[] }>();
  for (const item of items) {
    const group = groups.get(item.university.slug) ?? { slug: item.university.slug, name: item.university.name, city: item.university.city,
      initials: universityInitials(item.university.name), summary: '', organizer: isOrganizer(item.university, organizers), lines: [], raw: [] };
    group.raw.push(item);
    groups.set(item.university.slug, group);
  }
  return [...groups.values()].sort((a, b) => Number(b.organizer) - Number(a.organizer)).map(({ raw, ...group }) => {
    const sorted = [...raw].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'bvi' ? -1 : 1) || (a.diploma === b.diploma ? 0 : a.diploma === 'any' ? -1 : 1));
    return { ...group, summary: [...new Set(sorted.map(shortBenefit))].join(' · '),
      lines: sorted.map(b => ({ title: benefitLabel(b), requirement: requirementText(b) })) };
  });
}
