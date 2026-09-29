import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionNote, directionRank, orderOptions, pickByKey, universityRank, type Direction, type University } from '../src/features/profile/goal-format.ts';

const direction = (code: string, name: string, extra: Partial<Direction> = {}): Direction => ({ code, name, educationLevel: code.includes('.05.') ? 'specialist' : 'bachelor',
  ugsnCode: '09.00.00', ugsnName: 'Информатика и вычислительная техника', popular: false, aliases: [], note: null, egeSubjects: [], subjectsCore: [], subjectsRelated: [],
  universityCount: 0, programCount: 0, ...extra });
const directions = [
  direction('09.03.04', 'Программная инженерия', { popular: true, aliases: ['прога', 'разработчик'] }),
  direction('31.05.01', 'Лечебное дело', { popular: true, aliases: ['врач'], ugsnName: 'Клиническая медицина' }),
  direction('09.03.01', 'Информатика и вычислительная техника'),
  direction('01.03.02', 'Прикладная математика и информатика', { popular: true }),
];
const university = (slug: string, name: string, city: string, fullName: string | null = null): University => ({ slug, name, city, fullName, seriesCount: 0, olympiadCount: 0 });

test('direction search matches the code, words of the name, then colloquial aliases', () => {
  const find = (query: string) => orderOptions(directions, query, directionRank, () => false, item => item.popular, (a, b) => a.code.localeCompare(b.code)).map(item => item.code);
  assert.deepEqual(find('09.03'), ['09.03.04', '09.03.01']);
  // «Программная инженерия» is found by its group «Информатика и вычислительная техника», after the name matches.
  assert.deepEqual(find('информатика'), ['09.03.01', '01.03.02', '09.03.04']);
  assert.deepEqual(find('врач'), ['31.05.01']);
  assert.deepEqual(find('Прога'), ['09.03.04']);
  assert.deepEqual(find('астрономия'), []);
});

test('without a query the chosen items come first, then popular ones', () => {
  const order = orderOptions(directions, '', directionRank, item => item.code === '09.03.01', item => item.popular, (a, b) => a.code.localeCompare(b.code));
  assert.deepEqual(order.map(item => item.code), ['09.03.01', '01.03.02', '09.03.04', '31.05.01']);
});

test('university search covers the short name, the full name and the city', () => {
  const list = [university('mipt', 'МФТИ', 'Долгопрудный', 'Московский физико-технический институт'), university('spbu', 'СПбГУ', 'Санкт-Петербург')];
  const find = (query: string) => orderOptions(list, query, universityRank, () => false, () => false, (a, b) => a.name.localeCompare(b.name, 'ru')).map(item => item.slug);
  assert.deepEqual(find('мфти'), ['mipt']);
  assert.deepEqual(find('физико'), ['mipt']);
  assert.deepEqual(find('санкт'), ['spbu']);
});

test('the profile shows names in the saved order and skips codes the list no longer has', () => {
  assert.deepEqual(pickByKey(directions, ['31.05.01', '99.03.99', '09.03.04'], item => item.code).map(item => item.name), ['Лечебное дело', 'Программная инженерия']);
  assert.equal(directionNote(directions[1]!), '31.05.01 · специалитет');
});
