import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRoute } from '../src/lib/start-param.ts';
import { botStartUrl } from '../src/lib/bot-link.ts';

test('bot start parameters open the olympiad card, the plan or the chat', () => {
  assert.equal(startRoute('olympiad_88'), '/olympiads/88');
  assert.equal(startRoute('plan'), '/plan');
  assert.equal(startRoute('olimp'), '/olimp?chat=1');
});
test('unknown or malformed start parameters are ignored', () => {
  for (const value of [null, undefined, '', 'olympiad_', 'olympiad_0', 'olympiad_12abc', '../plan', 'olympiad_1234567890', 'PLAN', 'ask_', 'search_!!', 'ask_/w==', 'search_gA']) assert.equal(startRoute(value), null, String(value));
});
test('text from the bot opens the search or Olimp\'s chat with the text typed in', () => {
  const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
  assert.equal(startRoute('search_' + encode('олимпиады по химии')), '/search?q=' + encodeURIComponent('олимпиады по химии'));
  assert.equal(startRoute('ask_' + encode('Какие льготы у «Физтеха»?')), '/olimp?chat=1&ask=' + encodeURIComponent('Какие льготы у «Физтеха»?'));
  assert.equal(startRoute('search_' + encode('  физтех\n')), '/search?q=' + encodeURIComponent('физтех'), 'spaces and control characters are trimmed');
});
test('the link to the bot opens it with «notify», so the bot says it is connected', () => {
  assert.equal(botStartUrl('https://max.ru/olimp_bot'), 'https://max.ru/olimp_bot?start=notify');
});
