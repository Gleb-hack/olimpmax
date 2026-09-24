import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationHistory, isSearchConsent, isSearchDecline, welcomeMessages, type ChatMessage } from '../src/features/assistant/conversation';

test('history excludes failed questions, limits context and preserves recent conversation order', () => {
  const messages: ChatMessage[] = [...welcomeMessages(), ...Array.from({ length: 14 }, (_, i): ChatMessage => ({
    id: String(i), role: i % 2 ? 'assistant' : 'user', content: 'a'.repeat(1200), olympiads: [], at: '2026-09-23T00:00:00Z',
    failed: i === 12,
  }))];
  const history = conversationHistory(messages);
  assert(history.length <= 10); assert(history.reduce((n, m) => n + m.content.length, 0) <= 10000);
  assert.equal(history.at(-1)!.role, 'assistant');
  assert.equal(history.some(m => m.content.includes('Привет')), false);
  assert.equal(conversationHistory([{ ...messages[2]!, failed: true }]).length, 0);
});
test('only an unambiguous confirmation can accept the pending web offer', () => {
  for (const text of ['Да', 'Давай', 'Да, поищи в интернете.', 'Поищи']) assert.equal(isSearchConsent(text), true);
  for (const text of ['Нет', 'Да, но не ищи', 'даже не думай', 'Не ищи в интернете', 'давай другую олимпиаду']) assert.equal(isSearchConsent(text), false);
  for (const text of ['Нет', 'Нет, спасибо', 'Не сейчас', 'Не ищи в интернете.']) assert.equal(isSearchDecline(text), true);
  for (const text of ['Да', 'Нет информации о взносах?', 'Не надо математику, ищи информатику']) assert.equal(isSearchDecline(text), false);
});

test('compact offers and research replies retain topic IDs and normalized questions, never tokens', () => {
  const messages: ChatMessage[] = [
    { id: 'offer', role: 'assistant', content: 'Поискать в интернете?', at: '', olympiads: [], offerOnly: true,
      webSearchOffer: { token: 'private-token', question: 'Сколько стоит участие в олимпиаде X?', olympiads: [{ id: 88, title: 'X' }] } },
    { id: 'result', role: 'assistant', content: 'Участие бесплатное.', at: '', olympiads: [], contextOlympiadIds: [88] },
  ];
  const history = conversationHistory(messages);
  assert.match(history[0]!.content, /Сколько стоит/); assert.deepEqual(history[0]!.olympiadIds, [88]);
  assert.deepEqual(history[1]!.olympiadIds, [88]); assert(!JSON.stringify(history).includes('private-token'));
});
