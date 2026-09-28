// Pure rules of the reference layer: name matching, stage and benefit parsing, schedule checks and levels.
// Nothing here touches files or the database, so every rule is covered by unit tests.

export const LEVELS = ['I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ'] as const;
export type Level = typeof LEVELS[number];
export const ALL_PROFILES = '*';
export type StageKind = 'registration' | 'competition' | 'other';
export type StageMode = 'online' | 'onsite' | 'mixed';
export type ScheduleQuality = 'ok' | 'placeholder' | 'outdated' | 'hidden';
export type BenefitKind = 'bvi' | 'score_100';
export type BenefitDiploma = 'any' | 'winner';

/** Key for comparing olympiad names across sources: case, ё, quotes, dashes and punctuation are ignored. */
export function nameKey(value: string) {
  return value.toLocaleLowerCase('ru').replaceAll('ё', 'е')
    .replace(/[«»"“”„'’`]/g, '')
    .replace(/[‐-―-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const romans = ['I', 'II', 'III'] as const;
/** Several RSOSH profiles on one card become a range: [2, 3] → «II–III». */
export function combineLevels(levels: number[]): Level | null {
  if (!levels.length) return null;
  const min = Math.min(...levels), max = Math.max(...levels);
  if (min < 1 || max > 3) throw new Error(`Уровень вне диапазона 1–3: ${levels.join(', ')}`);
  return (min === max ? romans[min - 1]! : `${romans[min - 1]}–${romans[max - 1]}`) as Level;
}
export function parseGeneralLevel(value: string): Level | null {
  const v = value.trim().replace(/-/g, '–');
  if (!v || v === '—' || v === '–') return null;
  if (/^всош$/i.test(v)) return 'ВсОШ';
  if ((LEVELS as readonly string[]).includes(v)) return v as Level;
  throw new Error(`Неизвестный уровень «${value}»`);
}

export function stageKind(name: string): StageKind {
  if (/регистрац|при[её]м заявок/i.test(name)) return 'registration';
  if (/этап|тур|финал|олимпиад|фестивал|конкурс|отбор/i.test(name)) return 'competition';
  return 'other';
}
const modes: Record<string, StageMode> = {
  'онлайн': 'online', 'дистанционно': 'online', 'заочно': 'online', 'онлайн/заочно': 'online',
  'очно': 'onsite', 'очно/дистанционно': 'mixed', 'очно/онлайн': 'mixed', 'онлайн/очно': 'mixed',
};
export function stageMode(value: string): StageMode | null | undefined {
  const v = value.trim().toLocaleLowerCase('ru');
  if (!v) return null;
  return modes[v.replace(/\s+/g, '')]; // undefined = unknown value, reported as a warning
}

const months: Record<string, number> = {
  'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'ма': 5, 'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12,
};
// Short forms used by the olimpiada.ru calendar: «2 ноя—25 дек», «До 1 ноя».
const shortMonthNames: Record<string, number> = {
  'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'мая': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'сент': 9, 'окт': 10, 'ноя': 11, 'нояб': 11, 'дек': 12,
};
function monthNumber(word: string) {
  const w = word.toLocaleLowerCase('ru');
  if (shortMonthNames[w]) return shortMonthNames[w];
  for (const [prefix, n] of Object.entries(months)) if (w.startsWith(prefix) && (prefix !== 'ма' || /^ма[йяе]$/.test(w))) return n;
  return null;
}
export type DayMonth = { day: number; month: number; year: number | null };
export type ParsedDates = { from: DayMonth | null; to: DayMonth; open: boolean };
const part = /(\d{1,2})(?:\s+([а-яё]+))?(?:\s+(\d{4}))?/i;
/**
 * Reads «до 25 сентября», «23-25 января», «27 сентября — 2 октября», «16 декабря 2025 — 20 января 2026».
 * A year is kept only when the source states it; missing years are never invented.
 */
export function parseRuDates(raw: string): ParsedDates | null {
  const text = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const open = /^до\s/i.test(text);
  const body = text.replace(/^(?:до|с)\s+/i, '');
  const pieces = body.split(/\s*[—–-]\s*/).filter(Boolean);
  if (pieces.length < 1 || pieces.length > 2) return null;
  const parsed = pieces.map(p => { const m = new RegExp(`^${part.source}$`, 'i').exec(p.trim()); return m ? { day: Number(m[1]), month: m[2] ? monthNumber(m[2]) : null, year: m[3] ? Number(m[3]) : null, hasMonth: !!m[2] } : null; });
  if (parsed.some(p => !p || (p.hasMonth && p.month === null))) return null;
  const last = parsed.at(-1)!;
  if (last.month === null) return null;
  const to: DayMonth = { day: last.day, month: last.month, year: last.year };
  let from: DayMonth | null = null;
  if (parsed.length === 2) {
    const first = parsed[0]!;
    const month = first.month ?? to.month;
    let year = first.year;
    if (year === null && to.year !== null) year = month > to.month ? to.year - 1 : to.year;
    from = { day: first.day, month, year };
  }
  if (open && from) return null;
  const valid = (d: DayMonth) => d.day >= 1 && d.day <= 31 && (d.year === null || isRealDate(d));
  if (!valid(to) || (from && !valid(from))) return null;
  return { from, to, open };
}
function isRealDate(d: DayMonth) {
  const date = new Date(Date.UTC(d.year!, d.month - 1, d.day));
  return date.getUTCMonth() === d.month - 1 && date.getUTCDate() === d.day;
}
export const isoDay = (d: DayMonth | null) => d && d.year !== null
  ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null;

/** Day number inside a nominal school season (1 August = 0); only used to compare yearless dates. */
export function seasonDay(d: DayMonth) {
  const year = d.month >= 8 ? 2001 : 2002;
  return Math.round((Date.UTC(year, d.month - 1, d.day) - Date.UTC(2001, 7, 1)) / 86400000);
}
/** First day of the school season that contains `today` (seasons start on 1 August). */
export function seasonStart(today: string) {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return `${month >= 8 ? year : year - 1}-08-01`;
}

export type ScheduleStage = { name: string; rawDates: string; dates: ParsedDates | null };
/**
 * The placeholder pattern found in olympiads_clean: registration «до X», selection «до X+20»,
 * final «X+50…X+52». Real organizers do not share such exact offsets.
 */
export function isPlaceholderSchedule(stages: ScheduleStage[]) {
  const [a, b, c] = stages;
  if (!a?.dates || !b?.dates || !c?.dates || !a.dates.open || !b.dates.open || !c.dates.from) return false;
  const start = seasonDay(a.dates.to);
  return seasonDay(b.dates.to) - start === 20 && seasonDay(c.dates.from) - start === 50;
}
export function scheduleSignature(stages: ScheduleStage[]) {
  return stages.length >= 3 ? stages.map(s => s.rawDates.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru')).join(' | ') : null;
}
/** A schedule whose stated years all end before the current season began belongs to a past season. */
export function isOutdatedSchedule(stages: ScheduleStage[], today: string) {
  const dated = stages.flatMap(s => [isoDay(s.dates?.to ?? null), isoDay(s.dates?.from ?? null)]).filter((d): d is string => !!d);
  return dated.length > 0 && dated.every(d => d < seasonStart(today));
}
export function scheduleQuality(stages: ScheduleStage[], options: { review: '' | 'ok' | 'hide'; duplicated: boolean; today: string }): ScheduleQuality {
  if (options.review === 'hide') return 'hidden';
  if (options.review === 'ok' || !stages.length) return 'ok';
  if (options.duplicated || isPlaceholderSchedule(stages)) return 'placeholder';
  if (isOutdatedSchedule(stages, options.today)) return 'outdated';
  return 'ok';
}

export type ParsedBenefit = { kind: BenefitKind; diploma: BenefitDiploma };
export function parseBenefit(value: string): ParsedBenefit | null {
  const v = value.trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ');
  if (/^бви( победителям)?$/.test(v)) return { kind: 'bvi', diploma: v.includes('победител') ? 'winner' : 'any' };
  if (/^100 баллов( победителям)?$/.test(v)) return { kind: 'score_100', diploma: v.includes('победител') ? 'winner' : 'any' };
  return null;
}
/**
 * One source cell may list several benefits: «БВИ / 100 баллов» means БВИ on one programme and 100 points on another.
 * A shared «победителям» at the end applies to every part. null — at least one part is unknown.
 */
export function parseBenefits(value: string): ParsedBenefit[] | null {
  const v = value.trim().replace(/\s+/g, ' ');
  const winners = /\s+победителям$/i.test(v);
  const parts = v.replace(/\s+победителям$/i, '').split(/\s*(?:\/|\+|,|;|\sи\s|\sили\s)\s*/i).filter(Boolean);
  if (!parts.length) return null;
  const parsed = parts.map(part => parseBenefit(winners ? `${part} победителям` : part));
  if (parsed.some(p => p === null)) return null;
  return parsed.filter((p, i, all) => all.findIndex(q => q!.kind === p!.kind && q!.diploma === p!.diploma) === i) as ParsedBenefit[];
}
export const REQUIREMENT_NOT_NEEDED = 'Подтверждать баллами ЕГЭ не нужно';
export type ParsedRequirement = { minScore: number | null; maxScore: number | null; text: string | null; known: boolean };
/** «ЕГЭ от75 до 85 баллов по профильному предмету.» → 75…85; OCR notes like «не видно на скриншотах» mean «not stated». */
export function parseRequirement(value: string): ParsedRequirement {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || /не видно|нет данных|не указан/i.test(text)) return { minScore: null, maxScore: null, text: null, known: true };
  // ВсОШ final-stage diplomas are not confirmed by ЕГЭ scores.
  if (/^не\s+требуется\.?$/i.test(text)) return { minScore: null, maxScore: null, text: REQUIREMENT_NOT_NEEDED, known: true };
  const m = /ЕГЭ\s*от\s*(\d{2,3})(?:\s*до\s*(\d{2,3}))?\s*балл/i.exec(text);
  if (!m) return { minScore: null, maxScore: null, text, known: false };
  const min = Number(m[1]), max = m[2] ? Number(m[2]) : null;
  if (min > 100 || (max !== null && (max > 100 || max < min))) return { minScore: null, maxScore: null, text, known: false };
  const range = max === null ? `от ${min}` : `от ${min} до ${max}`;
  return { minScore: min, maxScore: max, text: `ЕГЭ по профильному предмету ${range} баллов`, known: true };
}

const shortMonths: Record<string, number> = { 'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'мая': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12 };
/** Every «day month» mentioned in a schedule text, e.g. «20 окт—18 ноя» → 20.10, 18.11; «23-25 января» → 23.01, 25.01. */
export function dayMonthMentions(value: string) {
  const found = new Set<string>();
  for (const m of value.toLocaleLowerCase('ru').matchAll(/(\d{1,2})(?:\s*(?:[—–-]|\.{3}|…)\s*(\d{1,2}))?\s+(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)/g)) {
    const month = shortMonths[m[3]!]!;
    for (const day of [m[1], m[2]]) if (day) found.add(`${Number(day)}.${month}`);
  }
  return found;
}
/**
 * A card's own olimpiada.ru calendar contradicts the series schedule when it is published and shares no date with it.
 * This catches subject-specific dates (Всесибирская: математика ≠ химия) and last-season data in olympiads_clean.
 */
export function scheduleConflicts(catalogCalendar: string | null, calendarStatus: string | null, referenceDates: string[]) {
  if (calendarStatus?.trim() !== 'Опубликован' || !catalogCalendar) return false;
  const own = dayMonthMentions(catalogCalendar);
  const reference = dayMonthMentions(referenceDates.join('\n'));
  if (!own.size || !reference.size) return false;
  return ![...own].some(day => reference.has(day));
}
