import type { CatalogQuery } from '@olimp/contracts';
import { formats } from '../../lib/format';

/** What the catalog needs of the profile: the preferences behind «Персональная подборка» and the goal behind the order. */
export type CatalogProfile = { grade: number | null; subjects: number[]; online: boolean; onsite: boolean; universities: string[]; directions: string[] };
type Subject = { id: number; name: string };

/**
 * The filters of the olympiad catalog in the URL; «Сбросить» clears all of them. `universities` comes from a university
 * page or a personal selection by the goal, `directions` — from a personal selection by the goal.
 */
export const catalogFilterKeys = ['q', 'subjectIds', 'grades', 'formats', 'levels', 'universities', 'directions'] as const;

export const listParam = (params: URLSearchParams, key: string) => (params.get(key) ?? '').split(',').map(value => value.trim()).filter(Boolean);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));

/**
 * «Персональная подборка» is available when the profile says something to select by: the grade, subjects or the goal
 * (target universities or directions). Otherwise the catalog shows «Персональная подборка недоступна» with a link to the profile.
 */
export const presetAvailable = (profile: CatalogProfile) =>
  profile.grade !== null || profile.subjects.length > 0 || profile.universities.length > 0 || profile.directions.length > 0;

/**
 * The profile as catalog filters: subjects, grade and a format only when exactly one of online/onsite is chosen
 * (the same rule as «Подобрано для тебя»). The goal orders the list («Сначала актуальные» is «под цель») rather than
 * filters it — target universities AND subjects AND grade would leave next to nothing. Only a profile with a goal and
 * nothing else filters by it: olympiads with benefits at the target universities, or suiting the target directions.
 */
export function presetParams(profile: CatalogProfile) {
  const params = new URLSearchParams();
  if (profile.subjects.length) params.set('subjectIds', profile.subjects.join(','));
  if (profile.grade) params.set('grades', String(profile.grade));
  if (profile.online !== profile.onsite) params.set('formats', profile.online ? 'online' : 'onsite');
  if (!params.size && profile.universities.length) params.set('universities', profile.universities.join(','));
  else if (!params.size && profile.directions.length) params.set('directions', profile.directions.join(','));
  return params;
}

/** True when the catalog shows exactly the personal selection: its filters and no others (the order does not matter). */
export function presetApplied(params: URLSearchParams, profile: CatalogProfile) {
  if (!presetAvailable(profile)) return false;
  const preset = presetParams(profile);
  return catalogFilterKeys.every(key => sameSet(listParam(params, key), listParam(preset, key)));
}

/** «11 класс · Информатика, Математика»; the goal when the profile has nothing else. */
export function presetSummary(profile: CatalogProfile, subjects: Subject[]) {
  const names = profile.subjects.map(id => subjects.find(subject => subject.id === id)?.name).filter((name): name is string => !!name);
  const shown = names.length > 3 ? [...names.slice(0, 3), `ещё ${names.length - 3}`] : names;
  const format = profile.online !== profile.onsite ? (profile.online ? formats.online : formats.onsite).toLocaleLowerCase('ru') : null;
  const parts = [profile.grade ? `${profile.grade} класс` : null, shown.join(', ') || null, format].filter((part): part is string => !!part);
  if (parts.length) return parts.join(' · ');
  return profile.universities.length ? 'Олимпиады с льготами в твоих целевых вузах' : profile.directions.length ? 'Олимпиады под твои направления' : '';
}

/** The order of the olympiad catalog (Figma «Popup — Сортировка»). «Сначала актуальные» follows the goal when there is one. */
export type OlympiadSortChoice = 'relevant' | 'deadline' | 'level' | 'name';
export const olympiadSorts: { value: OlympiadSortChoice; label: string; description: string }[] = [
  { value: 'relevant', label: 'Сначала актуальные', description: 'Рекомендованные под твой профиль' },
  { value: 'deadline', label: 'По дедлайну регистрации', description: 'Сначала те, что скоро закрываются' },
  { value: 'level', label: 'По уровню', description: 'Сначала олимпиады I уровня' },
  { value: 'name', label: 'По алфавиту', description: 'От А до Я' },
];
/** The `sort` of the URL as a choice of the popup; old links with `goal`, `complete` or `rating` read as «Сначала актуальные». */
export function sortChoice(params: URLSearchParams): OlympiadSortChoice {
  const sort = params.get('sort');
  return sort === 'deadline' || sort === 'level' || sort === 'name' ? sort : 'relevant';
}
/** What the API gets for a choice: «Сначала актуальные» is the goal order with a goal in the profile, the most complete cards otherwise. */
export const apiSort = (choice: OlympiadSortChoice, withGoal: boolean): CatalogQuery['sort'] =>
  choice === 'relevant' ? (withGoal ? 'goal' : 'complete') : choice;

/** Level options of the popup (Figma «Popup — Уровень») and the RSOSH, which the source data has as a level of its own. */
export const levelChoices = [
  { value: 'I', label: 'I уровень' }, { value: 'II', label: 'II уровень' }, { value: 'III', label: 'III уровень' }, { value: 'ВсОШ', label: 'ВсОШ' },
] as const;
/**
 * The levels the API filters by: «I уровень» also finds «I–II» and «I–III» — such an olympiad has level I in some subjects.
 * The URL keeps what the pupil chose.
 */
export function apiLevels(chosen: string[]) {
  const ranges: Record<string, string[]> = { I: ['I', 'I–II', 'I–III'], II: ['II', 'I–II', 'II–III', 'I–III'], III: ['III', 'II–III', 'I–III'] };
  return [...new Set(chosen.flatMap(level => ranges[level] ?? [level]))];
}

/** Format options of the popup (Figma «Popup — Формат»). */
export const formatChoices = [
  { value: 'onsite', label: formats.onsite }, { value: 'online', label: formats.online }, { value: 'hybrid', label: formats.hybrid },
] as const;

/** «Математика», «Математика +2»: the label of a filter chip with the chosen values; the name of the filter when nothing is chosen. */
export function chipLabel(placeholder: string, chosen: string[]) {
  if (!chosen.length) return placeholder;
  return chosen.length === 1 ? chosen[0]! : `${chosen[0]} +${chosen.length - 1}`;
}

/** The request of the olympiad catalog: the URL filters, levels widened for the API, the goal and the order. */
export function catalogRequest(params: URLSearchParams, profile: CatalogProfile, pageSize = 20) {
  const query = new URLSearchParams();
  for (const key of catalogFilterKeys) { const value = params.get(key); if (value) query.set(key, value); }
  const levels = listParam(params, 'levels');
  if (levels.length) query.set('levels', apiLevels(levels).join(','));
  if (profile.universities.length) query.set('goalUniversities', profile.universities.join(','));
  if (profile.directions.length) query.set('goalDirections', profile.directions.join(','));
  const withGoal = profile.universities.length > 0 || profile.directions.length > 0;
  const sort = apiSort(sortChoice(params), withGoal);
  if (sort !== 'complete') query.set('sort', sort);
  const page = params.get('page');
  if (page) query.set('page', page);
  query.set('pageSize', String(pageSize));
  return query;
}

/** «Найдено 4 олимпиады под твой профиль», «Найдена 1 олимпиада под твой профиль». */
export function presetResultText(total: number) {
  const form = new Intl.PluralRules('ru').select(total);
  const word = form === 'one' ? 'олимпиада' : form === 'few' ? 'олимпиады' : 'олимпиад';
  return `${form === 'one' ? 'Найдена' : 'Найдено'} ${total} ${word} под твой профиль`;
}
