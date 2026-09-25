import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, integer, serial, text, timestamp, jsonb, doublePrecision, date, uuid, boolean, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/pg-core';

export const formatEnum = pgEnum('olympiad_format', ['onsite', 'online', 'hybrid', 'unknown']);
export const participationEnum = pgEnum('participation_type', ['individual', 'team', 'mixed', 'unknown']);
export const scheduleEnum = pgEnum('schedule_status', ['published', 'unknown', 'not_held']);
export const verificationEnum = pgEnum('date_verification', ['unverified', 'verified', 'needs_review']);
export const stageKindEnum = pgEnum('stage_kind', ['registration', 'competition', 'other']);
export const stageOriginEnum = pgEnum('stage_origin', ['csv', 'verified_import']);
const timestampNow = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' }).notNull().defaultNow();

export const olympiads = pgTable('olympiads', {
  inCatalog: boolean('in_catalog').notNull().default(true),
  id: integer('id').primaryKey(), title: text('title').notNull(), description: text('description'),
  gradeFrom: integer('grade_from'), gradeTo: integer('grade_to'), classesRaw: text('classes_raw'),
  format: formatEnum('format').notNull(), participation: participationEnum('participation').notNull(),
  rating: doublePrecision('rating'), scheduleStatus: scheduleEnum('schedule_status').notNull(),
  statusRaw: text('status_raw').notNull(), calendarRaw: text('calendar_raw'), calendarHash: text('calendar_hash').notNull(),
  scheduleUpdatedRaw: text('schedule_updated_raw'),
  organizers: jsonb('organizers').$type<string[]>().notNull(), contacts: jsonb('contacts').$type<string[]>().notNull(),
  documents: jsonb('documents').$type<string[]>().notNull(), featuresRaw: text('features_raw'),
  sourceUrl: text('source_url').notNull(), sourceGroup: text('source_group'),
  rawSource: jsonb('raw_source').$type<Record<string, string>>().notNull(),
  searchText: text('search_text').notNull(), firstImportedAt: timestampNow('first_imported_at'), importedAt: timestampNow('imported_at'),
}, t => [
  uniqueIndex('olympiads_source_url_unique').on(t.sourceUrl),
  index('olympiads_grades_idx').on(t.gradeFrom, t.gradeTo),
  index('olympiads_filters_idx').on(t.format, t.participation, t.scheduleStatus),
  index('olympiads_rating_idx').on(t.rating, t.id),
  index('olympiads_search_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  check('olympiads_id_positive', sql`${t.id} > 0`),
  check('olympiads_grades_valid', sql`(${t.gradeFrom} is null and ${t.gradeTo} is null) or (${t.gradeFrom} is not null and ${t.gradeTo} is not null and ${t.gradeFrom} between 1 and 11 and ${t.gradeTo} between ${t.gradeFrom} and 11)`),
  check('olympiads_rating_valid', sql`${t.rating} is null or ${t.rating} between 0 and 10`),
]);
export const subjects = pgTable('subjects', { id: serial('id').primaryKey(), name: text('name').notNull().unique() });
export const olympiadSubjects = pgTable('olympiad_subjects', {
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
}, t => [primaryKey({ columns: [t.olympiadId, t.subjectId] }), index('olympiad_subjects_subject_idx').on(t.subjectId, t.olympiadId)]);
export const stages = pgTable('olympiad_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(), origin: stageOriginEnum('origin').notNull(),
  name: text('name'), kind: stageKindEnum('kind').notNull(), rawDates: text('raw_dates'),
  beginsOn: date('begins_on'), endsOn: date('ends_on'), timezone: text('timezone').notNull().default('Europe/Moscow'),
  verification: verificationEnum('verification').notNull().default('unverified'),
  sourceUrl: text('source_url'), verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }),
  verifiedBy: text('verified_by'), calendarHash: text('calendar_hash').notNull(),
  updatedAt: timestampNow('updated_at'),
}, t => [
  uniqueIndex('stages_source_key_unique').on(t.olympiadId, t.origin, t.sourceKey),
  index('stages_next_event_idx').on(t.verification, t.beginsOn, t.endsOn),
  check('stages_dates_ordered', sql`${t.beginsOn} is null or ${t.endsOn} is null or ${t.beginsOn} <= ${t.endsOn}`),
  check('stages_timezone_valid', sql`${t.timezone} = 'Europe/Moscow'`),
  check('stages_verified_evidence', sql`${t.verification} <> 'verified' or (${t.origin} = 'verified_import' and ${t.sourceUrl} is not null and ${t.verifiedAt} is not null and ${t.verifiedBy} is not null and (${t.beginsOn} is not null or ${t.endsOn} is not null))`),
  check('stages_csv_no_dates', sql`${t.origin} <> 'csv' or (${t.beginsOn} is null and ${t.endsOn} is null and ${t.verification} = 'unverified')`),
]);
export const users = pgTable('user_profiles', {
  id: uuid('id').primaryKey().defaultRandom(), maxUserId: text('max_user_id').notNull().unique(),
  displayName: text('display_name').notNull(), createdAt: timestampNow('created_at'),
  profileName: text('profile_name'), grade: integer('grade'), region: text('region').notNull().default(''),
  online: boolean('online').notNull().default(true), onsite: boolean('onsite').notNull().default(true),
  registeredAt: timestamp('registered_at', { withTimezone: true, mode: 'string' }),
  updatedAt: timestampNow('updated_at'),
}, t => [
  check('profile_name_length', sql`${t.profileName} is null or length(trim(${t.profileName})) between 1 and 80`),
  check('profile_grade_valid', sql`${t.grade} is null or ${t.grade} between 1 and 11`),
  check('profile_region_length', sql`length(${t.region}) <= 100`),
]);
export const userSubjects = pgTable('user_subjects', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
}, t => [primaryKey({ columns: [t.userId, t.subjectId] })]);
export const planItems = pgTable('plan_items', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  tracking: boolean('tracking').notNull().default(true), note: text('note'), savedAt: timestampNow('saved_at'),
}, t => [primaryKey({ columns: [t.userId, t.olympiadId] }), check('plan_note_length', sql`${t.note} is null or length(${t.note}) <= 2000`)]);
export const importRuns = pgTable('import_runs', {
  id: uuid('id').primaryKey().defaultRandom(), sourceFile: text('source_file').notNull(),
  sha256: text('sha256').notNull(), rowCount: integer('row_count').notNull(),
  report: jsonb('report').$type<Record<string, unknown>>().notNull(), createdAt: timestampNow('created_at'),
});
