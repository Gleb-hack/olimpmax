// Writes a validated reference bundle into PostgreSQL and recomputes olympiad levels.
// Every run fully rewrites the reference tables from the files, so the files stay the single source of truth.
import { eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  olympiads, olympiadSeries, seriesStages, seriesProfiles, olympiadSeriesLinks, universities, seriesBenefits, referenceSources, importRuns,
} from '../db/schema.js';
import { catalogLevel, resolveLevel, type ResolvedLevel, type RsoshMeta } from './levels.js';
import { checkAgainstCatalog, type ReferenceBundle, type ReferenceIssue } from './load.js';
import { scheduleConflicts, type Level } from './model.js';

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
  await tx.insert(referenceSources).values((['schedule', 'rsosh', 'benefits'] as const).map(key => {
    const source = manifest.sources[key];
    return { key, file: source.file, description: source.description ?? null, sha256: sha.get(source.file) ?? '', season: manifest.season,
      status: key === 'rsosh' ? manifest.sources.rsosh.status : null, url: key === 'rsosh' ? manifest.sources.rsosh.url : null, importedAt: now };
  }));

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

  const levels = await recomputeLevels(tx);
  const issues = [...bundle.issues, ...checkAgainstCatalog(bundle, catalog)];
  const count = <T,>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((acc, item) => { acc[key(item)] = (acc[key(item)] ?? 0) + 1; return acc; }, {});
  return {
    referenceSha256: bundle.sha256, season: manifest.season,
    series: bundle.series.length, seriesWithSchedule: bundle.series.filter(s => s.stages.length).length,
    scheduleQuality: count(bundle.series.filter(s => s.stages.length), s => s.scheduleQuality),
    seriesInRsoshList: bundle.series.filter(s => s.profiles.size).length, rsoshProfiles: profileRows.length,
    universities: bundle.universities.length, benefits: benefitRows.length,
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
