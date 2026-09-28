import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalRegion, regionGroups, regionNames, searchRegions } from '../src/lib/regions.ts';

const names = (query: string) => searchRegions(query).flatMap(group => group.regions.map(region => region.name));

test('the region list: 89 regions in 8 federal districts, each once', () => {
  assert.equal(regionGroups.length, 8);
  assert.equal(regionNames.length, 89);
  assert.equal(new Set(regionNames).size, 89);
  // Lines that were run together in regions.txt are separate regions.
  for (const name of ['Калининградская область', 'Ленинградская область', 'Ненецкий автономный округ', 'Донецкая Народная Республика', 'Луганская Народная Республика', 'Херсонская область', 'Чукотский автономный округ']) {
    assert.ok(regionNames.includes(name), name);
  }
  assert.ok(!regionNames.some(name => /округ$/.test(name) && !/автономный округ/.test(name)), 'district headings are not regions');
});

test('typing narrows the list by the beginnings of words and by common short names', () => {
  assert.deepEqual(names('татар'), ['Республика Татарстан']);
  assert.deepEqual(names('сар об'), ['Саратовская область']);
  assert.deepEqual(names('ХМАО'), ['Ханты-Мансийский автономный округ — Югра']);
  assert.deepEqual(names('питер'), ['Санкт-Петербург']);
  assert.deepEqual(names('якутия'), ['Республика Саха (Якутия)']);
  assert.deepEqual(names('моск'), ['Московская область', 'Москва']);
  assert.ok(!names('ленин').includes('Калининградская область'));
  assert.deepEqual(names('Казань'), []);
  assert.equal(names('').length, 89);
  assert.deepEqual(searchRegions('ростов').map(group => group.district), ['Южный округ']);
});

test('a typed region is stored as it is written in the list', () => {
  assert.equal(canonicalRegion('республика татарстан'), 'Республика Татарстан');
  assert.equal(canonicalRegion('  Ханты-Мансийский автономный округ - Югра '), 'Ханты-Мансийский автономный округ — Югра');
  assert.equal(canonicalRegion('Кемеровская область Кузбасс'), 'Кемеровская область — Кузбасс');
  assert.equal(canonicalRegion('Казань'), null);
  assert.equal(canonicalRegion(''), null);
});
