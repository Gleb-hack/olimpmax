import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationHistory, welcomeMessages, type ChatMessage } from '../src/features/assistant/conversation';

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
test('web search announcements and web replies keep topic IDs and the normalized question, never the ticket', () => {
  const messages: ChatMessage[] = [
    { id: 'search', role: 'assistant', content: 'В нашей базе нет данных о стоимости. Сейчас поищу в интернете.', at: '', olympiads: [],
      webSearch: { token: 'private-token', question: 'Сколько стоит участие в олимпиаде X?', olympiadIds: [88] }, webSearchState: 'done' },
    { id: 'result', role: 'assistant', content: 'Участие бесплатное.', at: '', olympiads: [], contextOlympiadIds: [88] },
  ];
  const history = conversationHistory(messages);
  assert.match(history[0]!.content, /Сколько стоит/); assert.deepEqual(history[0]!.olympiadIds, [88]);
  assert.deepEqual(history[1]!.olympiadIds, [88]); assert(!JSON.stringify(history).includes('private-token'));
});
