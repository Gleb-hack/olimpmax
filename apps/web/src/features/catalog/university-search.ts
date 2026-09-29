import { universityRank, type University } from '../profile/goal-format';

export type UniversitySort = 'name' | 'programs' | 'olympiads';
export const universitySorts: { value: UniversitySort; label: string }[] = [
  { value: 'name', label: 'По названию' },
  { value: 'olympiads', label: 'Больше олимпиад с льготами' },
  { value: 'programs', label: 'Больше программ' },
];

export type UniversityFilter = { q: string; city: string; sort: UniversitySort; only?: string[] };

/**
 * The university list of the catalog: search by name, full name and city (the same match as the goal picker),
 * the city filter, «Мои вузы» (`only`) and the order. With a query the best matches go first.
 */
export function filterUniversities(items: University[], filter: UniversityFilter) {
  const ranked = items.flatMap(item => {
    if (filter.city && item.city !== filter.city) return [];
    if (filter.only && !filter.only.includes(item.slug)) return [];
    const rank = universityRank(item, filter.q);
    return rank === null ? [] : [{ item, rank }];
  });
  const byName = (a: University, b: University) => a.name.localeCompare(b.name, 'ru');
  const bySort = (a: University, b: University) => filter.sort === 'programs' ? (b.programCount ?? 0) - (a.programCount ?? 0)
    : filter.sort === 'olympiads' ? b.olympiadCount - a.olympiadCount : 0;
  return ranked.sort((a, b) => (filter.q.trim() ? a.rank - b.rank : 0) || bySort(a.item, b.item) || byName(a.item, b.item)).map(entry => entry.item);
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
