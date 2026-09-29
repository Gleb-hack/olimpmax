// Read side of the reference layer: series, RSOSH profiles, universities and admission benefits.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { olympiads, olympiadSeries, olympiadSeriesLinks, seriesStages, seriesProfiles, seriesBenefits, universities, referenceSources, universityPrograms } from '../db/schema.js';
import { universityProfiles } from '../reference/university-profiles.js';
import { universityProgramList } from './directions.js';

async function currentSeason(db: Database) {
  const [row] = await db.select({ season: referenceSources.season }).from(referenceSources).where(eq(referenceSources.key, 'rsosh'));
  return row?.season ?? null;
}
const benefitColumns = {
  kind: seriesBenefits.kind, diploma: seriesBenefits.diploma, minScore: seriesBenefits.minScore,
  maxScore: seriesBenefits.maxScore, requirement: seriesBenefits.requirement,
};

export async function seriesInfo(db: Database, seriesId: number) {
  const [[series], season] = await Promise.all([db.select().from(olympiadSeries).where(eq(olympiadSeries.id, seriesId)), currentSeason(db)]);
  if (!series) return null;
  const profiles = season ? await db.select({ profile: seriesProfiles.profile, level: seriesProfiles.level, fieldsOfStudy: seriesProfiles.fieldsOfStudy })
    .from(seriesProfiles).where(and(eq(seriesProfiles.seriesId, seriesId), eq(seriesProfiles.season, season))).orderBy(seriesProfiles.level, seriesProfiles.profile) : [];
  return { slug: series.slug, name: series.name, generalLevel: series.generalLevel, formatRaw: series.formatRaw,
    scheduleQuality: series.scheduleQuality, rsoshTitle: series.rsoshTitle, note: series.note, profiles };
}

/** Benefits are stored per series; they apply to a card only when the card itself has a level. */
export async function olympiadBenefits(db: Database, seriesId: number, seriesName: string, level: string | null) {
  const rows = await db.select({ ...benefitColumns, slug: universities.slug, name: universities.name, city: universities.city, fullName: universities.fullName })
    .from(seriesBenefits).innerJoin(universities, eq(universities.id, seriesBenefits.universityId))
    .where(eq(seriesBenefits.seriesId, seriesId)).orderBy(universities.name, seriesBenefits.kind, seriesBenefits.diploma);
  const items = rows.map(({ slug, name, city, fullName, ...benefit }) => ({ university: { slug, name, city, fullName }, ...benefit }));
  const applicable = level !== null;
  const season = items.length && !applicable ? await currentSeason(db) : null;
  const note = !items.length ? null : applicable
    ? 'Льгота зависит от профиля олимпиады и направления поступления — сверяйтесь с правилами приёма вуза.'
    : `Льготы указаны для олимпиады «${seriesName}» в целом, но профиль этой карточки не входит в перечень РСОШ${season ? ` ${season}` : ''}, поэтому на неё они не распространяются.`;
  return { applicable, note, items: applicable ? items : [] };
}

export async function universityList(db: Database) {
  const rows = await db.select({ slug: universities.slug, name: universities.name, fullName: universities.fullName, city: universities.city,
    seriesCount: sql<number>`count(distinct ${seriesBenefits.seriesId})::int`,
    olympiadCount: sql<number>`count(distinct ${olympiads.id}) filter (where ${olympiads.inCatalog} and ${olympiads.level} is not null)::int`,
    programCount: sql<number>`(select count(*) from ${universityPrograms} where ${universityPrograms.universityId} = ${universities.id})::int` })
    .from(universities).leftJoin(seriesBenefits, eq(seriesBenefits.universityId, universities.id))
    .leftJoin(olympiadSeriesLinks, eq(olympiadSeriesLinks.seriesId, seriesBenefits.seriesId))
    .leftJoin(olympiads, eq(olympiads.id, olympiadSeriesLinks.olympiadId))
    .groupBy(universities.id).orderBy(universities.name);
  return { items: rows };
}

export async function universityDetail(db: Database, slug: string) {
  const [university] = await db.select().from(universities).where(eq(universities.slug, slug));
  if (!university) return null;
  const rows = await db.select({ ...benefitColumns, seriesId: olympiadSeries.id, seriesSlug: olympiadSeries.slug, seriesName: olympiadSeries.name })
    .from(seriesBenefits).innerJoin(olympiadSeries, eq(olympiadSeries.id, seriesBenefits.seriesId))
    .where(eq(seriesBenefits.universityId, university.id)).orderBy(olympiadSeries.name, seriesBenefits.kind, seriesBenefits.diploma);
  const seriesIds = [...new Set(rows.map(r => r.seriesId))];
  // A benefit applies only to catalog cards with a level, the same rule as the catalog filter.
  const members = seriesIds.length ? await db.select({ seriesId: olympiadSeriesLinks.seriesId, id: olympiads.id, title: olympiads.title, organizers: olympiads.organizers }).from(olympiadSeriesLinks)
    .innerJoin(olympiads, eq(olympiads.id, olympiadSeriesLinks.olympiadId))
    .where(and(inArray(olympiadSeriesLinks.seriesId, seriesIds), eq(olympiads.inCatalog, true), sql`${olympiads.level} is not null`)).orderBy(olympiads.id) : [];
  const bySeries = new Map<number, { id: number; title: string }[]>();
  const organizersBySeries = new Map<number, Set<string>>();
  for (const m of members) {
    bySeries.set(m.seriesId, [...bySeries.get(m.seriesId) ?? [], { id: m.id, title: m.title }]);
    const set = organizersBySeries.get(m.seriesId) ?? new Set<string>();
    for (const organizer of m.organizers) if (organizer.trim()) set.add(organizer.trim());
    organizersBySeries.set(m.seriesId, set);
  }
  const profile = universityProfiles().get(university.slug);
  const programs = await universityProgramList(db, university.id);
  return {
    slug: university.slug, name: university.name, fullName: university.fullName, city: university.city,
    type: profile?.type ?? null, description: profile?.description ?? null, site: profile?.site ?? null, rules: profile?.rules ?? null,
    benefits: rows.map(({ seriesId, seriesSlug, seriesName, ...benefit }) => {
      const list = bySeries.get(seriesId) ?? [];
      return { ...benefit, series: { slug: seriesSlug, name: seriesName }, olympiadIds: list.map(o => o.id),
        olympiads: [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.id - b.id),
        organizers: [...organizersBySeries.get(seriesId) ?? []].slice(0, 10) };
    }),
    programs,
  };
}

export async function seriesDetail(db: Database, slug: string) {
  const [series] = await db.select().from(olympiadSeries).where(eq(olympiadSeries.slug, slug));
  if (!series) return null;
  const [info, stageRows, members, benefits] = await Promise.all([
    seriesInfo(db, series.id),
    db.select().from(seriesStages).where(eq(seriesStages.seriesId, series.id)).orderBy(asc(seriesStages.position)),
    db.select({ id: olympiads.id, title: olympiads.title, inCatalog: olympiads.inCatalog, profiles: olympiadSeriesLinks.profiles, level: olympiads.level })
      .from(olympiadSeriesLinks).innerJoin(olympiads, eq(olympiads.id, olympiadSeriesLinks.olympiadId))
      .where(eq(olympiadSeriesLinks.seriesId, series.id)).orderBy(olympiads.title),
    olympiadBenefits(db, series.id, series.name, 'series'),
  ]);
  return { ...info!, aliases: series.aliases, benefits: benefits.items, olympiads: members,
    stages: stageRows.map(s => ({ id: s.id, position: s.position, name: s.name, kind: s.kind, rawDates: s.rawDates, mode: s.mode, beginsOn: s.beginsOn, endsOn: s.endsOn })) };
}
