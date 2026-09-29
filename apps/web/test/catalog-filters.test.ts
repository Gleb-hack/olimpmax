import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiLevels, apiSort, catalogRequest, chipLabel, presetApplied, presetAvailable, presetParams, presetResultText, presetSummary, sortChoice, type CatalogProfile } from '../src/features/catalog/catalog-filters.ts';

const empty: CatalogProfile = { grade: null, subjects: [], online: true, onsite: true, universities: [], directions: [] };
const filled: CatalogProfile = { ...empty, grade: 11, subjects: [2, 1] };
const subjects = [{ id: 1, name: 'Математика' }, { id: 2, name: 'Информатика' }, { id: 3, name: 'Физика' }, { id: 4, name: 'Химия' }];

test('the personal selection needs a grade, subjects or a goal in the profile', () => {
  assert.equal(presetAvailable(empty), false);
  assert.equal(presetAvailable({ ...empty, grade: 9 }), true);
  assert.equal(presetAvailable({ ...empty, universities: ['mipt'] }), true);
});

test('the profile becomes filters: subjects, grade, a single format; the goal only when nothing else is there', () => {
  assert.equal(presetParams(filled).toString(), 'subjectIds=2%2C1&grades=11');
  assert.equal(presetParams({ ...filled, online: true, onsite: false }).get('formats'), 'online');
  assert.equal(presetParams({ ...filled, universities: ['mipt'] }).has('universities'), false, 'with subjects the goal orders, not filters');
  assert.equal(presetParams({ ...empty, universities: ['mipt', 'spbu'] }).get('universities'), 'mipt,spbu');
  assert.equal(presetParams({ ...empty, directions: ['09.03.04'] }).get('directions'), '09.03.04');
});

test('applied means exactly the preset filters, in any order, whatever the sort', () => {
  assert.equal(presetApplied(new URLSearchParams('subjectIds=1,2&grades=11&sort=deadline'), filled), true);
  assert.equal(presetApplied(new URLSearchParams('subjectIds=1&grades=11'), filled), false);
  assert.equal(presetApplied(new URLSearchParams('subjectIds=1,2&grades=11&levels=I'), filled), false, 'one more filter — not the selection');
  assert.equal(presetApplied(new URLSearchParams(''), empty), false);
});

test('the summary of the banner and the chips', () => {
  assert.equal(presetSummary(filled, subjects), '11 класс · Информатика, Математика');
  assert.equal(presetSummary({ ...filled, subjects: [1, 2, 3, 4, 5] }, subjects), '11 класс · Математика, Информатика, Физика, ещё 1');
  assert.equal(presetSummary({ ...empty, universities: ['mipt'] }, subjects), 'Олимпиады с льготами в твоих целевых вузах');
  assert.equal(chipLabel('Предмет', []), 'Предмет');
  assert.equal(chipLabel('Предмет', ['Математика', 'Физика', 'Химия']), 'Математика +2');
  assert.equal(presetResultText(4), 'Найдено 4 олимпиады под твой профиль');
  assert.equal(presetResultText(21), 'Найдена 21 олимпиада под твой профиль');
});

test('levels widen for the API, the order follows the goal', () => {
  assert.deepEqual(apiLevels(['I']), ['I', 'I–II', 'I–III']);
  assert.deepEqual(apiLevels(['ВсОШ']), ['ВсОШ']);
  assert.equal(sortChoice(new URLSearchParams('sort=goal')), 'relevant', 'old links still open');
  assert.equal(apiSort('relevant', true), 'goal');
  assert.equal(apiSort('relevant', false), 'complete');
  const query = catalogRequest(new URLSearchParams('levels=II&sort=deadline&page=2&mode=x'), { ...filled, universities: ['mipt'] });
  assert.equal(query.get('levels'), 'II,I–II,II–III,I–III');
  assert.equal(query.get('sort'), 'deadline');
  assert.equal(query.get('goalUniversities'), 'mipt');
  assert.equal(query.get('page'), '2');
  assert.equal(query.has('mode'), false);
  assert.equal(catalogRequest(new URLSearchParams(''), filled).has('sort'), false, '«complete» is the API default');
});
