// Reads data/reference into one validated bundle. Nothing is written anywhere: the same bundle feeds
// `pnpm data:check` (report only) and `pnpm db:reference` (database import).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { hash } from '../import/csv.js';
import {
  ALL_PROFILES, nameKey, parseGeneralLevel, parseRuDates, isoDay, stageKind, stageMode, scheduleSignature, scheduleQuality,
  parseBenefits, parseRequirement, type Level, type StageKind, type StageMode, type ScheduleQuality, type ScheduleStage,
  type BenefitKind, type BenefitDiploma,
} from './model.js';
import {
  directionCodePattern, isEgeSubject, levelFromCode, parseEducationLevel, ugsnCodeOf, PROGRAM_FUNDING,
  type EducationLevel, type ProgramFunding,
} from './directions.js';

export type ReferenceIssue = { severity: 'error' | 'warning'; code: string; message: string };
export type SeriesStage = { position: number; name: string; kind: StageKind; rawDates: string; mode: StageMode | null; beginsOn: string | null; endsOn: string | null };
export type SeriesEntry = {
  slug: string; name: string; aliases: string[]; catalogGroup: string | null; catalogExclude: number[]; scheduleReview: '' | 'ok' | 'hide'; note: string | null;
  generalLevel: Level | null; formatRaw: string | null; scheduleRaw: string | null; stages: SeriesStage[]; scheduleQuality: ScheduleQuality;
  rsoshTitle: string | null; rsoshNumber: number | null; profiles: Map<string, { level: number; fieldsOfStudy: string | null }>;
};
export type UniversityEntry = { slug: string; name: string; fullName: string | null; city: string; aliases: string[] };
export type BenefitEntry = {
  university: string; series: string; kind: BenefitKind; diploma: BenefitDiploma;
  minScore: number | null; maxScore: number | null; requirement: string | null; requirementRaw: string | null;
};
export type LinkEntry = { olympiadId: number; series: string; profiles: string[]; note: string | null };
export type DirectionEntry = {
  code: string; name: string; educationLevel: EducationLevel; ugsnCode: string; ugsnName: string; egeSubjects: string[];
  core: string[]; related: string[]; popular: boolean; aliases: string[]; note: string | null;
};
export type ProgramEntry = {
  university: string; direction: string; name: string; faculty: string | null; examsRequired: string[]; examsChoice: string[][];
  internalExam: boolean; passingScore: number | null; passingScoreForm: string | null; passingYear: number | null;
  funding: ProgramFunding; sourceUrl: string; sourceId: string | null;
};
export type ReferenceBundle = {
  manifest: Manifest; series: SeriesEntry[]; universities: UniversityEntry[]; benefits: BenefitEntry[]; links: LinkEntry[];
  directions: DirectionEntry[]; programs: ProgramEntry[];
  issues: ReferenceIssue[]; files: { path: string; sha256: string }[]; sha256: string;
};

const Source = z.object({ file: z.string().min(1), description: z.string().optional() });
/**
 * Benefits may come from several files (one per delivery). `skipUnknownOlympiads`: an olympiad that is not in the
 * project's catalog is skipped with a warning instead of failing the check — used for third-party lists.
 */
const BenefitSource = Source.extend({ skipUnknownOlympiads: z.boolean().default(false) });
export const Manifest = z.object({
  season: z.string().regex(/^\d{4}\/\d{2}$/),
  sources: z.object({
    schedule: Source,
    rsosh: Source.extend({ status: z.string().min(1), url: z.url().nullable() }),
    benefits: z.union([BenefitSource, z.array(BenefitSource).min(1)]).transform(v => Array.isArray(v) ? v : [v]),
    /** University programs with exams and passing scores (a third-party aggregator; the source is shown to users). */
    programs: Source.extend({ status: z.string().min(1), url: z.url().nullable() }).optional(),
  }),
});
export type Manifest = z.infer<typeof Manifest>;
export const referenceFiles = { series: 'series.csv', universities: 'universities.csv', links: 'catalog-links.csv', additions: 'catalog-additions.csv',
  directions: 'directions.csv' } as const;
export const defaultReferenceDir = new URL('../../../../data/reference/', import.meta.url);

type Row = Record<string, string>;
/** Semicolon or comma separated, UTF-8 with or without BOM; the delimiter is taken from the header line. */
export function readCsv(buffer: Buffer, file: string, required: string[]): Row[] {
  const header = buffer.toString('utf8').replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = parse(buffer, { bom: true, delimiter, columns: true, skip_empty_lines: true, relax_quotes: false }) as Row[];
  const columns = rows[0] ? Object.keys(rows[0]) : header.split(delimiter).map(h => h.trim());
  const missing = required.filter(c => !columns.includes(c));
  if (missing.length) throw new Error(`${file}: нет столбцов ${missing.join(', ')}`);
  return rows;
}
const list = (value: string | undefined) => (value ?? '').split('|').map(v => v.trim()).filter(Boolean);
const text = (value: string | undefined) => value?.trim() || null;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ReferenceInput = { manifest: unknown; files: Record<string, Buffer> };
export function readReferenceDir(dir: string | URL = defaultReferenceDir): ReferenceInput {
  const base = dir instanceof URL ? fileURLToPath(dir) : dir;
  const manifest: unknown = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'));
  const parsed = Manifest.parse(manifest);
  const files: Record<string, Buffer> = {};
  for (const path of [referenceFiles.series, referenceFiles.universities, referenceFiles.links, referenceFiles.directions,
    parsed.sources.schedule.file, parsed.sources.rsosh.file, ...parsed.sources.benefits.map(b => b.file),
    ...(parsed.sources.programs ? [parsed.sources.programs.file] : [])]) {
    const full = join(base, path);
    if (!existsSync(full)) throw new Error(`Нет файла справочника: ${path}`);
    files[path] = readFileSync(full);
  }
  return { manifest, files };
}

export function buildReference(input: ReferenceInput, options: { today: string }): ReferenceBundle {
  const manifest = Manifest.parse(input.manifest);
  const issues: ReferenceIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });
  const file = (path: string) => {
    const buffer = input.files[path];
    if (!buffer) throw new Error(`Нет файла справочника: ${path}`);
    return buffer;
  };

  // --- series.csv: canonical names and every spelling used by the sources ---
  const series = new Map<string, SeriesEntry>();
  const byName = new Map<string, string>();
  const addName = (name: string, slug: string, where: string) => {
    const key = nameKey(name);
    if (!key) return;
    const owner = byName.get(key);
    if (owner && owner !== slug) error('alias_conflict', `${where}: «${name}» уже принадлежит серии ${owner}`);
    else byName.set(key, slug);
  };
  for (const [i, row] of readCsv(file(referenceFiles.series), referenceFiles.series, ['slug', 'name', 'aliases', 'catalog_group', 'catalog_exclude', 'schedule_review', 'note']).entries()) {
    const where = `${referenceFiles.series}:${i + 2}`;
    const slug = row.slug!.trim(), name = row.name!.trim();
    const review = row.schedule_review!.trim();
    if (!slugPattern.test(slug)) { error('bad_slug', `${where}: slug «${slug}» — только латиница, цифры и дефис`); continue; }
    if (series.has(slug)) { error('duplicate_slug', `${where}: повторный slug ${slug}`); continue; }
    if (!name) { error('empty_name', `${where}: пустое название`); continue; }
    if (review !== '' && review !== 'ok' && review !== 'hide') error('bad_review', `${where}: schedule_review должен быть пустым, ok или hide`);
    const aliases = list(row.aliases);
    const exclude = list(row.catalog_exclude).map(Number);
    if (exclude.some(id => !Number.isSafeInteger(id) || id <= 0)) error('bad_id', `${where}: catalog_exclude — ID через «|»`);
    series.set(slug, { slug, name, aliases, catalogGroup: text(row.catalog_group), catalogExclude: exclude, scheduleReview: review === 'ok' || review === 'hide' ? review : '',
      note: text(row.note), generalLevel: null, formatRaw: null, scheduleRaw: null, stages: [], scheduleQuality: 'ok',
      rsoshTitle: null, rsoshNumber: null, profiles: new Map() });
    for (const n of [name, ...aliases]) addName(n, slug, where);
  }
  const resolve = (name: string, where: string) => {
    const slug = byName.get(nameKey(name));
    if (!slug) error('unknown_olympiad', `${where}: олимпиада «${name}» не найдена в series.csv — добавьте её или псевдоним`);
    return slug ?? null;
  };

  // --- olympiads_clean: general level, format, stages and dates ---
  const schedulePath = manifest.sources.schedule.file;
  const stageSets = new Map<string, ScheduleStage[]>();
  for (const [i, row] of readCsv(file(schedulePath), schedulePath, ['название', 'общий_уровень', 'формат', 'этапы_и_даты', 'этап_1', 'дата_1']).entries()) {
    const where = `${schedulePath}:${i + 2}`;
    const slug = resolve(row['название']!, where);
    if (!slug) continue;
    const entry = series.get(slug)!;
    if (stageSets.has(slug)) { error('duplicate_schedule', `${where}: серия ${slug} встречается в файле повторно`); continue; }
    try { entry.generalLevel = parseGeneralLevel(row['общий_уровень']!); } catch (e) { error('bad_level', `${where}: ${(e as Error).message}`); }
    entry.formatRaw = text(row['формат']);
    entry.scheduleRaw = text(row['этапы_и_даты']);
    const stages: ScheduleStage[] = [];
    for (let n = 1; `этап_${n}` in row; n++) {
      const name = row[`этап_${n}`]?.trim(), rawDates = row[`дата_${n}`]?.trim() ?? '';
      if (!name) { if (rawDates) warn('stage_without_name', `${where}: у даты «${rawDates}» (этап_${n}) нет названия этапа`); continue; }
      const dates = rawDates ? parseRuDates(rawDates) : null;
      if (rawDates && !dates) warn('unparsed_dates', `${where}: даты «${rawDates}» сохранены только текстом`);
      const mode = stageMode(row[`формат_${n}`] ?? '');
      if (mode === undefined) warn('unknown_mode', `${where}: неизвестный формат этапа «${row[`формат_${n}`]}»`);
      const beginsOn = isoDay(dates?.from ?? null), endsOn = isoDay(dates?.to ?? null);
      if (beginsOn && endsOn && beginsOn > endsOn) { error('dates_order', `${where}: начало этапа позже окончания («${rawDates}»)`); continue; }
      entry.stages.push({ position: entry.stages.length, name, kind: stageKind(name), rawDates, mode: mode ?? null, beginsOn, endsOn });
      stages.push({ name, rawDates, dates });
    }
    stageSets.set(slug, stages);
  }
  const signatures = new Map<string, string[]>();
  for (const [slug, stages] of stageSets) {
    const signature = scheduleSignature(stages);
    if (signature) signatures.set(signature, [...(signatures.get(signature) ?? []), slug]);
  }
  for (const [slug, stages] of stageSets) {
    const entry = series.get(slug)!;
    const twins = signatures.get(scheduleSignature(stages) ?? '') ?? [];
    entry.scheduleQuality = scheduleQuality(stages, { review: entry.scheduleReview, duplicated: twins.length > 1, today: options.today });
    if (entry.scheduleQuality === 'placeholder') warn('placeholder_schedule', `${slug}: расписание похоже на шаблон${twins.length > 1 ? ` (совпадает с ${twins.filter(t => t !== slug).join(', ')})` : ' (регистрация X, отбор X+20, финал X+50)'} — карточки показывают расписание olimpiada.ru; после проверки поставьте schedule_review=ok`);
    if (entry.scheduleQuality === 'outdated') warn('outdated_schedule', `${slug}: все даты с годом относятся к прошлым сезонам — карточки показывают расписание olimpiada.ru`);
  }

  // --- RSOSH list: level per profile ---
  const rsoshPath = manifest.sources.rsosh.file;
  for (const [i, row] of readCsv(file(rsoshPath), rsoshPath, ['number', 'olympiad', 'profile', 'subjects', 'level']).entries()) {
    const where = `${rsoshPath}:${i + 2}`;
    const slug = resolve(row.olympiad!, where);
    if (!slug) continue;
    const entry = series.get(slug)!;
    const profile = row.profile!.trim(), level = Number(row.level);
    if (!profile) { error('empty_profile', `${where}: пустой профиль`); continue; }
    if (!Number.isInteger(level) || level < 1 || level > 3) { error('bad_level', `${where}: уровень «${row.level}» — ожидается 1, 2 или 3`); continue; }
    const known = entry.profiles.get(profile);
    if (known && known.level !== level) error('profile_conflict', `${where}: профиль «${profile}» серии ${slug} указан с разными уровнями`);
    entry.profiles.set(profile, { level, fieldsOfStudy: text(row.subjects) });
    entry.rsoshTitle ??= row.olympiad!.trim();
    entry.rsoshNumber ??= /^\d+$/.test(row.number!.trim()) ? Number(row.number) : null;
  }

  // --- universities.csv ---
  const universities = new Map<string, UniversityEntry>();
  const universityByName = new Map<string, string>();
  for (const [i, row] of readCsv(file(referenceFiles.universities), referenceFiles.universities, ['slug', 'name', 'full_name', 'city', 'aliases']).entries()) {
    const where = `${referenceFiles.universities}:${i + 2}`;
    const slug = row.slug!.trim();
    if (!slugPattern.test(slug) || universities.has(slug)) { error('bad_slug', `${where}: некорректный или повторный slug «${slug}»`); continue; }
    if (!row.name!.trim() || !row.city!.trim()) { error('empty_name', `${where}: нужны name и city`); continue; }
    const entry = { slug, name: row.name!.trim(), fullName: text(row.full_name), city: row.city!.trim(), aliases: list(row.aliases) };
    universities.set(slug, entry);
    for (const n of [entry.name, entry.fullName ?? '', ...entry.aliases]) {
      const key = nameKey(n);
      if (!key) continue;
      if (universityByName.has(key) && universityByName.get(key) !== slug) error('alias_conflict', `${where}: «${n}» уже принадлежит ${universityByName.get(key)}`);
      universityByName.set(key, slug);
    }
  }

  // --- benefits (several files; the first row for a university+olympiad+benefit wins) ---
  const benefits = new Map<string, BenefitEntry>();
  for (const source of manifest.sources.benefits) {
    const benefitsPath = source.file;
    const skipped = new Map<string, number>();
    for (const [i, row] of readCsv(file(benefitsPath), benefitsPath, ['university', 'city', 'olympiad', 'benefit', 'confirmation_requirement']).entries()) {
      const where = `${benefitsPath}:${i + 2}`;
      const university = universityByName.get(nameKey(row.university!));
      if (!university) { error('unknown_university', `${where}: вуз «${row.university}» не найден в universities.csv`); continue; }
      if (row.city!.trim() && nameKey(row.city!) !== nameKey(universities.get(university)!.city)) warn('city_mismatch', `${where}: город «${row.city}» отличается от universities.csv`);
      const known = byName.get(nameKey(row.olympiad!));
      if (!known && source.skipUnknownOlympiads) { skipped.set(row.olympiad!.trim(), (skipped.get(row.olympiad!.trim()) ?? 0) + 1); continue; }
      const slug = resolve(row.olympiad!, where);
      if (!slug) continue;
      const parsed = parseBenefits(row.benefit!);
      if (!parsed) { error('unknown_benefit', `${where}: неизвестная льгота «${row.benefit}» (ожидается БВИ, БВИ победителям, 100 баллов или их сочетание через «/»)`); continue; }
      const requirement = parseRequirement(row.confirmation_requirement!);
      if (!requirement.known) warn('unparsed_requirement', `${where}: условие «${row.confirmation_requirement}» сохранено только текстом`);
      for (const benefit of parsed) {
        const key = [university, slug, benefit.kind, benefit.diploma].join(':');
        const value: BenefitEntry = { university, series: slug, ...benefit, minScore: requirement.minScore, maxScore: requirement.maxScore,
          requirement: requirement.text, requirementRaw: text(row.confirmation_requirement) };
        const previous = benefits.get(key);
        if (previous) {
          if (previous.requirementRaw !== value.requirementRaw) warn('duplicate_benefit', `${where}: повтор льготы ${key} с другим условием — оставлена первая строка`);
          continue;
        }
        benefits.set(key, value);
      }
    }
    for (const [name, rows] of skipped) warn('skipped_olympiad', `${benefitsPath}: олимпиады «${name}» нет в базе проекта — ${rows} строк(и) пропущено`);
  }

  // --- catalog-links.csv: which catalog card belongs to which series and profile ---
  const links = new Map<number, LinkEntry>();
  for (const [i, row] of readCsv(file(referenceFiles.links), referenceFiles.links, ['olympiad_id', 'series', 'profiles']).entries()) {
    const where = `${referenceFiles.links}:${i + 2}`;
    const id = Number(row.olympiad_id);
    if (!/^\d+$/.test(row.olympiad_id!.trim()) || !Number.isSafeInteger(id) || id <= 0) { error('bad_id', `${where}: некорректный olympiad_id «${row.olympiad_id}»`); continue; }
    if (links.has(id)) { error('duplicate_link', `${where}: олимпиада ${id} уже привязана к серии ${links.get(id)!.series}`); continue; }
    const slug = row.series!.trim();
    const entry = series.get(slug);
    if (!entry) { error('unknown_series', `${where}: серии «${slug}» нет в series.csv`); continue; }
    const profiles = list(row.profiles);
    if (profiles.length && !entry.profiles.size) { error('profile_without_list', `${where}: у серии ${slug} нет профилей в перечне РСОШ, столбец profiles должен быть пустым`); continue; }
    const unknown = profiles.filter(p => p !== ALL_PROFILES && !entry.profiles.has(p));
    if (unknown.length) { error('unknown_profile', `${where}: у серии ${slug} нет профилей ${unknown.map(p => `«${p}»`).join(', ')} (есть: ${[...entry.profiles.keys()].join('; ')})`); continue; }
    if (profiles.includes(ALL_PROFILES) && profiles.length > 1) { error('bad_profiles', `${where}: «*» нельзя сочетать с другими профилями`); continue; }
    links.set(id, { olympiadId: id, series: slug, profiles, note: text(row.note) });
  }

  // --- directions.csv: directions of study and their olympiad subjects ---
  const directions = new Map<string, DirectionEntry>();
  const directionsFile = input.files[referenceFiles.directions];
  if (directionsFile) {
    for (const [i, row] of readCsv(directionsFile, referenceFiles.directions, ['code', 'name', 'education_level', 'ugsn_code', 'ugsn_name', 'ege_subjects',
      'subjects_core', 'subjects_related', 'popular', 'aliases', 'note']).entries()) {
      const where = `${referenceFiles.directions}:${i + 2}`;
      const code = row.code!.trim(), name = row.name!.trim();
      if (!directionCodePattern.test(code)) { error('bad_direction_code', `${where}: код «${code}» — ожидается XX.03.XX (бакалавриат) или XX.05.XX (специалитет)`); continue; }
      if (directions.has(code)) { error('duplicate_direction', `${where}: повторный код ${code}`); continue; }
      if (!name || !row.ugsn_name!.trim()) { error('empty_name', `${where}: нужны name и ugsn_name`); continue; }
      const level = parseEducationLevel(row.education_level!);
      if (level !== levelFromCode(code)) { error('level_mismatch', `${where}: уровень «${row.education_level}» не совпадает с кодом ${code}`); continue; }
      if (row.ugsn_code!.trim() !== ugsnCodeOf(code)) { error('ugsn_mismatch', `${where}: ugsn_code «${row.ugsn_code}» должен быть ${ugsnCodeOf(code)}`); continue; }
      const ege = list(row.ege_subjects), core = list(row.subjects_core), related = list(row.subjects_related);
      const badEge = ege.filter(s => !isEgeSubject(s));
      if (badEge.length) { error('unknown_exam', `${where}: неизвестные предметы ЕГЭ ${badEge.map(s => `«${s}»`).join(', ')}`); continue; }
      if (!core.length) { error('no_core_subjects', `${where}: пустой subjects_core`); continue; }
      const both = core.filter(s => related.includes(s));
      if (both.length) warn('core_and_related', `${where}: ${both.join(', ')} указаны и в core, и в related — учитывается core`);
      const popular = row.popular!.trim();
      if (popular !== '0' && popular !== '1') { error('bad_flag', `${where}: popular должен быть 0 или 1`); continue; }
      directions.set(code, { code, name, educationLevel: level!, ugsnCode: ugsnCodeOf(code), ugsnName: row.ugsn_name!.trim(), egeSubjects: ege,
        core, related: related.filter(s => !core.includes(s)), popular: popular === '1', aliases: list(row.aliases), note: text(row.note) });
    }
  }

  // --- university programs: university × direction, exams and passing scores ---
  const programs: ProgramEntry[] = [];
  const programsSource = manifest.sources.programs;
  if (programsSource) {
    const path = programsSource.file;
    const seen = new Set<string>();
    for (const [i, row] of readCsv(file(path), path, ['university_slug', 'direction_code', 'education_level', 'program', 'faculty', 'exams_required',
      'exams_choice', 'internal_exam', 'passing_score', 'passing_score_form', 'passing_year', 'funding', 'source_url', 'tabiturient_id']).entries()) {
      const where = `${path}:${i + 2}`;
      const university = row.university_slug!.trim(), code = row.direction_code!.trim(), name = row.program!.trim();
      if (!universities.has(university)) { error('unknown_university', `${where}: вуза «${university}» нет в universities.csv`); continue; }
      if (!directions.has(code)) { error('unknown_direction', `${where}: направления ${code} нет в directions.csv`); continue; }
      if (!name) { error('empty_name', `${where}: пустое название программы`); continue; }
      if (parseEducationLevel(row.education_level!) !== levelFromCode(code)) warn('level_mismatch', `${where}: уровень «${row.education_level}» не совпадает с кодом ${code} — используется код`);
      const examsRequired = list(row.exams_required);
      const examsChoice = (row.exams_choice ?? '').split(';').map(list).filter(group => group.length);
      const badExams = [...examsRequired, ...examsChoice.flat()].filter(s => !isEgeSubject(s));
      if (badExams.length) { error('unknown_exam', `${where}: неизвестные предметы ЕГЭ ${badExams.map(s => `«${s}»`).join(', ')}`); continue; }
      const funding = row.funding!.trim() as ProgramFunding;
      if (!PROGRAM_FUNDING.includes(funding)) { error('bad_funding', `${where}: funding «${row.funding}» — ожидается ${PROGRAM_FUNDING.join(', ')}`); continue; }
      const internal = row.internal_exam!.trim();
      if (internal !== '0' && internal !== '1') { error('bad_flag', `${where}: internal_exam должен быть 0 или 1`); continue; }
      const scoreRaw = row.passing_score!.trim(), yearRaw = row.passing_year!.trim();
      const passingScore = scoreRaw ? Number(scoreRaw) : null, passingYear = yearRaw ? Number(yearRaw) : null;
      if (passingScore !== null && (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 500)) { error('bad_score', `${where}: проходной балл «${scoreRaw}»`); continue; }
      if (passingScore !== null && (passingYear === null || !Number.isInteger(passingYear) || passingYear < 2000 || passingYear > 2100)) { error('bad_year', `${where}: у проходного балла нужен год`); continue; }
      const sourceUrl = row.source_url!.trim();
      if (!z.url().safeParse(sourceUrl).success) { error('bad_url', `${where}: source_url «${sourceUrl}»`); continue; }
      const key = [university, code, nameKey(name), nameKey(row.faculty ?? ''), examsRequired.join('|'), examsChoice.map(g => g.join('|')).join(';')].join(':');
      if (seen.has(key)) { warn('duplicate_program', `${where}: повтор программы «${name}» — пропущена`); continue; }
      seen.add(key);
      programs.push({ university, direction: code, name, faculty: text(row.faculty), examsRequired, examsChoice, internalExam: internal === '1',
        passingScore, passingScoreForm: passingScore !== null ? text(row.passing_score_form) : null, passingYear: passingScore !== null ? passingYear : null,
        funding, sourceUrl, sourceId: text(row.tabiturient_id) });
    }
    for (const u of universities.values()) if (!programs.some(p => p.university === u.slug)) warn('university_without_programs', `${u.slug}: нет ни одной программы в ${path}`);
  }

  for (const entry of series.values()) {
    if (!entry.stages.length && !entry.profiles.size && ![...benefits.values()].some(b => b.series === entry.slug) && !entry.generalLevel)
      warn('unused_series', `${entry.slug}: серия не встречается ни в одном источнике`);
  }
  const files = Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, buffer]) => ({ path, sha256: hash(buffer) }));
  return {
    manifest, series: [...series.values()], universities: [...universities.values()], benefits: [...benefits.values()], links: [...links.values()],
    directions: [...directions.values()], programs, issues, files, sha256: hash(files.map(f => `${f.path}:${f.sha256}`).join('\n') + JSON.stringify(input.manifest)),
  };
}

export type CatalogRow = { id: number; title: string; sourceGroup: string | null; rawSource: Record<string, string>; inCatalog?: boolean };
/** Olympiad subjects of directions.csv must be catalog subjects, otherwise no card can ever match them. */
export function checkDirectionSubjects(bundle: ReferenceBundle, catalogSubjects: Iterable<string>): ReferenceIssue[] {
  const known = new Set(catalogSubjects);
  const unknown = new Map<string, string[]>();
  for (const d of bundle.directions) for (const s of [...d.core, ...d.related]) if (!known.has(s)) unknown.set(s, [...unknown.get(s) ?? [], d.code]);
  return [...unknown].map(([subject, codes]) => ({ severity: 'warning' as const, code: 'unknown_direction_subject',
    message: `${referenceFiles.directions}: предмета «${subject}» нет в каталоге (${codes.slice(0, 5).join(', ')}${codes.length > 5 ? '…' : ''}) — связь по нему не появится` }));
}
/** Cross-checks the bundle against catalog cards (from the CSV files or the database). Only warnings: the catalog may lag behind. */
export function checkAgainstCatalog(bundle: ReferenceBundle, catalog: CatalogRow[]): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });
  const byId = new Map(catalog.map(row => [row.id, row]));
  const linked = new Map(bundle.links.map(link => [link.olympiadId, link]));
  for (const link of bundle.links) if (!byId.has(link.olympiadId)) warn('link_not_in_catalog', `catalog-links.csv: олимпиады ${link.olympiadId} нет в каталоге — связь будет пропущена`);
  for (const entry of bundle.series) {
    const members = bundle.links.filter(l => l.series === entry.slug);
    if (!members.length) warn('series_without_cards', `${entry.slug}: ни одной карточки каталога не привязано`);
    if (entry.catalogGroup) {
      for (const row of catalog) {
        if (row.sourceGroup === `Объединение: ${entry.catalogGroup}` && !linked.has(row.id) && row.inCatalog !== false && !entry.catalogExclude.includes(row.id))
          warn('unlinked_group_member', `${entry.slug}: карточка ${row.id} «${row.title}» из объединения «${entry.catalogGroup}» не привязана — добавьте строку в catalog-links.csv (или оставьте, если это другая олимпиада)`);
      }
    }
    if (entry.profiles.size) {
      const covered = new Set(members.flatMap(m => m.profiles.includes(ALL_PROFILES) ? [...entry.profiles.keys()] : m.profiles));
      const missing = [...entry.profiles.keys()].filter(p => !covered.has(p));
      if (missing.length && members.length) warn('profile_without_card', `${entry.slug}: нет карточек для профилей перечня: ${missing.join('; ')}`);
    }
  }
  return issues;
}
