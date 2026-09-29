import * as c from '@olimp/contracts';
// Demo mode only: the reference lists the API builds from the same files (without program and olympiad counts).
import universitiesCsv from '../../../../data/reference/universities.csv?raw';
import directionsCsv from '../../../../data/reference/directions.csv?raw';

function rows(csv: string) {
  const [head, ...lines] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim());
  const keys = head!.split(';');
  return lines.map(line => { const values = line.split(';'); return Object.fromEntries(keys.map((key, index) => [key, values[index]?.trim() ?? ''])) as Record<string, string>; });
}
const list = (value: string | undefined) => value ? value.split('|').map(item => item.trim()).filter(Boolean) : [];

export function mockUniversities() {
  const parsed = c.UniversityListResponse.parse({ items: rows(universitiesCsv).map(row => ({ slug: row.slug, name: row.name, city: row.city,
    fullName: row.full_name || null, seriesCount: 0, olympiadCount: 0 })) });
  return { items: parsed.items.sort((a, b) => a.name.localeCompare(b.name, 'ru')) };
}
export function mockDirections() {
  return c.DirectionListResponse.parse({ items: rows(directionsCsv).map(row => ({ code: row.code, name: row.name,
    educationLevel: row.education_level === 'специалитет' ? 'specialist' : 'bachelor', ugsnCode: row.ugsn_code, ugsnName: row.ugsn_name,
    popular: row.popular === '1', aliases: list(row.aliases), note: row.note || null, egeSubjects: list(row.ege_subjects),
    subjectsCore: list(row.subjects_core), subjectsRelated: list(row.subjects_related), universityCount: 0, programCount: 0 })) });
}
