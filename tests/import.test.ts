import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseCalendar, auditCsv, normalizeSearch, headers, enrichedHeaders } from '../apps/api/src/import/csv.js';
const source = readFileSync(new URL('../olimpiady.csv', import.meta.url));

test('all CSV records and multiline quoted content are preserved', () => {
  const rows = parseCsv(source);
  assert.equal(rows.length, 640);
  assert.equal(new Set(rows.map(r => r.olympiad.id)).size, 640);
  assert.equal(new Set(rows.flatMap(r => r.subjectNames)).size, 34);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row.olympiad.rawSource), enrichedHeaders);
    assert.equal(row.olympiad.sourceUrl, `https://olimpiada.ru/activity/${row.olympiad.id}`);
    assert.equal(row.olympiad.title, row.olympiad.rawSource['Название']!.trim());
  }
  assert.equal(auditCsv(source).verifiedDatesFromCsv, 0);
});
test('legacy CSV schema remains supported and enriched levels and source text survive import', () => {
  const row = parseCsv(source)[0]!;
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const legacy = Buffer.from(headers.join(';') + '\n' + headers.map(key => quote(row.olympiad.rawSource[key]!)).join(';'));
  assert.equal(parseCsv(legacy)[0]!.olympiad.id, row.olympiad.id);
  assert.equal(row.olympiad.rawSource['Уровень олимпиады'], 'ВсОШ');
  assert.equal(row.olympiad.rawSource['Календарь исходный'], 'Школьный этап\nДо 1 ноя\nМуниципальный этап\n2 ноя—25 дек');
  const enriched = parseCalendar('Регистрация на отборочный этап: До 30 ноя\nОтборочный этап: 1—2 дек');
  assert.equal(enriched.length, 2);
  assert.equal(enriched[0]!.kind, 'registration');
  assert.equal(enriched[0]!.rawDates, 'До 30 ноя');
  assert.equal(enriched[1]!.name, 'Отборочный этап');
  assert.equal(enriched[1]!.rawDates, '1—2 дек');
  const partial = parseCsv(source).find(row => row.olympiad.id === 6984)!;
  assert.equal(partial.olympiad.scheduleStatus, 'published');
  assert.equal(partial.stages[0]!.kind, 'registration');
  assert.equal(partial.stages[0]!.rawDates, '1 мая 2026 — 10 декабря 2026');
});
test('CSV rejects malformed input and duplicate IDs before import', () => {
  assert.throws(() => parseCsv(Buffer.from('ID;Название\n1;X')), /Столбцы/);
  assert.throws(() => parseCsv(Buffer.from(source.toString().replace(/^88;/m, '32;'))), /URL|повторный/);
});
test('calendar parser preserves unknown names and never invents years', () => {
  assert.deepEqual(parseCalendar('Расписание олимпиады в этом году пока не известно'), []);
  assert.deepEqual(parseCalendar('В этом году олимпиада не проводится'), []);
  const stages = parseCalendar('Регистрация\nДо 30 ноя\nОтборочный этап\n1...2 дек\nФинал\nУточняется');
  assert.equal(stages.length, 3);
  assert.equal(stages[0]!.kind, 'registration');
  assert.equal(stages[0]!.rawDates, 'До 30 ноя');
  assert.equal(stages[2]!.rawDates, 'Уточняется');
  const unnamed = parseCalendar('Отборочный этап\nДо 19 янв\n31 янв...2 фев');
  assert.equal(unnamed[1]!.name, null);
  const numbered = parseCalendar('23-я олимпиада\n2...9 дек');
  assert.equal(numbered.length, 1);
  assert.equal(numbered[0]!.name, '23-я олимпиада');
});
test('search is Russian-case-insensitive and treats е/ё and punctuation consistently', () => {
  assert.equal(normalizeSearch('  «ЁЛКА» — для ШКОЛЬНИКОВ  '), 'елка для школьников');
  assert.equal(normalizeSearch("%_'; DROP TABLE"), 'drop table');
});
