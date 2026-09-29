// Matching an olympiad with the pupil's goal: target universities and directions of study.
// buildGoalMatch is pure (unit tests: tests/goal-match.test.ts); goalMatches reads the reference tables.
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/client.js';
import { directions, directionSubjects, olympiadDirections, olympiads, olympiadSeriesLinks, olympiadSubjects, seriesBenefits, subjects, universities } from '../db/schema.js';
import type { GoalMatch, GoalReason } from '../../../../packages/contracts/src/index.js';

type Reason = z.infer<typeof GoalReason>;
export type Goal = { universities?: string[]; directions?: string[] };
export type BenefitFact = { slug: string; name: string; city: string; kind: 'bvi' | 'score_100'; diploma: 'any' | 'winner' };
export type DirectionFact = {
  code: string; name: string; educationLevel: 'bachelor' | 'specialist';
  viaRsosh: boolean; subjectRelevance: 'core' | 'related' | null;
  /** Subjects of the direction (directions.csv): which of them the olympiad has tells the linking subject. */
  core: string[]; related: string[];
};

// A core subject weighs as much as the RSOSH list: the list names some profiles by a group of directions («информатика
// и вычислительная техника») and others by the subject («информатика»), so a lower subject weight put robotics above informatics.
// `main`: the card's subject is the first core subject of the direction (directions.csv lists the main one first: «Информатика»
// for «Программная инженерия», «Математика» for ПМИ), so an informatics olympiad goes above a mathematics or finance one there.
export const goalWeights = { benefit: 6, benefitUniversities: 3, rsosh: 4, core: 4, related: 1, main: 1 } as const;
/**
 * Added once per matched olympiad: a stronger level gives more (ВсОШ and I level first, III last, outside the list nothing).
 * A range counts by its middle: the card level does not say which profile gives the match.
 */
export const levelWeights: Record<string, number> = { 'ВсОШ': 4, 'I': 3, 'I–II': 2, 'II': 2, 'I–III': 2, 'II–III': 1, 'III': 1 };
export const levelWeight = (level: string | null | undefined) => (level && levelWeights[level]) || 0;
const benefitOrder = (b: Pick<BenefitFact, 'kind' | 'diploma'>) => (b.kind === 'bvi' ? 0 : 2) + (b.diploma === 'any' ? 0 : 1);

/** «МГУ им. М.В. Ломоносова» → «МГУ»: the short name reads better inside a sentence. */
export const shortUniversityName = (name: string) => name.replace(/\s+им\.\s.*$/u, '').trim();
/** «КФУ», «КФУ и ВШЭ», «КФУ, ВШЭ и МФТИ», «КФУ, ВШЭ, МФТИ и ещё 2». */
export function joinNames(names: string[], max = 3) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length > max) return `${names.slice(0, max).join(', ')} и ещё ${names.length - max}`;
  return `${names.slice(0, -1).join(', ')} и ${names.at(-1)}`;
}
const quoted = (list: Pick<DirectionFact, 'name'>[]) => joinNames(list.map(d => `«${d.name}»`), 2);
const directionWord = (list: unknown[]) => list.length === 1 ? 'направления' : 'направлений';
const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('ru') + text.slice(1);
const ref = (d: DirectionFact) => ({ code: d.code, name: d.name, educationLevel: d.educationLevel });

function benefitText(kind: BenefitFact['kind'], diploma: BenefitFact['diploma'], names: string[]) {
  const what = kind === 'bvi' ? 'БВИ' : '100 баллов ЕГЭ';
  return `${what}${diploma === 'winner' ? ' победителям' : ''} в ${joinNames(names)}`;
}

/**
 * Reasons for one olympiad, strongest first. A benefit needs a card in the RSOSH list (`inRsoshList`): a profile outside it
 * gives no admission benefit even when its series does. Each direction is named once, in its strongest reason.
 */
export function buildGoalMatch(input: { inRsoshList: boolean; benefits: BenefitFact[]; directions: DirectionFact[]; subjects: string[]; level?: string | null }): z.infer<typeof GoalMatch> | null {
  const reasons: Reason[] = [];
  let score = 0;
  if (input.inRsoshList && input.benefits.length) {
    const groups = new Map<string, BenefitFact[]>();
    for (const b of [...input.benefits].sort((a, c) => benefitOrder(a) - benefitOrder(c) || a.name.localeCompare(c.name, 'ru'))) {
      const key = `${b.kind}:${b.diploma}`;
      groups.set(key, [...groups.get(key) ?? [], b]);
    }
    // A university that gives БВИ is not repeated in its weaker «100 баллов» group.
    const named = new Set<string>();
    for (const list of groups.values()) {
      const fresh = list.filter(b => !named.has(b.slug));
      if (!fresh.length) continue;
      fresh.forEach(b => named.add(b.slug));
      const { kind, diploma } = fresh[0]!;
      reasons.push({ kind: 'benefit', text: benefitText(kind, diploma, fresh.map(b => shortUniversityName(b.name))), benefit: { kind, diploma },
        universities: fresh.map(b => ({ slug: b.slug, name: b.name, city: b.city })) });
    }
    score += goalWeights.benefit * Math.min(named.size, goalWeights.benefitUniversities);
  }
  const byCode = (a: DirectionFact, b: DirectionFact) => a.code.localeCompare(b.code);
  const rsosh = input.directions.filter(d => d.viaRsosh).sort(byCode);
  if (rsosh.length) {
    reasons.push({ kind: 'rsosh', text: `Профиль по перечню РСОШ подходит для ${directionWord(rsosh)} ${quoted(rsosh)}`, directions: rsosh.map(ref) });
    score += goalWeights.rsosh * rsosh.length;
  }
  const cardSubjects = new Set(input.subjects);
  score += goalWeights.main * input.directions.filter(d => d.core[0] && cardSubjects.has(d.core[0])).length;
  for (const relevance of ['core', 'related'] as const) {
    const list = input.directions.filter(d => !d.viaRsosh && d.subjectRelevance === relevance).sort(byCode);
    // One reason per linking subject: «Информатика — профильный предмет для направлений «ПИ» и «ПМИ»».
    const bySubject = new Map<string, DirectionFact[]>();
    for (const d of list) {
      const subject = d[relevance].find(s => cardSubjects.has(s)) ?? '';
      bySubject.set(subject, [...bySubject.get(subject) ?? [], d]);
    }
    for (const [subject, group] of [...bySubject].sort(([a], [b]) => a.localeCompare(b, 'ru'))) {
      reasons.push(relevance === 'core'
        ? { kind: 'core_subject', text: subject ? `${subject} — профильный предмет для ${directionWord(group)} ${quoted(group)}` : `Профильный предмет для ${directionWord(group)} ${quoted(group)}`,
          directions: group.map(ref), ...(subject ? { subject } : {}) }
        : { kind: 'related_subject', text: `Близкий профиль для ${directionWord(group)} ${quoted(group)}${subject ? ` (${lowerFirst(subject)})` : ''}`,
          directions: group.map(ref), ...(subject ? { subject } : {}) });
    }
    score += (relevance === 'core' ? goalWeights.core : goalWeights.related) * list.length;
  }
  return reasons.length ? { score: score + levelWeight(input.level), reasons } : null;
}

export const hasGoal = (goal: Goal) => !!(goal.universities?.length || goal.directions?.length);

/**
 * Goal matches for the given olympiads, or for the whole catalog when `olympiadIds` is omitted (to sort by the goal).
 * Olympiads with nothing in common with the goal are absent from the map.
 */
export async function goalMatches(db: Database, goal: Goal, olympiadIds?: number[]) {
  const result = new Map<number, z.infer<typeof GoalMatch>>();
  if (!hasGoal(goal) || olympiadIds?.length === 0) return result;
  const onlyIds = (column: typeof olympiadSeriesLinks.olympiadId | typeof olympiadDirections.olympiadId) => olympiadIds ? inArray(column, olympiadIds) : undefined;
  const [benefitRows, directionRows] = await Promise.all([
    goal.universities?.length ? db.select({ olympiadId: olympiadSeriesLinks.olympiadId, level: olympiads.level, slug: universities.slug, name: universities.name, city: universities.city,
      kind: seriesBenefits.kind, diploma: seriesBenefits.diploma })
      .from(seriesBenefits).innerJoin(universities, eq(universities.id, seriesBenefits.universityId))
      .innerJoin(olympiadSeriesLinks, eq(olympiadSeriesLinks.seriesId, seriesBenefits.seriesId))
      .innerJoin(olympiads, eq(olympiads.id, olympiadSeriesLinks.olympiadId))
      .where(and(inArray(universities.slug, goal.universities), eq(olympiads.inCatalog, true), isNotNull(olympiads.level), onlyIds(olympiadSeriesLinks.olympiadId))) : [],
    goal.directions?.length ? db.select({ olympiadId: olympiadDirections.olympiadId, level: olympiads.level, directionId: directions.id, code: directions.code, name: directions.name,
      educationLevel: directions.educationLevel, viaRsosh: olympiadDirections.viaRsosh, subjectRelevance: olympiadDirections.subjectRelevance })
      .from(olympiadDirections).innerJoin(directions, eq(directions.id, olympiadDirections.directionId))
      .innerJoin(olympiads, and(eq(olympiads.id, olympiadDirections.olympiadId), eq(olympiads.inCatalog, true)))
      .where(and(inArray(directions.code, goal.directions), onlyIds(olympiadDirections.olympiadId))) : [],
  ]);
  // Which subject links an olympiad to a direction: needed for the subject reasons and the main-subject weight.
  const bySubject = directionRows.filter(r => r.subjectRelevance);
  const [directionSubjectRows, cardSubjectRows] = bySubject.length ? await Promise.all([
    db.select({ directionId: directionSubjects.directionId, relevance: directionSubjects.relevance, name: subjects.name }).from(directionSubjects)
      .innerJoin(subjects, eq(subjects.id, directionSubjects.subjectId)).where(inArray(directionSubjects.directionId, [...new Set(bySubject.map(r => r.directionId))])),
    db.select({ olympiadId: olympiadSubjects.olympiadId, name: subjects.name }).from(olympiadSubjects).innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId))
      .where(inArray(olympiadSubjects.olympiadId, [...new Set(bySubject.map(r => r.olympiadId))])).orderBy(subjects.name),
  ]) : [[], []];
  const directionSubjectsOf = new Map<number, { core: string[]; related: string[] }>();
  for (const s of directionSubjectRows) {
    const entry = directionSubjectsOf.get(s.directionId) ?? { core: [], related: [] };
    entry[s.relevance].push(s.name); directionSubjectsOf.set(s.directionId, entry);
  }
  const cardSubjects = new Map<number, string[]>();
  for (const s of cardSubjectRows) cardSubjects.set(s.olympiadId, [...cardSubjects.get(s.olympiadId) ?? [], s.name]);
  const levels = new Map([...benefitRows, ...directionRows].map(r => [r.olympiadId, r.level]));
  for (const [id, level] of levels) {
    const match = buildGoalMatch({
      // Benefit rows are read only for cards in the RSOSH list (level is not null).
      inRsoshList: true,
      benefits: benefitRows.filter(r => r.olympiadId === id),
      directions: directionRows.filter(r => r.olympiadId === id).map(r => ({ code: r.code, name: r.name, educationLevel: r.educationLevel, viaRsosh: r.viaRsosh,
        subjectRelevance: r.subjectRelevance, ...directionSubjectsOf.get(r.directionId) ?? { core: [], related: [] } })),
      subjects: cardSubjects.get(id) ?? [],
      level,
    });
    if (match) result.set(id, match);
  }
  return result;
}
export const goalOf = (query: { goalUniversities?: string[]; goalDirections?: string[] }): Goal => ({ universities: query.goalUniversities, directions: query.goalDirections });
