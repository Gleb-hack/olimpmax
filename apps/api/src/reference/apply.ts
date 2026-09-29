// Writes a validated reference bundle into PostgreSQL and recomputes olympiad levels.
// Every run fully rewrites the reference tables from the files, so the files stay the single source of truth.
import { eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  olympiads, olympiadSeries, seriesStages, seriesProfiles, olympiadSeriesLinks, universities, seriesBenefits, referenceSources, importRuns,
  subjects, olympiadSubjects, directions, directionSubjects, universityPrograms, olympiadDirections, directionBenefits,
} from '../db/schema.js';
import { matchDirections } from './directions.js';
import { catalogLevel, resolveLevel, type ResolvedLevel, type RsoshMeta } from './levels.js';
import { checkAgainstCatalog, type ReferenceBundle, type ReferenceIssue } from './load.js';
import { ALL_PROFILES, scheduleConflicts, type Level } from './model.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;
export const importLockId = 17012026;

export class ReferenceValidationError extends Error {
  constructor(public issues: ReferenceIssue[]) {
    const errors = issues.filter(i => i.severity === 'error');
    super(`Справочник содержит ошибки (${errors.length}):\n` + errors.slice(0, 30).map(i => `- ${i.message}`).join('\n') + (errors.length > 30 ? `\n… ещё ${errors.length - 30}` : ''));
  }
}
export function assertValid(bundle: ReferenceBundle) {
  if (bundle.issues.some(i => i.severity === 'error')) throw new ReferenceValidationError(bundle.issues);
}

export async function applyReference(db: Database, bundle: ReferenceBundle, sourceFile = 'data/reference') {
  assertValid(bundle);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${importLockId})`);
    const report = await applyReferenceTx(tx, bundle);
    await tx.insert(importRuns).values({ sourceFile, sha256: bundle.sha256, rowCount: bundle.series.length, report });
    return report;
  });
}

/** Caller holds the transaction and the import lock (see importCsv). */
export async function applyReferenceTx(tx: Executor, bundle: ReferenceBundle) {
  assertValid(bundle);
  const now = new Date().toISOString();
  const { manifest } = bundle;
  const sha = new Map(bundle.files.map(f => [f.path, f.sha256]));

  await tx.delete(referenceSources);
  const sources = [
    { key: 'schedule', ...manifest.sources.schedule, status: null, url: null },
    { key: 'rsosh', ...manifest.sources.rsosh },
    // The first benefits file keeps the historical key «benefits»; later deliveries get «benefits-2», «benefits-3», …
    ...manifest.sources.benefits.map((source, index) => ({ key: index ? `benefits-${index + 1}` : 'benefits', ...source, status: null, url: null })),
    ...(manifest.sources.programs ? [{ key: 'programs', ...manifest.sources.programs }] : []),
    ...(manifest.sources.directionBenefits ?? []).map((source, index) => ({ key: `direction-benefits-${index + 1}`, ...source, status: null, url: null })),
  ];
  await tx.insert(referenceSources).values(sources.map(source => ({ key: source.key, file: source.file, description: source.description ?? null,
    sha256: sha.get(source.file) ?? '', season: manifest.season, status: source.status, url: source.url, importedAt: now })));

  // Universities and series: delete what left the files, upsert the rest (ids stay stable between runs).
  const universitySlugs = bundle.universities.map(u => u.slug);
  await tx.delete(universities).where(universitySlugs.length ? notInArray(universities.slug, universitySlugs) : sql`true`);
  for (const u of bundle.universities) {
    const value = { slug: u.slug, name: u.name, fullName: u.fullName, city: u.city, aliases: u.aliases };
    await tx.insert(universities).values(value).onConflictDoUpdate({ target: universities.slug, set: value });
  }
  const seriesSlugs = bundle.series.map(s => s.slug);
  await tx.delete(olympiadSeries).where(seriesSlugs.length ? notInArray(olympiadSeries.slug, seriesSlugs) : sql`true`);
  for (const s of bundle.series) {
    const value = { slug: s.slug, name: s.name, aliases: s.aliases, catalogGroup: s.catalogGroup, generalLevel: s.generalLevel,
      formatRaw: s.formatRaw, scheduleRaw: s.scheduleRaw, scheduleQuality: s.scheduleQuality, rsoshTitle: s.rsoshTitle,
      rsoshNumber: s.rsoshNumber, note: s.note, updatedAt: now };
    await tx.insert(olympiadSeries).values(value).onConflictDoUpdate({ target: olympiadSeries.slug, set: value });
  }
  const seriesId = new Map((await tx.select({ id: olympiadSeries.id, slug: olympiadSeries.slug }).from(olympiadSeries)).map(r => [r.slug, r.id]));
  const universityId = new Map((await tx.select({ id: universities.id, slug: universities.slug }).from(universities)).map(r => [r.slug, r.id]));

  // Stages keep their UUID while the position stays the same.
  for (const s of bundle.series) {
    const id = seriesId.get(s.slug)!;
    await tx.delete(seriesStages).where(sql`${seriesStages.seriesId} = ${id} and ${seriesStages.position} >= ${s.stages.length}`);
    for (const stage of s.stages) {
      const value = { seriesId: id, ...stage };
      await tx.insert(seriesStages).values(value).onConflictDoUpdate({ target: [seriesStages.seriesId, seriesStages.position], set: value });
    }
  }
  await tx.delete(seriesProfiles);
  const profileRows = bundle.series.flatMap(s => [...s.profiles].map(([profile, p]) =>
    ({ seriesId: seriesId.get(s.slug)!, season: manifest.season, profile, level: p.level, fieldsOfStudy: p.fieldsOfStudy })));
  if (profileRows.length) await tx.insert(seriesProfiles).values(profileRows);

  await tx.delete(seriesBenefits);
  const benefitRows = bundle.benefits.map(b => ({ universityId: universityId.get(b.university)!, seriesId: seriesId.get(b.series)!,
    kind: b.kind, diploma: b.diploma, minScore: b.minScore, maxScore: b.maxScore, requirement: b.requirement, requirementRaw: b.requirementRaw }));
  for (let i = 0; i < benefitRows.length; i += 500) await tx.insert(seriesBenefits).values(benefitRows.slice(i, i + 500));

  // Links only for cards that exist; the rest are reported (a card may arrive with a later catalog export).
  const catalog = await tx.select({ id: olympiads.id, title: olympiads.title, sourceGroup: olympiads.sourceGroup, rawSource: olympiads.rawSource, inCatalog: olympiads.inCatalog }).from(olympiads);
  const known = new Set(catalog.map(r => r.id));
  await tx.delete(olympiadSeriesLinks);
  const cardById = new Map(catalog.map(r => [r.id, r]));
  const seriesBySlug = new Map(bundle.series.map(s => [s.slug, s]));
  const linkRows = bundle.links.filter(l => known.has(l.olympiadId)).map(l => {
    const raw = cardById.get(l.olympiadId)!.rawSource;
    const stages = seriesBySlug.get(l.series)!.stages.map(s => s.rawDates);
    return { olympiadId: l.olympiadId, seriesId: seriesId.get(l.series)!, profiles: l.profiles, note: l.note,
      scheduleConflict: scheduleConflicts(raw['Календарь'] ?? null, raw['Календарь статус'] ?? null, stages) };
  });
  for (let i = 0; i < linkRows.length; i += 500) await tx.insert(olympiadSeriesLinks).values(linkRows.slice(i, i + 500));

  // Directions keep their ids (users' goals point at them); their subjects and the programs are rewritten.
  const directionCodes = bundle.directions.map(d => d.code);
  await tx.delete(directions).where(directionCodes.length ? notInArray(directions.code, directionCodes) : sql`true`);
  for (const d of bundle.directions) {
    const value = { code: d.code, name: d.name, educationLevel: d.educationLevel, ugsnCode: d.ugsnCode, ugsnName: d.ugsnName,
      egeSubjects: d.egeSubjects, popular: d.popular, aliases: d.aliases, note: d.note };
    await tx.insert(directions).values(value).onConflictDoUpdate({ target: directions.code, set: value });
  }
  const directionId = new Map((await tx.select({ id: directions.id, code: directions.code }).from(directions)).map(r => [r.code, r.id]));
  // A direction may name a subject no card has yet: it is created so the relation is kept (the catalog lists only subjects with cards).
  const subjectNames = [...new Set(bundle.directions.flatMap(d => [...d.core, ...d.related]))];
  if (subjectNames.length) await tx.insert(subjects).values(subjectNames.map(name => ({ name }))).onConflictDoNothing();
  const subjectId = new Map((await tx.select().from(subjects)).map(s => [s.name, s.id]));
  await tx.delete(directionSubjects);
  const directionSubjectRows = bundle.directions.flatMap(d => [
    ...d.core.map(name => ({ directionId: directionId.get(d.code)!, subjectId: subjectId.get(name)!, relevance: 'core' as const })),
    ...d.related.map(name => ({ directionId: directionId.get(d.code)!, subjectId: subjectId.get(name)!, relevance: 'related' as const })),
  ]);
  for (let i = 0; i < directionSubjectRows.length; i += 500) await tx.insert(directionSubjects).values(directionSubjectRows.slice(i, i + 500));
  await tx.delete(universityPrograms);
  const programRows = bundle.programs.map(({ university, direction, ...p }) => ({ ...p, universityId: universityId.get(university)!, directionId: directionId.get(direction)! }));
  for (let i = 0; i < programRows.length; i += 500) await tx.insert(universityPrograms).values(programRows.slice(i, i + 500));

  await tx.delete(directionBenefits);
  const directionBenefitRows = bundle.directionBenefits.map(({ university, series, direction, ...b }) =>
    ({ ...b, universityId: universityId.get(university)!, seriesId: seriesId.get(series)!, directionId: directionId.get(direction)! }));
  for (let i = 0; i < directionBenefitRows.length; i += 500) await tx.insert(directionBenefits).values(directionBenefitRows.slice(i, i + 500));

  const levels = await recomputeLevels(tx);
  const olympiadDirectionStats = await recomputeOlympiadDirections(tx);
  const issues = [...bundle.issues, ...checkAgainstCatalog(bundle, catalog)];
  const count = <T,>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((acc, item) => { acc[key(item)] = (acc[key(item)] ?? 0) + 1; return acc; }, {});
  return {
    referenceSha256: bundle.sha256, season: manifest.season,
    series: bundle.series.length, seriesWithSchedule: bundle.series.filter(s => s.stages.length).length,
    scheduleQuality: count(bundle.series.filter(s => s.stages.length), s => s.scheduleQuality),
    seriesInRsoshList: bundle.series.filter(s => s.profiles.size).length, rsoshProfiles: profileRows.length,
    universities: bundle.universities.length, benefits: benefitRows.length,
    directions: bundle.directions.length, programs: programRows.length, directionBenefits: directionBenefitRows.length, olympiadDirections: olympiadDirectionStats,
    links: linkRows.length, linksSkipped: bundle.links.length - linkRows.length,
    // Only where it changes what the card shows: the series schedule would otherwise be primary.
    scheduleConflicts: linkRows.filter(l => l.scheduleConflict && bundle.series.find(s => seriesId.get(s.slug) === l.seriesId)?.scheduleQuality === 'ok').map(l => l.olympiadId),
    levels, warnings: issues.filter(i => i.severity === 'warning').length,
    issues: issues.map(i => `${i.code}: ${i.message}`),
  };
}

/** Recomputes olympiads.level* from the stored links, series and RSOSH profiles (see resolveLevel for priorities). */
export async function recomputeLevels(tx: Executor) {
  // Sequential on purpose: a transaction is a single connection.
  const rows = await tx.select({ id: olympiads.id, rawSource: olympiads.rawSource, level: olympiads.level, levelProfile: olympiads.levelProfile,
    levelStatus: olympiads.levelStatus, levelSourceUrl: olympiads.levelSourceUrl, levelSource: olympiads.levelSource }).from(olympiads);
  const links = await tx.select().from(olympiadSeriesLinks);
  const series = await tx.select({ id: olympiadSeries.id, name: olympiadSeries.name, generalLevel: olympiadSeries.generalLevel }).from(olympiadSeries);
  const profiles = await tx.select().from(seriesProfiles);
  const sources = await tx.select().from(referenceSources).where(eq(referenceSources.key, 'rsosh'));
  const rsoshSource = sources[0];
  const rsosh: RsoshMeta = { season: rsoshSource?.season ?? '', status: rsoshSource?.status ?? 'Перечень РСОШ', url: rsoshSource?.url ?? null };
  const season = rsoshSource?.season;
  const seriesById = new Map(series.map(s => [s.id, { name: s.name, generalLevel: s.generalLevel as Level | null, profiles: new Map<string, number>() }]));
  for (const p of profiles) if (p.season === season) seriesById.get(p.seriesId)?.profiles.set(p.profile, p.level);
  const linkById = new Map(links.map(l => [l.olympiadId, l]));
  const stats: Record<string, number> = {};
  let changed = 0;
  for (const row of rows) {
    const link = linkById.get(row.id);
    const resolved: ResolvedLevel = link ? resolveLevel({ rawSource: row.rawSource, link, series: seriesById.get(link.seriesId) ?? null, rsosh }) : catalogLevel(row.rawSource);
    stats[resolved.levelSource ?? 'none'] = (stats[resolved.levelSource ?? 'none'] ?? 0) + 1;
    if (resolved.level !== row.level || resolved.levelProfile !== row.levelProfile || resolved.levelStatus !== row.levelStatus
      || resolved.levelSourceUrl !== row.levelSourceUrl || resolved.levelSource !== row.levelSource) {
      await tx.update(olympiads).set(resolved).where(eq(olympiads.id, row.id));
      changed++;
    }
  }
  return { bySource: stats, changed };
}

/**
 * Recomputes olympiad_directions from the stored cards, their subjects and RSOSH profiles (see matchDirections).
 * Runs after every catalog or reference import: both change subjects, links or profiles.
 */
export async function recomputeOlympiadDirections(tx: Executor) {
  // Sequential on purpose: a transaction is a single connection.
  const directionRows = await tx.select({ id: directions.id, code: directions.code, name: directions.name, ugsnName: directions.ugsnName }).from(directions);
  const directionSubjectRows = await tx.select({ directionId: directionSubjects.directionId, relevance: directionSubjects.relevance, name: subjects.name })
    .from(directionSubjects).innerJoin(subjects, eq(subjects.id, directionSubjects.subjectId));
  const cards = await tx.select({ id: olympiads.id }).from(olympiads);
  const cardSubjects = await tx.select({ olympiadId: olympiadSubjects.olympiadId, name: subjects.name }).from(olympiadSubjects).innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId));
  const links = await tx.select().from(olympiadSeriesLinks);
  const profiles = await tx.select().from(seriesProfiles);
  const sources = await tx.select().from(referenceSources).where(eq(referenceSources.key, 'rsosh'));
  await tx.delete(olympiadDirections);
  if (!directionRows.length) return { rows: 0, viaRsosh: 0, core: 0, related: 0 };
  const season = sources[0]?.season;
  const byDirection = new Map(directionRows.map(d => [d.id, { code: d.code, name: d.name, ugsnName: d.ugsnName, core: [] as string[], related: [] as string[] }]));
  for (const s of directionSubjectRows) byDirection.get(s.directionId)?.[s.relevance].push(s.name);
  const idByCode = new Map(directionRows.map(d => [d.code, d.id]));
  const subjectsByCard = new Map<number, string[]>();
  for (const s of cardSubjects) subjectsByCard.set(s.olympiadId, [...subjectsByCard.get(s.olympiadId) ?? [], s.name]);
  const fieldsBySeries = new Map<number, Map<string, string | null>>();
  for (const p of profiles) {
    if (p.season !== season) continue;
    const map = fieldsBySeries.get(p.seriesId) ?? new Map<string, string | null>();
    map.set(p.profile, p.fieldsOfStudy); fieldsBySeries.set(p.seriesId, map);
  }
  const linkByCard = new Map(links.map(l => [l.olympiadId, l]));
  const list = [...byDirection.values()];
  const rows: (typeof olympiadDirections.$inferInsert)[] = [];
  for (const card of cards) {
    const link = linkByCard.get(card.id);
    const seriesFields = link ? fieldsBySeries.get(link.seriesId) : undefined;
    // Only the RSOSH profiles this card covers: [] — none, ['*'] — all profiles of the series.
    const covered = !link || !seriesFields ? [] : link.profiles.includes(ALL_PROFILES) ? [...seriesFields.values()] : link.profiles.map(p => seriesFields.get(p) ?? null);
    for (const m of matchDirections({ subjects: subjectsByCard.get(card.id) ?? [], fieldsOfStudy: covered }, list))
      rows.push({ olympiadId: card.id, directionId: idByCode.get(m.code)!, viaRsosh: m.viaRsosh, subjectRelevance: m.subjectRelevance });
  }
  for (let i = 0; i < rows.length; i += 1000) await tx.insert(olympiadDirections).values(rows.slice(i, i + 1000));
  return { rows: rows.length, viaRsosh: rows.filter(r => r.viaRsosh).length,
    core: rows.filter(r => r.subjectRelevance === 'core').length, related: rows.filter(r => r.subjectRelevance === 'related').length };
}
