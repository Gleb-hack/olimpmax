import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export const headers = ['ID','Название','Предмет','Классы','Класс от','Класс до','Формат','Тип участия','Рейтинг','Статус','Календарь','Расписание обновлено','Организатор','Контакты','Документы','Описание','Особенности','Источник','URL'];
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const normalizeSearch = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export const splitValues = (s: string) => [...new Set(s.split(';').map(v => v.trim()).filter(v => v && v !== '→'))];
const nullable = (s: string) => s.trim() || null;
const formats = { 'Очная': 'onsite', 'Дистанционная': 'online', 'Очно-заочная': 'hybrid', '': 'unknown' } as const;
const participation = { 'Личная': 'individual', 'Командная': 'team', 'Лично-командная': 'mixed', '': 'unknown' } as const;
export function scheduleStatus(calendar: string, status: string): 'published' | 'unknown' | 'not_held' {
  if (/не проводится/i.test(calendar + ' ' + status)) return 'not_held';
  if (!calendar.trim() || /пока не известно|пока неизвестно|появится позже/i.test(calendar)) return 'unknown';
  return 'published';
}

export function parseCalendar(calendar: string) {
  if (scheduleStatus(calendar, '') !== 'published') return [];
  const result: { name: string | null; rawDates: string | null; kind: 'registration' | 'competition' | 'other'; sourceKey: string }[] = [];
  const lines = calendar.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let pending: string | null = null;
  function push(name: string | null, rawDates: string | null) {
    const kind = name && /регистрац|прием заявок|приём заявок/i.test(name) ? 'registration' : name && /этап|тур|финал|олимпиад/i.test(name) ? 'competition' : 'other';
    result.push({ name, rawDates, kind, sourceKey: String(result.length) });
  }
  for (const line of lines) {
    // The entire line must look like a date. Numbers in stage titles are not dates.
    const isDate = /^(?:(?:до|с)\s+)?\d{1,2}(?:\s|\.{3}|…|[-–]\d).*(?:янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*(?:\s+\d{4})?$/i.test(line) || /^уточняется$/i.test(line);
    if (isDate) { push(pending, line); pending = null; }
    else { if (pending) push(pending, null); pending = line; }
  }
  if (pending) push(pending, null);
  return result;
}

export function parseCsv(buffer: Buffer) {
  const rows = parse(buffer, {
    bom: true, delimiter: ';', skip_empty_lines: true,
    columns: (actual: string[]) => {
      if (actual.length !== headers.length || actual.some((h, i) => h !== headers[i])) throw new Error('Столбцы CSV не совпадают с ожидаемой схемой');
      return actual;
    },
  }) as Record<string, string>[];
  if (!rows.length) throw new Error('CSV пуст');
  const ids = new Set<number>();
  return rows.map((row, i) => {
    const get = (k: string) => row[k]!;
    const fail = (message: string): never => { throw new Error(`CSV запись ${i + 1} (ID ${get('ID')}): ${message}`); };
    const id = Number(get('ID'));
    if (!/^\d+$/.test(get('ID')) || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || ids.has(id)) fail('некорректный или повторный ID');
    ids.add(id);
    if (!get('Название').trim()) fail('нет названия');
    if (get('URL') !== `https://olimpiada.ru/activity/${id}`) fail('URL не соответствует ID источника');
    const grade = (k: string) => {
      if (!get(k).trim()) return null;
      const n = Number(get(k));
      if (!Number.isInteger(n) || n < 1 || n > 11) fail(`некорректный ${k}`);
      return n;
    };
    const gradeFrom = grade('Класс от'), gradeTo = grade('Класс до');
    if ((gradeFrom === null) !== (gradeTo === null) || (gradeFrom !== null && gradeTo !== null && gradeFrom > gradeTo)) fail('некорректный диапазон классов');
    const rating = get('Рейтинг').trim() ? Number(get('Рейтинг')) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 10)) fail('некорректный рейтинг');
    const format = formats[get('Формат') as keyof typeof formats];
    const participationType = participation[get('Тип участия') as keyof typeof participation];
    if (!format || !participationType) fail('неизвестный формат или тип участия');
    const subjectNames = splitValues(get('Предмет'));
    if (!subjectNames.length) fail('предметы не указаны');
    const calendar = get('Календарь'), status = get('Статус');
    return {
      olympiad: {
        id, title: get('Название').trim(), description: nullable(get('Описание')),
        gradeFrom, gradeTo, classesRaw: nullable(get('Классы')), format, participation: participationType, rating,
        scheduleStatus: scheduleStatus(calendar, status), statusRaw: status,
        calendarRaw: nullable(calendar), calendarHash: hash(calendar + '\n' + status + '\n' + get('Расписание обновлено')),
        scheduleUpdatedRaw: nullable(get('Расписание обновлено')),
        organizers: splitValues(get('Организатор')), contacts: splitValues(get('Контакты')), documents: splitValues(get('Документы')),
        featuresRaw: nullable(get('Особенности')), sourceUrl: get('URL'), sourceGroup: nullable(get('Источник')), rawSource: row,
        searchText: normalizeSearch([get('Название'), get('Предмет'), get('Организатор'), get('Описание')].join(' ')),
      },
      subjectNames, stages: parseCalendar(calendar),
    };
  });
}
export type ParsedRow = ReturnType<typeof parseCsv>[number];
export function auditCsv(buffer: Buffer) {
  const rows = parseCsv(buffer);
  return {
    sourceSha256: hash(buffer), rows: rows.length,
    subjects: new Set(rows.flatMap(r => r.subjectNames)).size,
    missingDescription: rows.filter(r => !r.olympiad.description).length,
    missingGrades: rows.filter(r => r.olympiad.gradeFrom === null).length,
    unknownFormat: rows.filter(r => r.olympiad.format === 'unknown').length,
    unknownParticipation: rows.filter(r => r.olympiad.participation === 'unknown').length,
    schedulePublished: rows.filter(r => r.olympiad.scheduleStatus === 'published').length,
    scheduleUnknown: rows.filter(r => r.olympiad.scheduleStatus === 'unknown').length,
    notHeld: rows.filter(r => r.olympiad.scheduleStatus === 'not_held').length,
    rawStages: rows.reduce((sum, r) => sum + r.stages.length, 0),
    unnamedStages: rows.flatMap(r => r.stages).filter(s => !s.name).length,
    verifiedDatesFromCsv: 0,
    datePolicy: 'CSV calendars are preserved without assigning a year. Dates require a separate verified import.',
    documentsPolicy: 'Document labels and truncated contact links are preserved as text; missing URLs are not reconstructed.',
  };
}
