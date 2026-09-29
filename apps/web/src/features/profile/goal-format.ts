import type { z } from 'zod';
import type { DirectionSummary, UniversityListResponse } from '@olimp/contracts';

export type Direction = z.infer<typeof DirectionSummary>;
export type University = z.infer<typeof UniversityListResponse>['items'][number];

/** The API limits of the goal in the profile (ProfilePreferences). */
export const goalLimits = { directions: 10, universities: 20 } as const;

const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * The same order as the API search of /directions: code or exact name, start of the name, start of a word,
 * part of the name, then colloquial aliases («прога», «врач») and the group of directions. Null — no match.
 */
export function directionRank(direction: Direction, query: string) {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(direction.name);
  if (direction.code.startsWith(q) || name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(/[\s,()-]+/).some(word => word.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (direction.aliases.some(alias => normalize(alias).startsWith(q))) return 4;
  if (direction.aliases.some(alias => normalize(alias).includes(q)) || normalize(direction.ugsnName).includes(q)) return 5;
  return null;
}

export function universityRank(university: University, query: string) {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(university.name);
  if (name === q || university.slug === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (normalize(university.fullName ?? '').includes(q)) return 3;
  if (normalize(university.city).startsWith(q)) return 4;
  return null;
}

/**
 * Options of a picker: what was chosen when the list opened goes first, so it is not lost among 300 directions;
 * then, without a query, popular items; with a query — the best matches.
 */
export function orderOptions<T>(items: T[], query: string, rank: (item: T, query: string) => number | null, pinned: (item: T) => boolean,
  popular: (item: T) => boolean, compare: (a: T, b: T) => number) {
  return items.flatMap(item => { const r = rank(item, query); return r === null ? [] : [{ item, r }]; })
    .sort((a, b) => Number(pinned(b.item)) - Number(pinned(a.item)) || a.r - b.r || Number(popular(b.item)) - Number(popular(a.item)) || compare(a.item, b.item))
    .map(entry => entry.item);
}

export const educationLevels = { bachelor: 'бакалавриат', specialist: 'специалитет' } as const;
/** «09.03.04 · бакалавриат»: tells apart directions with the same name. */
export const directionNote = (direction: Direction) => `${direction.code} · ${educationLevels[direction.educationLevel]}`;

/** Names in the order the user keeps them; codes and slugs the list no longer has are skipped. */
export function pickByKey<T>(items: T[] | undefined, keys: string[], key: (item: T) => string) {
  const byKey = new Map((items ?? []).map(item => [key(item), item]));
  return keys.flatMap(value => { const item = byKey.get(value); return item ? [item] : []; });
}
