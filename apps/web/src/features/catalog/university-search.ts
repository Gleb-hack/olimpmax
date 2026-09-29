import { universityRank, type University } from '../profile/goal-format';

/** The order of «Вузы» (Figma «Popup — Сортировка (Вузы)»). `programs` stays for old links. */
export type UniversitySort = 'name' | 'city' | 'targets' | 'olympiads' | 'programs';
export const universitySorts: { value: UniversitySort; label: string; description: string }[] = [
  { value: 'name', label: 'По названию', description: 'От А до Я' },
  { value: 'city', label: 'По городу', description: 'Сгруппировать по городам' },
  { value: 'targets', label: 'Сначала целевые', description: 'Твои целевые вузы выше в списке' },
  { value: 'olympiads', label: 'По количеству льгот', description: 'Сначала вузы с большим числом льгот' },
];
export const parseUniversitySort = (value: string | null): UniversitySort =>
  value === 'city' || value === 'targets' || value === 'olympiads' || value === 'programs' ? value : 'name';

/** `targets` — the goal universities of the profile: «Сначала целевые» puts them first, «Целевые вузы» (`only`) shows only them. */
export type UniversityFilter = { q: string; city: string; sort: UniversitySort; only?: string[]; targets?: string[] };

/**
 * The university list of the catalog: search by name, full name and city (the same match as the goal picker),
 * the city filter, «Целевые вузы» (`only`) and the order. With a query the best matches go first.
 */
export function filterUniversities(items: University[], filter: UniversityFilter) {
  const ranked = items.flatMap(item => {
    if (filter.city && item.city !== filter.city) return [];
    if (filter.only && !filter.only.includes(item.slug)) return [];
    const rank = universityRank(item, filter.q);
    return rank === null ? [] : [{ item, rank }];
  });
  const byName = (a: University, b: University) => a.name.localeCompare(b.name, 'ru');
  const targets = filter.targets ?? [];
  const bySort = (a: University, b: University) => filter.sort === 'programs' ? (b.programCount ?? 0) - (a.programCount ?? 0)
    : filter.sort === 'olympiads' ? b.olympiadCount - a.olympiadCount
    : filter.sort === 'city' ? a.city.localeCompare(b.city, 'ru')
    : filter.sort === 'targets' ? Number(targets.includes(b.slug)) - Number(targets.includes(a.slug)) : 0;
  // Grouped by city, the groups keep their order even with a query; within a group the best matches go first.
  const byQuery = (a: { rank: number }, b: { rank: number }) => filter.q.trim() ? a.rank - b.rank : 0;
  return ranked.sort((a, b) => filter.sort === 'city'
    ? bySort(a.item, b.item) || byQuery(a, b) || byName(a.item, b.item)
    : byQuery(a, b) || bySort(a.item, b.item) || byName(a.item, b.item)).map(entry => entry.item);
}

/** Cities with the number of universities, most first, for the city filter. */
export function universityCities(items: Pick<University, 'city'>[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.city, (counts.get(item.city) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([city, count]) => ({ city, count }));
}

const plural = (count: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules('ru').select(count);
  return `${count} ${form === 'one' ? one : form === 'few' ? few : many}`;
};
/** «124 программы», «38 олимпиад с льготами»: the facts of a university card; zero counts are left out. */
export function universityFacts(item: Pick<University, 'programCount' | 'olympiadCount'>) {
  return [
    item.programCount ? plural(item.programCount, 'программа', 'программы', 'программ') : null,
    item.olympiadCount ? `${plural(item.olympiadCount, 'олимпиада', 'олимпиады', 'олимпиад')} с льготами` : null,
  ].filter((fact): fact is string => fact !== null);
}
