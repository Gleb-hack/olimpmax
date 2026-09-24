import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OlympiadDetail } from '../packages/contracts/src/index.js';
import { answerAssistant, type AssistantData } from '../apps/api/src/features/assistant/assistant.js';
import { webConsent, WebConsentError } from '../apps/api/src/features/assistant/web-consent.js';
import { extractPage, isPublicAddress, publicUrl, type PublicPage } from '../apps/api/src/features/assistant/public-page.js';
import { buildSearchQuery, numberSourceReferences, researchOlympiad, WEB_DISCLAIMER } from '../apps/api/src/features/assistant/web-research.js';
import { AssistantError } from '../apps/api/src/features/assistant/deepseek.js';

const item = OlympiadDetail.parse(JSON.parse(readFileSync(new URL('../apps/web/src/lib/mock-details.json', import.meta.url), 'utf8'))[0]);
const data: AssistantData = { subjects: async () => [], search: async () => ({ items: [{ id: item.id }], total: 1 }),
  detail: async id => id === item.id ? item : null, planIds: async () => [], deadlineIds: async () => [] };
const task = { question: 'Сколько стоит участие?', olympiadIds: [item.id] };
const userA = '123e4567-e89b-42d3-a456-426614174000', userB = '123e4567-e89b-42d3-a456-426614174001';
const signal = AbortSignal.timeout(10000);

test('web consent is bound to user, original question, selected records and expiry', () => {
  let now = 1000;
  const consent = webConsent('test-secret', () => now);
  const token = consent.issue(userA, task);
  assert.deepEqual(consent.verify(userA, token), task);
  assert.throws(() => consent.verify(userB, token), WebConsentError);
  const [body, signature] = token.split('.');
  const modified = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), task: { ...task, olympiadIds: [88] } })).toString('base64url');
  assert.throws(() => consent.verify(userA, modified + '.' + signature), WebConsentError);
  assert.throws(() => consent.verify(userA, 'yes'), WebConsentError);
  now += 15 * 60_000;
  assert.throws(() => consent.verify(userA, token), WebConsentError);
});
test('public reader rejects local, metadata, reserved, mapped and non-http targets', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '0.0.0.0', '203.0.113.1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  for (const url of ['file:///etc/passwd', 'http://localhost', 'http://127.1', 'http://2130706433', 'http://[::1]', 'https://example.org:8443', 'https://user:pass@example.org', 'http://thing.local']) assert.throws(() => publicUrl(url), Error, url);
  assert.equal(publicUrl('https://olimpiada.ru/activity/88#schedule').href, 'https://olimpiada.ru/activity/88');
});
test('HTML extraction preserves Russian, removes scripts and limits links to associated sources', () => {
  const text = 'Участие бесплатное. Регистрация завершится 20 октября 2026 года. Уточните условия на сайте организатора.';
  const page = extractPage(Buffer.from(`<html><body><h1>Олимпиада по информатике</h1><p>${text}</p><script>SECRET_SCRIPT</script><div class="contacts"><a href="https://olymp.itmo.ru/">Организатор</a></div><div id="new_for_activity"><a href="/news/1234">Новости олимпиады</a></div><a href="/activity/999">Чужая олимпиада</a><a href="https://ads.example.org/">Реклама</a></body></html>`), 'https://olimpiada.ru/activity/88');
  assert.equal(page.title, 'Олимпиада по информатике'); assert.match(page.text, /бесплатное/);
  assert(!page.text.includes('SECRET_SCRIPT'));
  assert.deepEqual(page.links.map(l => l.url), ['https://olymp.itmo.ru/', 'https://olimpiada.ru/news/1234']);
});
test('insufficient database evidence creates a proposal without reading websites', async () => {
  let calls = 0;
  const answer = await answerAssistant({ message: task.question, history: [] }, data, async () => ++calls === 1
    ? { intent: 'detail', olympiadIds: [item.id], researchQuestion: `Сколько стоит участие в ${item.title}?` }
    : { message: 'Стоимость в базе не указана.', olympiadIds: [item.id], needsWebSearch: true }, '2026-09-23', signal);
  assert.deepEqual(answer.research?.task, { ...task, question: `Сколько стоит участие в ${item.title}?` }); assert.equal(answer.webSources, undefined);
});
const searchResults = [{ url: 'https://organizer.ru/rules', title: 'Правила', snippet: 'Участие бесплатное.' }];
test('Serper research uses actual result URLs instead of crawling catalog links', async () => {
  const visited: string[] = [], queries: string[] = [];
  let calls = 0;
  const answer = await researchOlympiad(task, data, async () => ++calls === 1
    ? { indexes: [0] } : { message: 'Участие бесплатное [0].', found: true, sourceIndexes: [0] },
  '2026-09-23', signal, async query => { queries.push(query); return searchResults; }, async url => {
    visited.push(url); return { url, title: 'Правила участия', text: 'Участие бесплатное.', links: [] };
  });
  assert.equal(queries.length, 1); assert(queries[0]!.includes('Наше наследие')); assert.match(queries[0]!, /стоит участие/);
  assert.deepEqual(visited, ['https://organizer.ru/rules']);
  assert.equal(answer.webSources?.[0]?.url, 'https://organizer.ru/rules'); assert.equal(answer.webSources?.[0]?.kind, 'page');
  assert.equal(answer.webDisclaimer, WEB_DISCLAIMER); assert.deepEqual(answer.olympiads, []);
});
test('unreadable sites use explicitly labelled search excerpts, never pretend a page was read', async () => {
  let calls = 0;
  const answer = await researchOlympiad(task, data, async (_system, input) => {
    if (++calls === 1) return { indexes: [0] };
    assert.equal((input as { sources: {kind: string}[] }).sources[0]!.kind, 'search_result');
    return { message: 'По выдержке из поиска участие бесплатное [0].', found: true, sourceIndexes: [0] };
  }, '2026-09-23', signal, async () => searchResults, async () => { throw Error('JS only'); });
  assert.equal(answer.webSources?.[0]?.kind, 'search_result'); assert(answer.webDisclaimer);
});
test('search errors, empty results and fabricated selection/citations are handled safely', async () => {
  const neverRead = async (): Promise<PublicPage> => { throw Error('must not read'); };
  await assert.rejects(researchOlympiad(task, data, async () => { throw Error('must not call'); }, '2026-09-23', signal,
    async () => { throw new AssistantError('WEB_SEARCH_UNAVAILABLE', 'Unavailable'); }, neverRead),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_UNAVAILABLE');
  const empty = await researchOlympiad(task, data, async () => { throw Error('must not call'); }, '2026-09-23', signal, async () => [], neverRead);
  assert.deepEqual(empty.webSources, []); assert(empty.webDisclaimer);
  await assert.rejects(researchOlympiad(task, data, async () => ({ indexes: [99] }), '2026-09-23', signal,
    async () => searchResults, neverRead), (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_INVALID_ANSWER');
  let calls = 0;
  await assert.rejects(researchOlympiad(task, data, async () => ++calls === 1 ? { indexes: [0] }
    : { message: 'Выдумано', found: true, sourceIndexes: [8] }, '2026-09-23', signal, async () => searchResults, neverRead),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_INVALID_ANSWER');
});

test('citation numbers always match the displayed source order', () => {
  assert.equal(numberSourceReferences('Правила [1], сайт [0].', [1, 0]), 'Правила [1], сайт [2].');
  assert.throws(() => numberSourceReferences('Источник [8].', [0]), AssistantError);
});

test('search query uses a short event name and intent keywords without conversational filler', () => {
  const query = buildSearchQuery('Всероссийская естественнонаучная олимпиада «Российская школа фармацевтов»',
    'Какие условия участия, этапы и сроки регистрации у олимпиады Российская школа фармацевтов?');
  assert.equal(query, 'Российская школа фармацевтов условия участия этапы сроки регистрации');
  assert.match(buildSearchQuery('Олимпиада X', 'Какой взнос за участие в олимпиаде X для 10 класса в 2026 году?'), /взнос участие 10 класса 2026 году/);
});
