import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serperSearch } from '../apps/api/src/features/assistant/serper.js';
import { AssistantError } from '../apps/api/src/features/assistant/deepseek.js';

test('Serper sends the key only to its fixed endpoint and filters unsafe result URLs', async () => {
  const search = serperSearch('test-key', async (url, init) => {
    assert.equal(url, 'https://google.serper.dev/search'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('X-API-KEY'), 'test-key');
    assert.deepEqual(JSON.parse(String(init?.body)), { q: 'Олимпиада стоимость', gl: 'ru', hl: 'ru', num: 5 });
    return Response.json({ organic: [
      { title: 'Правила', link: 'https://organizer.ru/rules', snippet: 'Бесплатно', date: 'Sep 2026' },
      { title: 'Local', link: 'http://127.0.0.1/private' }, { title: 'File', link: 'file:///etc/passwd' },
    ] });
  });
  assert.deepEqual(await search('Олимпиада стоимость', new AbortController().signal), [
    { title: 'Правила', url: 'https://organizer.ru/rules', snippet: 'Бесплатно', date: 'Sep 2026' },
  ]);
});
test('Serper missing key, provider errors and malformed results never expose upstream details or fall back', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(serperSearch(undefined, async () => { throw Error('must not call'); })('q', signal),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_NOT_CONFIGURED');
  for (const status of [401, 429, 500]) {
    let calls = 0;
    await assert.rejects(serperSearch('secret', async () => { calls++; return new Response('secret upstream detail', { status }); })('q', signal),
      (e: unknown) => e instanceof AssistantError && !e.message.includes('secret') && e.status === (status === 429 ? 429 : 503));
    assert.equal(calls, 1);
  }
  await assert.rejects(serperSearch('secret', async () => Response.json({ organic: 'bad' }))('q', signal),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_INVALID_RESPONSE');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(serperSearch('secret', async () => { throw Error('secret'); })('q', controller.signal),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_TIMEOUT');
});
