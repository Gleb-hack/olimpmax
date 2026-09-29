import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterUniversities, universityCities, universityFacts } from '../src/features/catalog/university-search.ts';
import type { University } from '../src/features/profile/goal-format.ts';

const university = (slug: string, name: string, city: string, programCount: number, olympiadCount: number, fullName: string | null = null): University =>
  ({ slug, name, city, fullName, seriesCount: 0, olympiadCount, programCount });
const list = [
  university('hse', 'НИУ ВШЭ', 'Москва', 120, 90, 'Национальный исследовательский университет «Высшая школа экономики»'),
  university('mipt', 'МФТИ', 'Долгопрудный', 40, 60, 'Московский физико-технический институт'),
  university('spbu', 'СПбГУ', 'Санкт-Петербург', 200, 30),
  university('msu', 'МГУ', 'Москва', 150, 120, 'Московский государственный университет имени М. В. Ломоносова'),
];
const names = (items: University[]) => items.map(item => item.slug);

test('without a query universities go by name or by the chosen order', () => {
  assert.deepEqual(names(filterUniversities(list, { q: '', city: '', sort: 'name' })), ['msu', 'mipt', 'hse', 'spbu']);
  assert.deepEqual(names(filterUniversities(list, { q: '', city: '', sort: 'programs' })), ['spbu', 'msu', 'hse', 'mipt']);
  assert.deepEqual(names(filterUniversities(list, { q: '', city: '', sort: 'olympiads' })), ['msu', 'hse', 'mipt', 'spbu']);
});

test('search by name, full name and city; the city filter and «Мои вузы»', () => {
  assert.deepEqual(names(filterUniversities(list, { q: 'мфти', city: '', sort: 'name' })), ['mipt']);
  assert.deepEqual(names(filterUniversities(list, { q: 'Московский', city: '', sort: 'name' })), ['msu', 'mipt']);
  assert.deepEqual(names(filterUniversities(list, { q: 'санкт', city: '', sort: 'name' })), ['spbu']);
  assert.deepEqual(names(filterUniversities(list, { q: '', city: 'Москва', sort: 'name' })), ['msu', 'hse']);
  assert.deepEqual(names(filterUniversities(list, { q: '', city: '', sort: 'name', only: ['hse', 'spbu'] })), ['hse', 'spbu']);
});

test('cities are counted, the card facts are pluralized', () => {
  assert.deepEqual(universityCities(list)[0], { city: 'Москва', count: 2 });
  assert.deepEqual(universityFacts({ programCount: 21, olympiadCount: 3 }), ['21 программа', '3 олимпиады с льготами']);
  assert.deepEqual(universityFacts({ programCount: undefined, olympiadCount: 0 }), []);
});
