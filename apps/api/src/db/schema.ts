import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, integer, serial, smallint, text, timestamp, jsonb, doublePrecision, date, uuid, boolean, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/pg-core';

export const formatEnum = pgEnum('olympiad_format', ['onsite', 'online', 'hybrid', 'unknown']);
export const participationEnum = pgEnum('participation_type', ['individual', 'team', 'mixed', 'unknown']);
export const scheduleEnum = pgEnum('schedule_status', ['published', 'unknown', 'not_held']);
export const verificationEnum = pgEnum('date_verification', ['unverified', 'verified', 'needs_review']);
export const stageKindEnum = pgEnum('stage_kind', ['registration', 'competition', 'other']);
export const stageOriginEnum = pgEnum('stage_origin', ['csv', 'verified_import']);
export const levelSourceEnum = pgEnum('level_source', ['rsosh_list', 'catalog', 'series']);
export const stageModeEnum = pgEnum('stage_mode', ['online', 'onsite', 'mixed']);
export const scheduleQualityEnum = pgEnum('schedule_quality', ['ok', 'placeholder', 'outdated', 'hidden']);
export const benefitKindEnum = pgEnum('benefit_kind', ['bvi', 'score_100']);
export const benefitDiplomaEnum = pgEnum('benefit_diploma', ['any', 'winner']);
// Keep in sync with LEVELS in apps/api/src/reference/model.ts.
const levelValues = sql`('I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ')`;
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
  // Resolved by the reference layer (data/reference); falls back to the catalog export's own level columns.
  level: text('level'), levelProfile: text('level_profile'), levelStatus: text('level_status'),
  levelSourceUrl: text('level_source_url'), levelSource: levelSourceEnum('level_source'),
}, t => [
  uniqueIndex('olympiads_source_url_unique').on(t.sourceUrl),
  index('olympiads_grades_idx').on(t.gradeFrom, t.gradeTo),
  index('olympiads_filters_idx').on(t.format, t.participation, t.scheduleStatus),
  index('olympiads_rating_idx').on(t.rating, t.id),
  index('olympiads_search_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  check('olympiads_id_positive', sql`${t.id} > 0`),
  check('olympiads_grades_valid', sql`(${t.gradeFrom} is null and ${t.gradeTo} is null) or (${t.gradeFrom} is not null and ${t.gradeTo} is not null and ${t.gradeFrom} between 1 and 11 and ${t.gradeTo} between ${t.gradeFrom} and 11)`),
  check('olympiads_rating_valid', sql`${t.rating} is null or ${t.rating} between 0 and 10`),
  check('olympiads_level_valid', sql`${t.level} is null or ${t.level} in ${levelValues}`),
  index('olympiads_level_idx').on(t.level),
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
  avatar: text('avatar'),
  profileName: text('profile_name'), grade: integer('grade'), region: text('region').notNull().default(''),
  online: boolean('online').notNull().default(true), onsite: boolean('onsite').notNull().default(true),
  registeredAt: timestamp('registered_at', { withTimezone: true, mode: 'string' }),
  updatedAt: timestampNow('updated_at'),
}, t => [
  check('profile_avatar_length', sql`${t.avatar} is null or length(${t.avatar}) <= 1400000`),
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

// ---- Reference layer: olympiad series, their stages, RSOSH profiles, universities and admission benefits ----
// Loaded from data/reference by `pnpm db:reference` (also part of `pnpm db:import`). Rows are derived data:
// every run rewrites them from the files, so edit the CSV files, not these tables.
export const olympiadSeries = pgTable('olympiad_series', {
  id: serial('id').primaryKey(), slug: text('slug').notNull().unique(), name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull(), catalogGroup: text('catalog_group'),
  generalLevel: text('general_level'), formatRaw: text('format_raw'), scheduleRaw: text('schedule_raw'),
  scheduleQuality: scheduleQualityEnum('schedule_quality').notNull().default('ok'),
  rsoshTitle: text('rsosh_title'), rsoshNumber: integer('rsosh_number'), note: text('note'),
  updatedAt: timestampNow('updated_at'),
}, t => [
  check('series_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check('series_general_level_valid', sql`${t.generalLevel} is null or ${t.generalLevel} in ${levelValues}`),
]);
export const seriesStages = pgTable('series_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  seriesId: integer('series_id').notNull().references(() => olympiadSeries.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(), name: text('name').notNull(), kind: stageKindEnum('kind').notNull(),
  rawDates: text('raw_dates').notNull(), mode: stageModeEnum('mode'),
  // Filled only when the source states the year; yearless dates stay in raw_dates.
  beginsOn: date('begins_on'), endsOn: date('ends_on'),
}, t => [
  uniqueIndex('series_stages_position_unique').on(t.seriesId, t.position),
  check('series_stages_dates_ordered', sql`${t.beginsOn} is null or ${t.endsOn} is null or ${t.beginsOn} <= ${t.endsOn}`),
]);
export const seriesProfiles = pgTable('series_profiles', {
  id: serial('id').primaryKey(),
  seriesId: integer('series_id').notNull().references(() => olympiadSeries.id, { onDelete: 'cascade' }),
  season: text('season').notNull(), profile: text('profile').notNull(), level: smallint('level').notNull(),
  fieldsOfStudy: text('fields_of_study'),
}, t => [
  uniqueIndex('series_profiles_unique').on(t.seriesId, t.season, t.profile),
  check('series_profiles_level_valid', sql`${t.level} between 1 and 3`),
]);
export const olympiadSeriesLinks = pgTable('olympiad_series_links', {
  olympiadId: integer('olympiad_id').primaryKey().references(() => olympiads.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => olympiadSeries.id, { onDelete: 'cascade' }),
  // RSOSH profiles of the series covered by this card; [] = the card's profile is not in the list; ['*'] = all.
  profiles: jsonb('profiles').$type<string[]>().notNull(), note: text('note'),
  // The card's own published olimpiada.ru calendar shares no date with the series schedule: show the catalog one.
  scheduleConflict: boolean('schedule_conflict').notNull().default(false),
}, t => [index('olympiad_series_links_series_idx').on(t.seriesId, t.olympiadId)]);
export const universities = pgTable('universities', {
  id: serial('id').primaryKey(), slug: text('slug').notNull().unique(), name: text('name').notNull().unique(),
  fullName: text('full_name'), city: text('city').notNull(), aliases: jsonb('aliases').$type<string[]>().notNull(),
}, t => [check('universities_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)]);
export const seriesBenefits = pgTable('series_benefits', {
  id: serial('id').primaryKey(),
  universityId: integer('university_id').notNull().references(() => universities.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => olympiadSeries.id, { onDelete: 'cascade' }),
  kind: benefitKindEnum('kind').notNull(), diploma: benefitDiplomaEnum('diploma').notNull(),
  minScore: smallint('min_score'), maxScore: smallint('max_score'),
  requirement: text('requirement'), requirementRaw: text('requirement_raw'),
}, t => [
  uniqueIndex('series_benefits_unique').on(t.universityId, t.seriesId, t.kind, t.diploma),
  index('series_benefits_series_idx').on(t.seriesId),
  check('series_benefits_scores_valid', sql`(${t.minScore} is null or ${t.minScore} between 0 and 100) and (${t.maxScore} is null or (${t.maxScore} between 0 and 100 and ${t.minScore} is not null and ${t.maxScore} >= ${t.minScore}))`),
]);
// One row per reference source (olympiads_clean, RSOSH list, benefits): what was loaded and how to label it.
export const referenceSources = pgTable('reference_sources', {
  key: text('key').primaryKey(), file: text('file').notNull(), description: text('description'),
  sha256: text('sha256').notNull(), season: text('season').notNull(), status: text('status'), url: text('url'),
  importedAt: timestampNow('imported_at'),
});
