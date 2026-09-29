// Directions of study, university programs and their links to olympiads (read side).
// Data: directions, direction_subjects, university_programs, olympiad_directions — see reference/apply.ts.
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/client.js';
import {
  directions, directionSubjects, subjects, universityPrograms, universities, olympiadDirections, olympiads, olympiadSubjects,
  olympiadSeriesLinks, seriesBenefits, directionBenefits,
} from '../db/schema.js';
import type { DirectionListQuery as DirectionListQuerySchema, OlympiadProgramsQuery as OlympiadProgramsQuerySchema, OlympiadProgramsResponse,
  ProgramInfo } from '../../../../packages/contracts/src/index.js';

type DirectionListQuery = z.infer<typeof DirectionListQuerySchema>;
type OlympiadProgramsQuery = z.infer<typeof OlympiadProgramsQuerySchema>;
import { directionCoverage, programTakesSubjects, type DirectionCoverage } from '../reference/directions.js';

type Program = typeof universityPrograms.$inferSelect;
const programInfo = (p: Program): z.infer<typeof ProgramInfo> => ({ id: p.id, name: p.name, faculty: p.faculty, examsRequired: p.examsRequired,
  examsChoice: p.examsChoice, internalExam: p.internalExam, passingScore: p.passingScore, passingScoreForm: p.passingScoreForm,
  passingYear: p.passingYear, funding: p.funding, sourceUrl: p.sourceUrl });
const directionRef = (d: { code: string; name: string; educationLevel: 'bachelor' | 'specialist' }) => ({ code: d.code, name: d.name, educationLevel: d.educationLevel });
/** RSOSH or a core subject: the reasons strong enough for filters and «where it helps to enter». */
export const strongMatch = or(eq(olympiadDirections.viaRsosh, true), eq(olympiadDirections.subjectRelevance, 'core'));
const byScore = (a: Program, b: Program) => (b.passingScore ?? -1) - (a.passingScore ?? -1) || a.name.localeCompare(b.name, 'ru') || a.id - b.id;
const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();

async function summaries(db: Database, ids?: number[]) {
  const where = ids ? inArray(directions.id, ids) : undefined;
  const [rows, subjectRows, counts] = await Promise.all([
    db.select().from(directions).where(where).orderBy(asc(directions.code)),
    db.select({ directionId: directionSubjects.directionId, relevance: directionSubjects.relevance, name: subjects.name })
      .from(directionSubjects).innerJoin(subjects, eq(subjects.id, directionSubjects.subjectId)).where(ids ? inArray(directionSubjects.directionId, ids) : undefined),
    db.select({ directionId: universityPrograms.directionId, programCount: sql<number>`count(*)::int`,
      universityCount: sql<number>`count(distinct ${universityPrograms.universityId})::int` })
      .from(universityPrograms).where(ids ? inArray(universityPrograms.directionId, ids) : undefined).groupBy(universityPrograms.directionId),
  ]);
  const subjectsOf = new Map<number, { core: string[]; related: string[] }>();
  for (const s of subjectRows) {
    const entry = subjectsOf.get(s.directionId) ?? { core: [], related: [] };
    entry[s.relevance].push(s.name); subjectsOf.set(s.directionId, entry);
  }
  const countOf = new Map(counts.map(c => [c.directionId, c]));
  return rows.map(d => ({ id: d.id, summary: { ...directionRef(d), ugsnCode: d.ugsnCode, ugsnName: d.ugsnName, popular: d.popular, aliases: d.aliases,
    note: d.note, egeSubjects: d.egeSubjects, subjectsCore: subjectsOf.get(d.id)?.core ?? [], subjectsRelated: subjectsOf.get(d.id)?.related ?? [],
    universityCount: countOf.get(d.id)?.universityCount ?? 0, programCount: countOf.get(d.id)?.programCount ?? 0 } }));
}

export async function directionList(db: Database, query: DirectionListQuery) {
  let ids: number[] | undefined;
  if (query.universities) {
    const rows = await db.selectDistinct({ id: universityPrograms.directionId }).from(universityPrograms)
      .innerJoin(universities, eq(universities.id, universityPrograms.universityId)).where(inArray(universities.slug, query.universities));
    ids = rows.map(r => r.id);
    if (!ids.length) return { items: [] };
  }
  let items = (await summaries(db, ids)).map(r => r.summary);
  if (query.popular !== undefined) items = items.filter(d => d.popular === query.popular);
  if (query.q) {
    const q = normalize(query.q);
    // Name first, then the start of a word, then the group and colloquial aliases («прога», «врач»).
    const rank = (d: typeof items[number]) => {
      const name = normalize(d.name);
      if (d.code.startsWith(q) || name === q) return 0;
      if (name.startsWith(q)) return 1;
      if (name.split(/[\s,()-]+/).some(w => w.startsWith(q))) return 2;
      if (name.includes(q)) return 3;
      if (d.aliases.some(a => normalize(a).startsWith(q))) return 4;
      if (d.aliases.some(a => normalize(a).includes(q)) || normalize(d.ugsnName).includes(q)) return 5;
      return null;
    };
    items = items.flatMap(d => { const r = rank(d); return r === null ? [] : [{ d, r }]; })
      .sort((a, b) => a.r - b.r || Number(b.d.popular) - Number(a.d.popular) || a.d.code.localeCompare(b.d.code)).map(x => x.d);
  }
  return { items };
}

export async function directionDetail(db: Database, code: string) {
  const [direction] = await db.select({ id: directions.id }).from(directions).where(eq(directions.code, code));
  if (!direction) return null;
  const [[entry], programRows, matches] = await Promise.all([
    summaries(db, [direction.id]),
    db.select({ program: universityPrograms, slug: universities.slug, name: universities.name, city: universities.city }).from(universityPrograms)
      .innerJoin(universities, eq(universities.id, universityPrograms.universityId)).where(eq(universityPrograms.directionId, direction.id)),
    db.select({ id: olympiads.id, title: olympiads.title, level: olympiads.level, rating: olympiads.rating,
      viaRsosh: olympiadDirections.viaRsosh, subjectRelevance: olympiadDirections.subjectRelevance })
      .from(olympiadDirections).innerJoin(olympiads, eq(olympiads.id, olympiadDirections.olympiadId))
      .where(and(eq(olympiadDirections.directionId, direction.id), eq(olympiads.inCatalog, true), strongMatch)),
  ]);
  const byUniversity = new Map<string, { slug: string; name: string; city: string; programs: Program[] }>();
  for (const r of programRows) {
    const u = byUniversity.get(r.slug) ?? { slug: r.slug, name: r.name, city: r.city, programs: [] };
    u.programs.push(r.program); byUniversity.set(r.slug, u);
  }
  // Olympiads with a level can give a benefit; then the official RSOSH correspondence, then the rating.
  const ordered = matches.sort((a, b) => Number(b.level !== null) - Number(a.level !== null) || Number(b.viaRsosh) - Number(a.viaRsosh)
    || (b.rating ?? -1) - (a.rating ?? -1) || a.id - b.id).slice(0, 100);
  const subjectRows = ordered.length ? await db.select({ olympiadId: olympiadSubjects.olympiadId, name: subjects.name }).from(olympiadSubjects)
    .innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId)).where(inArray(olympiadSubjects.olympiadId, ordered.map(o => o.id))).orderBy(subjects.name) : [];
  const subjectsOf = new Map<number, string[]>();
  for (const s of subjectRows) subjectsOf.set(s.olympiadId, [...subjectsOf.get(s.olympiadId) ?? [], s.name]);
  return { ...entry!.summary,
    universities: [...byUniversity.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map(u => ({ slug: u.slug, name: u.name, city: u.city, programs: u.programs.sort(byScore).map(programInfo) })),
    olympiads: { total: matches.length, items: ordered.map(o => ({ id: o.id, title: o.title, level: o.level, subjects: subjectsOf.get(o.id) ?? [],
      viaRsosh: o.viaRsosh, subjectRelevance: o.subjectRelevance })) } };
}

/** Directions an olympiad suits: RSOSH first, then core subjects, then related ones (at most 60). */
export async function olympiadDirectionList(db: Database, olympiadId: number) {
  const rows = await db.select({ code: directions.code, name: directions.name, educationLevel: directions.educationLevel, popular: directions.popular,
    viaRsosh: olympiadDirections.viaRsosh, subjectRelevance: olympiadDirections.subjectRelevance })
    .from(olympiadDirections).innerJoin(directions, eq(directions.id, olympiadDirections.directionId)).where(eq(olympiadDirections.olympiadId, olympiadId));
  const weight = (r: typeof rows[number]) => (r.viaRsosh ? 4 : 0) + (r.subjectRelevance === 'core' ? 2 : r.subjectRelevance === 'related' ? 1 : 0);
  return rows.sort((a, b) => weight(b) - weight(a) || Number(b.popular) - Number(a.popular) || a.code.localeCompare(b.code)).slice(0, 60)
    .map(r => ({ ...directionRef(r), viaRsosh: r.viaRsosh, subjectRelevance: r.subjectRelevance }));
}

export async function universityProgramList(db: Database, universityId: number) {
  const rows = await db.select({ program: universityPrograms, code: directions.code, name: directions.name, educationLevel: directions.educationLevel })
    .from(universityPrograms).innerJoin(directions, eq(directions.id, universityPrograms.directionId)).where(eq(universityPrograms.universityId, universityId));
  return rows.sort((a, b) => a.code.localeCompare(b.code) || byScore(a.program, b.program))
    .map(r => ({ ...programInfo(r.program), direction: directionRef(r) }));
}

/**
 * «На N из M направлений» per university for an olympiad card: exact rows from admission rules where they exist,
 * otherwise the estimate by the exams of the university's programs (see directionCoverage).
 */
export async function coverageByUniversity(db: Database, olympiadId: number, seriesId: number, universityIds: number[]) {
  const result = new Map<number, DirectionCoverage | null>();
  if (!universityIds.length) return result;
  const [programRows, ruleRows, subjectRows] = await Promise.all([
    db.select({ universityId: universityPrograms.universityId, directionCode: directions.code, examsRequired: universityPrograms.examsRequired, examsChoice: universityPrograms.examsChoice })
      .from(universityPrograms).innerJoin(directions, eq(directions.id, universityPrograms.directionId)).where(inArray(universityPrograms.universityId, universityIds)),
    db.selectDistinct({ universityId: directionBenefits.universityId, code: directions.code }).from(directionBenefits)
      .innerJoin(directions, eq(directions.id, directionBenefits.directionId))
      .where(and(eq(directionBenefits.seriesId, seriesId), inArray(directionBenefits.universityId, universityIds))),
    db.select({ name: subjects.name }).from(olympiadSubjects).innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId)).where(eq(olympiadSubjects.olympiadId, olympiadId)),
  ]);
  const cardSubjects = subjectRows.map(s => s.name);
  for (const id of universityIds) {
    const rules = ruleRows.filter(r => r.universityId === id).map(r => r.code);
    result.set(id, directionCoverage(programRows.filter(p => p.universityId === id), cardSubjects, rules.length ? rules : null));
  }
  return result;
}

/**
 * Programs an olympiad helps to enter: a university gives a benefit for the olympiad's series, it has a program in a direction
 * the olympiad suits (RSOSH or a core subject), and examMatch tells whether the program has the exam the diploma counts for.
 */
export async function olympiadPrograms(db: Database, olympiadId: number, query: OlympiadProgramsQuery): Promise<z.infer<typeof OlympiadProgramsResponse> | null> {
  const [card] = await db.select({ id: olympiads.id, level: olympiads.level, seriesId: olympiadSeriesLinks.seriesId }).from(olympiads)
    .leftJoin(olympiadSeriesLinks, eq(olympiadSeriesLinks.olympiadId, olympiads.id)).where(eq(olympiads.id, olympiadId));
  if (!card) return null;
  if (!card.seriesId) return { applicable: false, note: 'Льготы вузов для этой олимпиады не указаны.', items: [] };
  if (card.level === null) return { applicable: false, note: 'Профиль этой карточки не входит в перечень РСОШ, поэтому льгот при поступлении она не даёт.', items: [] };
  const [benefitRows, directionRows, subjectRows] = await Promise.all([
    db.select({ universityId: universities.id, slug: universities.slug, name: universities.name, city: universities.city, kind: seriesBenefits.kind,
      diploma: seriesBenefits.diploma, minScore: seriesBenefits.minScore, maxScore: seriesBenefits.maxScore, requirement: seriesBenefits.requirement })
      .from(seriesBenefits).innerJoin(universities, eq(universities.id, seriesBenefits.universityId))
      .where(and(eq(seriesBenefits.seriesId, card.seriesId), query.universities ? inArray(universities.slug, query.universities) : undefined))
      .orderBy(universities.name, seriesBenefits.kind, seriesBenefits.diploma),
    db.select({ directionId: olympiadDirections.directionId, viaRsosh: olympiadDirections.viaRsosh, subjectRelevance: olympiadDirections.subjectRelevance })
      .from(olympiadDirections).innerJoin(directions, eq(directions.id, olympiadDirections.directionId))
      .where(and(eq(olympiadDirections.olympiadId, olympiadId), strongMatch, query.directions ? inArray(directions.code, query.directions) : undefined)),
    db.select({ name: subjects.name }).from(olympiadSubjects).innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId)).where(eq(olympiadSubjects.olympiadId, olympiadId)),
  ]);
  const universityIds = [...new Set(benefitRows.map(b => b.universityId))];
  const reasons = new Map(directionRows.map(d => [d.directionId, d]));
  const programRows = universityIds.length && reasons.size ? await db.select({ program: universityPrograms, code: directions.code, name: directions.name, educationLevel: directions.educationLevel })
    .from(universityPrograms).innerJoin(directions, eq(directions.id, universityPrograms.directionId))
    .where(and(inArray(universityPrograms.universityId, universityIds), inArray(universityPrograms.directionId, [...reasons.keys()]))) : [];
  const cardSubjects = subjectRows.map(s => s.name);
  const coverage = await coverageByUniversity(db, olympiadId, card.seriesId, universityIds);
  const items = universityIds.map(id => {
    const benefits = benefitRows.filter(b => b.universityId === id);
    const programs = programRows.filter(r => r.program.universityId === id).map(r => {
      const reason = reasons.get(r.program.directionId)!;
      return { ...programInfo(r.program), direction: directionRef(r), viaRsosh: reason.viaRsosh, subjectRelevance: reason.subjectRelevance,
        examMatch: programTakesSubjects(r.program, cardSubjects), score: r.program };
    }).sort((a, b) => Number(b.examMatch) - Number(a.examMatch) || Number(b.viaRsosh) - Number(a.viaRsosh) || byScore(a.score, b.score))
      .map(({ score: _score, ...p }) => p);
    const u = benefits[0]!;
    return { university: { slug: u.slug, name: u.name, city: u.city },
      benefits: benefits.map(b => ({ kind: b.kind, diploma: b.diploma, minScore: b.minScore, maxScore: b.maxScore, requirement: b.requirement })),
      coverage: coverage.get(id) ?? null, programs };
  }).sort((a, b) => b.programs.length - a.programs.length || a.university.name.localeCompare(b.university.name, 'ru'));
  return { applicable: true,
    note: 'Льгота вуза указана для олимпиады в целом, а программы подобраны по профилю олимпиады и экзаменам. Точные направления и условия — в правилах приёма вуза.',
    items };
}
