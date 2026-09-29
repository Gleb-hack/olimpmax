import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRoute } from '../src/lib/start-param.ts';

test('bot start parameters open the olympiad card, the plan or the chat', () => {
  assert.equal(startRoute('olympiad_88'), '/olympiads/88');
  assert.equal(startRoute('plan'), '/plan');
  assert.equal(startRoute('olimp'), '/olimp?chat=1');
});
test('unknown or malformed start parameters are ignored', () => {
  for (const value of [null, undefined, '', 'olympiad_', 'olympiad_0', 'olympiad_12abc', '../plan', 'olympiad_1234567890', 'PLAN']) assert.equal(startRoute(value), null);
});
