import { and, asc, count, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/client.js';
import { olympiads, olympiadSubjects, subjects, stages, olympiadSeries, olympiadSeriesLinks, seriesStages, seriesBenefits, universities } from '../db/schema.js';
import { olympiadLevelOptions, type CatalogQuery, type Stage, type OlympiadCard } from '../../../../packages/contracts/src/index.js';
import { normalizeSearch } from '../import/csv.js';
import { calendarSummary, moscowToday } from './calendar.js';
import { olympiadBenefits, seriesInfo } from './reference.js';

type Olympiad = typeof olympiads.$inferSelect;
type CardStage = z.infer<typeof Stage>;
const modeLabels = { online: 'онлайн', onsite: 'очно', mixed: 'очно/дистанционно' } as const;
/** Text form of the reference schedule, same «Этап: даты» lines as the olimpiada.ru calendar. */
export function referenceCalendarText(list: CardStage[]) {
  return list.map(s => `${s.name}: ${s.rawDates}${s.mode ? ` (${modeLabels[s.mode]})` : ''}`).join('\n') || null;
}

export async function enrich(db: Database, rows: Olympiad[], today = moscowToday()) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [subjectLinks, stageRows, seriesLinks] = await Promise.all([
    db.select({ olympiadId: olympiadSubjects.olympiadId, id: subjects.id, name: subjects.name }).from(olympiadSubjects)
      .innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId)).where(inArray(olympiadSubjects.olympiadId, ids)).orderBy(subjects.name),
    db.select().from(stages).where(inArray(stages.olympiadId, ids)).orderBy(stages.origin, stages.sourceKey),
    db.select({ olympiadId: olympiadSeriesLinks.olympiadId, profiles: olympiadSeriesLinks.profiles, scheduleConflict: olympiadSeriesLinks.scheduleConflict, seriesId: olympiadSeries.id,
      slug: olympiadSeries.slug, name: olympiadSeries.name, scheduleQuality: olympiadSeries.scheduleQuality })
      .from(olympiadSeriesLinks).innerJoin(olympiadSeries, eq(olympiadSeries.id, olympiadSeriesLinks.seriesId))
      .where(inArray(olympiadSeriesLinks.olympiadId, ids)),
  ]);
  const seriesIds = [...new Set(seriesLinks.map(l => l.seriesId))];
  const referenceRows = seriesIds.length
    ? await db.select().from(seriesStages).where(inArray(seriesStages.seriesId, seriesIds)).orderBy(seriesStages.seriesId, seriesStages.position) : [];
  const subjectMap = new Map<number, { id: number; name: string }[]>();
  const stageMap = new Map<number, CardStage[]>();
  const referenceMap = new Map<number, CardStage[]>();
  const seriesMap = new Map(seriesLinks.map(l => [l.olympiadId, l]));
  for (const link of subjectLinks) {
    const list = subjectMap.get(link.olympiadId) ?? [];
    list.push({ id: link.id, name: link.name }); subjectMap.set(link.olympiadId, list);
  }
  for (const stage of stageRows) {
    const list = stageMap.get(stage.olympiadId) ?? [];
    list.push({ id: stage.id, name: stage.name, kind: stage.kind, rawDates: stage.rawDates,
      beginsOn: stage.beginsOn, endsOn: stage.endsOn, timezone: 'Europe/Moscow', verification: stage.verification,
      sourceUrl: stage.sourceUrl, verifiedAt: stage.verifiedAt, origin: stage.origin });
    stageMap.set(stage.olympiadId, list);
  }
  for (const stage of referenceRows) {
    const list = referenceMap.get(stage.seriesId) ?? [];
    // Reference stages are never «verified»: they have no source link, so they never produce reminders.
    list.push({ id: stage.id, name: stage.name, kind: stage.kind, rawDates: stage.rawDates, beginsOn: stage.beginsOn, endsOn: stage.endsOn,
      timezone: 'Europe/Moscow', verification: 'unverified', sourceUrl: null, verifiedAt: null, origin: 'reference', mode: stage.mode });
    referenceMap.set(stage.seriesId, list);
  }
  return rows.map(row => {
    const link = seriesMap.get(row.id);
    const reference = link ? referenceMap.get(link.seriesId) ?? [] : [];
    // olympiads_clean is the primary schedule unless its series is flagged (placeholder, outdated, hidden)
    // or this card's own published olimpiada.ru calendar contradicts it.
    const scheduleSource = link && reference.length && link.scheduleQuality === 'ok' && !link.scheduleConflict && row.scheduleStatus !== 'not_held'
      ? 'reference' as const : 'catalog' as const;
    const rowStages = [...stageMap.get(row.id) ?? [], ...reference];
    const effectiveStatus = scheduleSource === 'reference' && row.scheduleStatus === 'unknown' ? 'published' as const : row.scheduleStatus;
    const card: z.infer<typeof OlympiadCard> = {
      id: row.id, title: row.title, description: row.description, organizers: row.organizers, subjects: subjectMap.get(row.id) ?? [],
      gradeFrom: row.gradeFrom, gradeTo: row.gradeTo, classesRaw: row.classesRaw,
      format: row.format, participation: row.participation, rating: row.rating,
      scheduleStatus: row.scheduleStatus, statusRaw: row.statusRaw, sourceUrl: row.sourceUrl, sourceGroup: row.sourceGroup,
      calendarRaw: scheduleSource === 'reference' ? referenceCalendarText(reference) : row.calendarRaw,
      level: row.level, levelProfile: row.levelProfile, levelStatus: row.levelStatus,
      levelSourceUrl: row.levelSourceUrl, levelSource: row.levelSource,
      series: link ? { slug: link.slug, name: link.name } : null, scheduleSource,
      ...calendarSummary(rowStages, effectiveStatus, today),
    };
    return { row, card, stages: rowStages, link: link ?? null };
  });
}

const levelSql = sql`coalesce(${olympiads.level}, 'unknown')`;
export function catalogConditions(db: Database, query: CatalogQuery, options: { excludeNotHeld?: boolean; requireSchedule?: boolean } = {}) {
  const conditions: (SQL | undefined)[] = [eq(olympiads.inCatalog, true)];
  if (options.excludeNotHeld) conditions.push(sql`${olympiads.scheduleStatus} <> 'not_held'`);
  // Every normalized word must occur; punctuation, case and е/ё do not affect lookup.
  if (query.q) for (const token of normalizeSearch(query.q).split(' ').filter(Boolean)) conditions.push(like(olympiads.searchText, `%${token}%`));
  if (query.subjectIds) conditions.push(inArray(olympiads.id,
    db.select({ id: olympiadSubjects.olympiadId }).from(olympiadSubjects).where(inArray(olympiadSubjects.subjectId, query.subjectIds))));
  if (query.grades) conditions.push(or(...query.grades.map(g => sql`${olympiads.gradeFrom} <= ${g} and ${olympiads.gradeTo} >= ${g}`)));
  if (query.formats) conditions.push(inArray(olympiads.format, query.formats));
  if (query.levels) conditions.push(inArray(levelSql, query.levels));
  if (query.participation) conditions.push(inArray(olympiads.participation, query.participation));
  if (query.scheduleStatus) conditions.push(eq(olympiads.scheduleStatus, query.scheduleStatus));
  if (query.series) conditions.push(inArray(olympiads.id, db.select({ id: olympiadSeriesLinks.olympiadId }).from(olympiadSeriesLinks)
    .innerJoin(olympiadSeries, eq(olympiadSeries.id, olympiadSeriesLinks.seriesId)).where(inArray(olympiadSeries.slug, query.series))));
  if (query.universities) {
    // A benefit applies only to cards with a level: a profile outside the RSOSH list gives no admission benefit.
    conditions.push(sql`${olympiads.level} is not null`);
    conditions.push(inArray(olympiads.id, db.select({ id: olympiadSeriesLinks.olympiadId }).from(olympiadSeriesLinks)
      .innerJoin(seriesBenefits, eq(seriesBenefits.seriesId, olympiadSeriesLinks.seriesId))
      .innerJoin(universities, eq(universities.id, seriesBenefits.universityId)).where(inArray(universities.slug, query.universities))));
  }
  if (options.requireSchedule) conditions.push(or(
    sql`nullif(trim(${olympiads.calendarRaw}), '') is not null`,
    inArray(olympiads.id, db.select({ id: stages.olympiadId }).from(stages)
      .where(and(eq(stages.origin, 'csv'), sql`nullif(trim(${stages.rawDates}), '') is not null`))),
    inArray(olympiads.id, db.select({ id: olympiadSeriesLinks.olympiadId }).from(olympiadSeriesLinks)
      .innerJoin(olympiadSeries, eq(olympiadSeries.id, olympiadSeriesLinks.seriesId))
      .where(and(eq(olympiadSeries.scheduleQuality, 'ok'), sql`exists (select 1 from ${seriesStages} where ${seriesStages.seriesId} = ${olympiadSeries.id})`))),
  ));
  return and(...conditions);
}
export async function catalog(db: Database, query: CatalogQuery, today = moscowToday(), options: { excludeNotHeld?: boolean; requireSchedule?: boolean } = {}) {
  const where = catalogConditions(db, query, options);
  const [rows, total] = await Promise.all([
    db.select().from(olympiads).where(where).orderBy(...(query.sort === 'name' ? [asc(olympiads.title), asc(olympiads.id)] : [sql`${olympiads.rating} desc nulls last`, asc(olympiads.id)]))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(olympiads).where(where),
  ]);
  return { items: (await enrich(db, rows, today)).map(r => r.card), total: total[0]!.value, page: query.page, pageSize: query.pageSize };
}
export async function detail(db: Database, id: number, today = moscowToday()) {
  const rows = await db.select().from(olympiads).where(eq(olympiads.id, id));
  const item = (await enrich(db, rows, today))[0];
  if (!item) return null;
  const { row, card, stages, link } = item;
  const [info, benefits] = link ? await Promise.all([seriesInfo(db, link.seriesId), olympiadBenefits(db, link.seriesId, link.name, card.level ?? null)])
    : [null, { applicable: false, note: null, items: [] }];
  return { ...card, stages, organizers: row.organizers, contacts: row.contacts, documents: row.documents,
    featuresRaw: row.featuresRaw, calendarRaw: card.calendarRaw ?? null, scheduleUpdatedRaw: row.scheduleUpdatedRaw,
    rawSource: row.rawSource, importedAt: row.importedAt, catalogCalendarRaw: row.calendarRaw, seriesInfo: info, benefits };
}
export async function filters(db: Database) {
  const [subjectRows, rows, universityRows] = await Promise.all([
    db.select({ id: subjects.id, name: subjects.name, count: count() }).from(subjects)
      .innerJoin(olympiadSubjects, eq(subjects.id, olympiadSubjects.subjectId))
      .innerJoin(olympiads, eq(olympiads.id, olympiadSubjects.olympiadId)).where(eq(olympiads.inCatalog, true))
      .groupBy(subjects.id, subjects.name).orderBy(subjects.name),
    db.select({ gradeFrom: olympiads.gradeFrom, gradeTo: olympiads.gradeTo, format: olympiads.format,
      participation: olympiads.participation, scheduleStatus: olympiads.scheduleStatus, level: olympiads.level }).from(olympiads).where(eq(olympiads.inCatalog, true)),
    db.select({ slug: universities.slug, name: universities.name, city: universities.city, count: sql<number>`count(distinct ${olympiads.id})::int` })
      .from(universities).innerJoin(seriesBenefits, eq(seriesBenefits.universityId, universities.id))
      .innerJoin(olympiadSeriesLinks, eq(olympiadSeriesLinks.seriesId, seriesBenefits.seriesId))
      .innerJoin(olympiads, and(eq(olympiads.id, olympiadSeriesLinks.olympiadId), eq(olympiads.inCatalog, true), sql`${olympiads.level} is not null`))
      .groupBy(universities.slug, universities.name, universities.city).orderBy(universities.name),
  ]);
  const formatLabels = { onsite: 'Очная', online: 'Дистанционная', hybrid: 'Очно-заочная', unknown: 'Не указан' } as const;
  const participationLabels = { individual: 'Личная', team: 'Командная', mixed: 'Лично-командная', unknown: 'Не указан' } as const;
  const statusLabels = { published: 'Есть расписание', unknown: 'Расписание неизвестно', not_held: 'Не проводится' } as const;
  return {
    subjects: subjectRows,
    grades: Array.from({ length: 11 }, (_, i) => ({ value: i + 1, count: rows.filter(r => r.gradeFrom !== null && r.gradeTo !== null && r.gradeFrom <= i + 1 && r.gradeTo >= i + 1).length })),
    formats: (Object.keys(formatLabels) as (keyof typeof formatLabels)[]).map(value => ({ value, label: formatLabels[value], count: rows.filter(r => r.format === value).length })),
    participation: (Object.keys(participationLabels) as (keyof typeof participationLabels)[]).map(value => ({ value, label: participationLabels[value], count: rows.filter(r => r.participation === value).length })),
    scheduleStatuses: (Object.keys(statusLabels) as (keyof typeof statusLabels)[]).map(value => ({ value, label: statusLabels[value], count: rows.filter(r => r.scheduleStatus === value).length })),
    levels: olympiadLevelOptions.map(({ value, label }) => ({ value, label, count: rows.filter(r => (r.level ?? 'unknown') === value).length })),
    universities: universityRows,
  };
}
