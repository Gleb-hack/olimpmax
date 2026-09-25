import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFiles } from '../apps/api/src/features/export.js';

test('prepared export links expire, stay per user and are dropped with the account', () => {
  let now = 0;
  const files = exportFiles(1000, () => now, 2);
  const first = files.put('a', '{"a":1}', 'a.json');
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(files.get(first)?.body, '{"a":1}');
  const second = files.put('a', '{"a":2}', 'a.json');
  assert.equal(files.get(first), null, 'a new export replaces the previous link of the same user');
  const other = files.put('b', '{}', 'b.json');
  files.put('c', '{}', 'c.json');
  assert.equal(files.get(second), null, 'the oldest file is evicted at the limit');
  files.dropUser('b');
  assert.equal(files.get(other), null);
  const late = files.put('d', '{}', 'd.json');
  now = 1000;
  assert.equal(files.get(late), null, 'links expire after the TTL');
});
