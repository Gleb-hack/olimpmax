import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Database } from '../db/client.js';
import { olympiads, olympiadSubjects, subjects, stages } from '../db/schema.js';
import type { CatalogQuery, Stage, OlympiadCard } from '../../../../packages/contracts/src/index.js';
import { normalizeSearch } from '../import/csv.js';
import { calendarSummary, moscowToday } from './calendar.js';

type Olympiad = typeof olympiads.$inferSelect;
export async function enrich(db: Database, rows: Olympiad[], today = moscowToday()) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [links, stageRows] = await Promise.all([
    db.select({ olympiadId: olympiadSubjects.olympiadId, id: subjects.id, name: subjects.name }).from(olympiadSubjects)
      .innerJoin(subjects, eq(subjects.id, olympiadSubjects.subjectId)).where(inArray(olympiadSubjects.olympiadId, ids)).orderBy(subjects.name),
    db.select().from(stages).where(inArray(stages.olympiadId, ids)).orderBy(stages.origin, stages.sourceKey),
  ]);
  const subjectMap = new Map<number, { id: number; name: string }[]>();
  const stageMap = new Map<number, z.infer<typeof Stage>[]>();
  for (const link of links) {
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
  return rows.map(row => {
    const rowStages = stageMap.get(row.id) ?? [];
    const card: z.infer<typeof OlympiadCard> = {
      id: row.id, title: row.title, description: row.description, organizers: row.organizers, subjects: subjectMap.get(row.id) ?? [],
      gradeFrom: row.gradeFrom, gradeTo: row.gradeTo, classesRaw: row.classesRaw,
      format: row.format, participation: row.participation, rating: row.rating,
      scheduleStatus: row.scheduleStatus, statusRaw: row.statusRaw, sourceUrl: row.sourceUrl, sourceGroup: row.sourceGroup,
      ...calendarSummary(rowStages, row.scheduleStatus, today),
    };
    return { row, card, stages: rowStages };
  });
}
export async function catalog(db: Database, query: CatalogQuery, today = moscowToday(), options: { excludeNotHeld?: boolean } = {}) {
  const conditions = [];
  if (options.excludeNotHeld) conditions.push(sql`${olympiads.scheduleStatus} <> 'not_held'`);
  // Every normalized word must occur; punctuation, case and е/ё do not affect lookup.
  if (query.q) for (const token of normalizeSearch(query.q).split(' ').filter(Boolean)) conditions.push(like(olympiads.searchText, `%${token}%`));
  if (query.subjectIds) conditions.push(inArray(olympiads.id,
    db.select({ id: olympiadSubjects.olympiadId }).from(olympiadSubjects).where(inArray(olympiadSubjects.subjectId, query.subjectIds))));
  if (query.grades) conditions.push(or(...query.grades.map(g => sql`${olympiads.gradeFrom} <= ${g} and ${olympiads.gradeTo} >= ${g}`)));
  if (query.formats) conditions.push(inArray(olympiads.format, query.formats));
  if (query.participation) conditions.push(inArray(olympiads.participation, query.participation));
  if (query.scheduleStatus) conditions.push(eq(olympiads.scheduleStatus, query.scheduleStatus));
  const where = and(...conditions);
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
  const { row, card, stages } = item;
  return { ...card, stages, organizers: row.organizers, contacts: row.contacts, documents: row.documents,
    featuresRaw: row.featuresRaw, calendarRaw: row.calendarRaw, scheduleUpdatedRaw: row.scheduleUpdatedRaw,
    rawSource: row.rawSource, importedAt: row.importedAt };
}
export async function filters(db: Database) {
  const [subjectRows, rows] = await Promise.all([
    db.select({ id: subjects.id, name: subjects.name, count: count() }).from(subjects)
      .innerJoin(olympiadSubjects, eq(subjects.id, olympiadSubjects.subjectId)).groupBy(subjects.id, subjects.name).orderBy(subjects.name),
    db.select({ gradeFrom: olympiads.gradeFrom, gradeTo: olympiads.gradeTo, format: olympiads.format,
      participation: olympiads.participation, scheduleStatus: olympiads.scheduleStatus }).from(olympiads),
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
  };
}
