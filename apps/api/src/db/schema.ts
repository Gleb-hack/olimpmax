import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, integer, serial, smallint, text, timestamp, jsonb, doublePrecision, date, uuid, boolean, primaryKey, uniqueIndex, index, check, foreignKey } from 'drizzle-orm/pg-core';

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
  calendarHash: text('calendar_hash').notNull(),
  updatedAt: timestampNow('updated_at'),
}, t => [
  uniqueIndex('stages_source_key_unique').on(t.olympiadId, t.origin, t.sourceKey),
  index('stages_next_event_idx').on(t.verification, t.beginsOn, t.endsOn),
  check('stages_dates_ordered', sql`${t.beginsOn} is null or ${t.endsOn} is null or ${t.beginsOn} <= ${t.endsOn}`),
  check('stages_timezone_valid', sql`${t.timezone} = 'Europe/Moscow'`),
  check('stages_verified_evidence', sql`${t.verification} <> 'verified' or (${t.origin} = 'verified_import' and ${t.sourceUrl} is not null and ${t.verifiedAt} is not null and (${t.beginsOn} is not null or ${t.endsOn} is not null))`),
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
  // MAX bot: reminders on/off; when the user pressed «Начать» in the bot dialog; when MAX last refused
  // a message to this user (stopped bot, never started it). A later bot start re-enables delivery.
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  botStartedAt: timestamp('bot_started_at', { withTimezone: true, mode: 'string' }),
  botBlockedAt: timestamp('bot_blocked_at', { withTimezone: true, mode: 'string' }),
  // Secret of the plan calendar feed (/calendar/<token>.ics) a phone calendar subscribes to; null — no feed.
  calendarToken: text('calendar_token').unique(),
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
// Where the pupil is with a plan olympiad: planned → registered → in_progress (takes part) → done. Set by the user.
export const planStatusEnum = pgEnum('plan_status', ['planned', 'registered', 'in_progress', 'done']);
export const planItems = pgTable('plan_items', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  tracking: boolean('tracking').notNull().default(true), note: text('note'), savedAt: timestampNow('saved_at'),
  status: planStatusEnum('status').notNull().default('planned'),
}, t => [primaryKey({ columns: [t.userId, t.olympiadId] }), check('plan_note_length', sql`${t.note} is null or length(${t.note}) <= 2000`)]);
export const stageResultEnum = pgEnum('stage_result', ['passed', 'failed', 'prize', 'winner']);
/**
 * The pupil's result of a stage of a plan olympiad: passed / failed, prize-winner or winner.
 * The stage is kept by its name, not by a stage id: reference stages get new ids on every `db:reference`.
 * Removed together with the plan item (and so with the account).
 */
export const planStageResults = pgTable('plan_stage_results', {
  userId: uuid('user_id').notNull(), olympiadId: integer('olympiad_id').notNull(),
  stage: text('stage').notNull(), result: stageResultEnum('result').notNull(),
  updatedAt: timestampNow('updated_at'),
}, t => [
  primaryKey({ columns: [t.userId, t.olympiadId, t.stage] }),
  foreignKey({ name: 'plan_stage_results_plan_item_fk', columns: [t.userId, t.olympiadId], foreignColumns: [planItems.userId, planItems.olympiadId] }).onDelete('cascade'),
  check('plan_stage_results_stage_length', sql`length(trim(${t.stage})) between 1 and 200`),
]);
export const reminderStatusEnum = pgEnum('reminder_status', ['pending', 'sent', 'failed']);
/**
 * One row per reminder the bot decided to send: the unique key makes the daily run idempotent
 * (restarts, several workers). event_key is built from the stage kind, event kind and date, not from a stage id:
 * reference stages get new ids on every `db:reference`, and a new id must not repeat a reminder.
 */
export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  eventKey: text('event_key').notNull(), eventDate: date('event_date').notNull(),
  // Days-before threshold that fired: 7, 3, 1 or 0.
  bucket: smallint('bucket').notNull(),
  status: reminderStatusEnum('status').notNull().default('pending'),
  attempts: smallint('attempts').notNull().default(1), error: text('error'),
  createdAt: timestampNow('created_at'), updatedAt: timestampNow('updated_at'),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
}, t => [
  uniqueIndex('reminders_unique').on(t.userId, t.olympiadId, t.eventKey, t.bucket),
  index('reminders_status_idx').on(t.status, t.updatedAt),
  check('reminders_bucket_valid', sql`${t.bucket} between 0 and 30`),
]);
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

// ---- Directions of study and university programs (data/reference/directions.csv, sources/university_programs.csv) ----
// Rewritten by the reference import like the tables above; directions and universities keep their ids between runs,
// so the goals users picked (user_directions, user_universities) survive a re-import.
export const educationLevelEnum = pgEnum('education_level', ['bachelor', 'specialist']);
export const subjectRelevanceEnum = pgEnum('subject_relevance', ['core', 'related']);
export const programFundingEnum = pgEnum('program_funding', ['budget', 'paid_only', 'quota_only']);
export const directions = pgTable('directions', {
  id: serial('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
  educationLevel: educationLevelEnum('education_level').notNull(),
  ugsnCode: text('ugsn_code').notNull(), ugsnName: text('ugsn_name').notNull(),
  // Typical profile exams (Unified State Exam); the exact set of a university is in university_programs.
  egeSubjects: jsonb('ege_subjects').$type<string[]>().notNull(),
  popular: boolean('popular').notNull().default(false),
  aliases: jsonb('aliases').$type<string[]>().notNull(), note: text('note'),
}, t => [
  check('directions_code_format', sql`${t.code} ~ '^[0-9]{2}\\.0[35]\\.[0-9]{2}$'`),
  check('directions_ugsn_matches_code', sql`${t.ugsnCode} = substr(${t.code}, 1, 2) || '.00.00'`),
  index('directions_ugsn_idx').on(t.ugsnCode),
]);
/** Olympiad subjects of a direction: core — the olympiad leads to it directly, related — a close profile. */
export const directionSubjects = pgTable('direction_subjects', {
  directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id').notNull().references(() => subjects.id),
  relevance: subjectRelevanceEnum('relevance').notNull(),
  /** Order within the relevance as in directions.csv: position 0 of core is the direction's main subject. */
  position: smallint('position').notNull().default(0),
}, t => [primaryKey({ columns: [t.directionId, t.subjectId] }), index('direction_subjects_subject_idx').on(t.subjectId)]);
export const universityPrograms = pgTable('university_programs', {
  id: serial('id').primaryKey(),
  universityId: integer('university_id').notNull().references(() => universities.id, { onDelete: 'cascade' }),
  directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), faculty: text('faculty'),
  examsRequired: jsonb('exams_required').$type<string[]>().notNull(),
  // Groups to choose from: [["Информатика", "Физика"]] — one exam of each group.
  examsChoice: jsonb('exams_choice').$type<string[][]>().notNull(),
  internalExam: boolean('internal_exam').notNull().default(false),
  passingScore: smallint('passing_score'), passingScoreForm: text('passing_score_form'), passingYear: smallint('passing_year'),
  funding: programFundingEnum('funding').notNull(),
  sourceUrl: text('source_url').notNull(), sourceId: text('source_id'),
}, t => [
  index('university_programs_university_idx').on(t.universityId, t.directionId),
  index('university_programs_direction_idx').on(t.directionId),
  check('university_programs_score_valid', sql`${t.passingScore} is null or (${t.passingScore} between 0 and 500 and ${t.passingYear} is not null)`),
]);
/**
 * Derived: which directions an olympiad card suits. Recomputed after every catalog or reference import.
 * via_rsosh — a covered RSOSH profile of the card names the direction or its group; subject_relevance — by subjects.
 */
export const olympiadDirections = pgTable('olympiad_directions', {
  olympiadId: integer('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
  directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'cascade' }),
  viaRsosh: boolean('via_rsosh').notNull(), subjectRelevance: subjectRelevanceEnum('subject_relevance'),
  /** The card subject behind subject_relevance: a subject its RSOSH profile names for core (reference/directions.ts, matchDirections). */
  subject: text('subject'),
}, t => [
  primaryKey({ columns: [t.olympiadId, t.directionId] }),
  index('olympiad_directions_direction_idx').on(t.directionId, t.olympiadId),
  check('olympiad_directions_has_reason', sql`${t.viaRsosh} or ${t.subjectRelevance} is not null`),
]);
/**
 * Exact benefits by direction from admission rules (optional source `directionBenefits` in manifest.json).
 * Where rows exist for a university and a series, «на N из M направлений» comes from here instead of the exam estimate.
 */
export const directionBenefits = pgTable('direction_benefits', {
  id: serial('id').primaryKey(),
  universityId: integer('university_id').notNull().references(() => universities.id, { onDelete: 'cascade' }),
  seriesId: integer('series_id').notNull().references(() => olympiadSeries.id, { onDelete: 'cascade' }),
  directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'cascade' }),
  kind: benefitKindEnum('kind').notNull(), diploma: benefitDiplomaEnum('diploma').notNull(),
  sourceUrl: text('source_url').notNull(), sourcePage: text('source_page'),
}, t => [
  uniqueIndex('direction_benefits_unique').on(t.universityId, t.seriesId, t.directionId, t.kind, t.diploma),
  index('direction_benefits_series_idx').on(t.seriesId, t.universityId),
]);
// The user's goal: where and what to study. Removed with the account (cascade).
export const userDirections = pgTable('user_directions', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  directionId: integer('direction_id').notNull().references(() => directions.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.userId, t.directionId] })]);
export const userUniversities = pgTable('user_universities', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  universityId: integer('university_id').notNull().references(() => universities.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.userId, t.universityId] })]);
