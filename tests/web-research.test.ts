import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OlympiadDetail } from '../packages/contracts/src/index.js';
import { answerAssistant, type AssistantData } from '../apps/api/src/features/assistant/assistant.js';
import { webResearchTickets, WebTaskError } from '../apps/api/src/features/assistant/web-task.js';
import { extractPage, extractPdf, isPublicAddress, publicUrl, type PublicPage } from '../apps/api/src/features/assistant/public-page.js';
import { contactSites, followableLinks, numberSourceReferences, researchCandidates, researchExcerpt, researchOnWeb, WEB_DISCLAIMER, WEB_SEARCH_ANNOUNCEMENT } from '../apps/api/src/features/assistant/web-research.js';
import { loadKnowledge, type LinkEntry } from '../apps/api/src/features/assistant/knowledge.js';
import { AssistantError } from '../apps/api/src/features/assistant/deepseek.js';

const item = OlympiadDetail.parse(JSON.parse(readFileSync(new URL('../apps/web/src/lib/mock-details.json', import.meta.url), 'utf8'))[0]);
const data: AssistantData = {
  userContext: async () => ({ profile: { grade: null, subjects: [], online: true, onsite: true }, plan: { total: 0, truncated: false, items: [] } }), subjects: async () => [], search: async () => ({ items: [{ id: item.id }], total: 1 }),
  detail: async id => id === item.id ? item : null, planIds: async () => [], deadlineIds: async () => [], scheduleIds: async () => [item.id],
  universityNames: async () => [{ slug: 'mipt', name: 'МФТИ', aliases: [] }],
  universities: async slugs => slugs.includes('mipt') ? [{ slug: 'mipt', name: 'МФТИ', fullName: 'Московский физико-технический институт', city: 'Долгопрудный', benefits: [] }] : [],
  faq: () => [] };
const task = { question: 'Сколько стоит участие?', olympiadIds: [item.id], universitySlugs: [] };
const userA = '123e4567-e89b-42d3-a456-426614174000', userB = '123e4567-e89b-42d3-a456-426614174001';
const signal = AbortSignal.timeout(10000);
const links: LinkEntry[] = [
  { index: 0, url: 'https://pk.mipt.ru/bachelor/2026_rules/', host: 'pk.mipt.ru', description: 'МФТИ — правила приема на 2026 год: минимальные баллы, льготы, сроки.' },
  { index: 1, url: 'https://rsr-olymp.ru/', host: 'rsr-olymp.ru', description: 'РСОШ — перечень олимпиад и уровни.' },
];
const page = (url: string, text = 'Участие бесплатное. Регистрация до 20 октября.', extra: Partial<PublicPage> = {}): PublicPage =>
  ({ url, title: 'Страница', text, links: [], kind: 'html', ...extra });

test('research tickets are bound to user, question, selected records and expiry', () => {
  let now = 1000;
  const tickets = webResearchTickets('test-secret', () => now);
  const token = tickets.issue(userA, task);
  assert.deepEqual(tickets.verify(userA, token), task);
  assert.throws(() => tickets.verify(userB, token), WebTaskError);
  const [payload, signature] = token.split('.');
  const modified = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), task: { ...task, olympiadIds: [88] } })).toString('base64url');
  assert.throws(() => tickets.verify(userA, modified + '.' + signature), WebTaskError);
  assert.throws(() => tickets.verify(userA, 'yes'), WebTaskError);
  // General questions (a university, admission rules) need no catalog olympiad.
  assert.deepEqual(tickets.verify(userA, tickets.issue(userA, { question: 'Проходной балл МФТИ?', universitySlugs: ['mipt'] })).olympiadIds, []);
  now += 15 * 60_000;
  assert.throws(() => tickets.verify(userA, token), WebTaskError);
});
test('public reader rejects local, metadata, reserved, mapped and non-http targets', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '0.0.0.0', '203.0.113.1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  for (const url of ['file:///etc/passwd', 'http://localhost', 'http://127.1', 'http://2130706433', 'http://[::1]', 'https://example.org:8443', 'https://user:pass@example.org', 'http://thing.local']) assert.throws(() => publicUrl(url), Error, url);
  assert.equal(publicUrl('https://olimpiada.ru/activity/88#schedule').href, 'https://olimpiada.ru/activity/88');
});
test('HTML extraction preserves Russian, removes scripts and keeps document links for one more step', () => {
  const text = 'Участие бесплатное. Регистрация завершится 20 октября 2026 года. Уточните условия на сайте организатора.';
  const html = extractPage(Buffer.from(`<html><body><h1>Олимпиада по информатике</h1><p>${text}</p><script>SECRET_SCRIPT</script><div class="contacts"><a href="https://olymp.itmo.ru/">Организатор</a></div><div id="new_for_activity"><a href="/news/1234">Новости олимпиады</a></div><a href="/activity/999">Чужая олимпиада</a><a href="https://ads.example.org/">Реклама</a></body></html>`), 'https://olimpiada.ru/activity/88');
  assert.equal(html.title, 'Олимпиада по информатике'); assert.match(html.text, /бесплатное/);
  assert(!html.text.includes('SECRET_SCRIPT'));
  assert.deepEqual(html.links.map(l => l.url), ['https://olymp.itmo.ru/', 'https://olimpiada.ru/news/1234']);
  const rules = extractPage(Buffer.from(`<html><body><main><p>${text}</p><a href="/docs/pravila.pdf">Правила приёма 2026</a><a href="/f.docx">Анкета</a></main></body></html>`), 'https://abit.example.ru/');
  assert.deepEqual(rules.links.map(l => l.url), ['https://abit.example.ru/docs/pravila.pdf']);
});
test('PDF documents are read as text: admission rules are usually published as PDF', async () => {
  const pdf = await extractPdf(readFileSync(new URL('./fixtures/admission-rules.pdf', import.meta.url)), 'https://example.org/files/pravila_priema.pdf');
  assert.equal(pdf.kind, 'pdf'); assert.equal(pdf.title, 'pravila_priema');
  assert.match(pdf.text, /Минимальный балл ЕГЭ для подтверждения диплома — 75 баллов/);
  assert.match(pdf.text, /с 20 июня по 25 июля/);
  await assert.rejects(extractPdf(Buffer.from('<html>not a pdf</html>'), 'https://example.org/a.pdf'));
});
test('the curated link list is loaded from data/assistant without tracking parameters', () => {
  const knowledge = loadKnowledge();
  assert.equal(knowledge.links.length, 88);
  assert.ok(knowledge.links.every(link => !/utm_/.test(link.url)));
  assert.ok(knowledge.links.some(link => link.url === 'https://olimpiada.ru/' && /каталог/.test(link.description)));
  assert.ok(knowledge.links.some(link => link.url.startsWith('https://cpk.msu.ru/') && /МГУ/.test(link.description)));
  // Universities added in September 2026 bring their sites and admission rules.
  assert.ok(knowledge.links.some(link => link.url === 'https://tpu.ru/' && /ТПУ/.test(link.description)));
  assert.ok(knowledge.links.some(link => link.url.startsWith('https://pk.mpei.ru/') && /правила приёма/.test(link.description)));
});
test('candidates: the olympiad page and organizer site first, then the curated list; contacts give sites but not e-mail domains', () => {
  assert.deepEqual(contactSites(['olymp@hse.ru', 'https://olymp.hse.ru/mmo', 'Сайт: olymp.msu.ru/rules; +7 495 000-00-00']), ['https://olymp.hse.ru/mmo', 'https://olymp.msu.ru/rules']);
  const candidates = researchCandidates([{ ...item, contacts: ['https://organizer.ru/'] }], links);
  assert.deepEqual(candidates.map(c => c.url), [item.sourceUrl, 'https://organizer.ru/', ...links.map(l => l.url)]);
  assert.match(candidates[0]!.description, new RegExp(item.title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
test('insufficient database evidence returns an announcement and a ticket, never a consent question', async () => {
  let calls = 0;
  const answer = await answerAssistant({ message: task.question, history: [] }, data, async () => ++calls === 1
    ? { intent: 'detail', olympiadIds: [item.id], researchQuestion: `Сколько стоит участие в ${item.title}?` }
    : { message: 'Стоимость в базе не указана.', olympiadIds: [item.id], needsWebSearch: true }, '2026-09-23', signal);
  assert.deepEqual(answer.research?.task, { ...task, question: `Сколько стоит участие в ${item.title}?` });
  assert.equal(answer.message, `Стоимость в базе не указана. ${WEB_SEARCH_ANNOUNCEMENT}`);
  assert.equal(answer.webSources, undefined);
});
test('research opens only chosen known addresses and cites the pages it read', async () => {
  const visited: string[] = [];
  let calls = 0;
  const answer = await researchOnWeb(task, data, async (_system, input) => {
    if (++calls === 1) {
      const candidates = (input as { candidates: { url: string }[] }).candidates;
      assert.equal(candidates[0]!.url, item.sourceUrl);
      return { indexes: [0] };
    }
    return { message: 'Участие бесплатное [0].', found: true, sourceIndexes: [0] };
  }, '2026-09-23', signal, async url => { visited.push(url); return page(url); }, links);
  assert.deepEqual(visited, [item.sourceUrl]);
  assert.equal(answer.message, 'Участие бесплатное [1].');
  assert.equal(answer.webSources?.[0]?.url, item.sourceUrl); assert.equal(answer.webSources?.[0]?.kind, 'page');
  assert.equal(answer.webDisclaimer, WEB_DISCLAIMER); assert.deepEqual(answer.olympiads, []);
});
test('a university question without an olympiad reads the rules and may follow one link from them', async () => {
  const visited: string[] = [];
  let calls = 0;
  const question = { question: 'Какой минимальный балл для подтверждения олимпиады в МФТИ?', olympiadIds: [], universitySlugs: ['mipt'] };
  const answer = await researchOnWeb(question, data, async (_system, input) => {
    calls++;
    if (calls === 1) {
      assert.deepEqual((input as { universities: { name: string }[] }).universities.map(u => u.name), ['МФТИ']);
      return { indexes: [0] };
    }
    if (calls === 2) {
      const follow = (input as { links: { url: string }[] }).links;
      assert.equal(follow[0]!.url, 'https://pk.mipt.ru/docs/pravila.pdf');
      return { message: 'На странице ответа нет.', found: false, sourceIndexes: [0], follow: [0] };
    }
    assert.equal((input as { links?: unknown }).links, undefined); // only one extra step
    return { message: 'Минимальный балл — 75 [1].', found: true, sourceIndexes: [1] };
  }, '2026-09-23', signal, async url => {
    visited.push(url);
    return url.endsWith('.pdf') ? page(url, 'Минимальный балл ЕГЭ для подтверждения олимпиады — 75.', { kind: 'pdf', title: 'Правила приёма' })
      : page(url, 'Приёмная комиссия МФТИ. Документы и правила.', { links: [{ url: 'https://pk.mipt.ru/docs/pravila.pdf', title: 'Правила приёма 2026 (PDF)' }, { url: 'https://pk.mipt.ru/contacts', title: 'Контакты' }] });
  }, links);
  assert.deepEqual(visited, ['https://pk.mipt.ru/bachelor/2026_rules/', 'https://pk.mipt.ru/docs/pravila.pdf']);
  assert.equal(calls, 3);
  assert.equal(answer.message, 'Минимальный балл — 75 [1].');
  assert.deepEqual(answer.webSources?.map(s => [s.url, s.kind]), [['https://pk.mipt.ru/docs/pravila.pdf', 'pdf']]);
});
test('unreachable sites, empty choices and fabricated selection or citations are handled safely', async () => {
  const neverRead = async (): Promise<PublicPage> => { throw Error('offline'); };
  let calls = 0;
  const unreachable = await researchOnWeb(task, data, async () => { calls++; return { indexes: [0, 1] }; }, '2026-09-23', signal, neverRead, links);
  assert.equal(calls, 1); assert.match(unreachable.message, /Не получилось открыть/); assert.deepEqual(unreachable.webSources, []);
  const none = await researchOnWeb(task, data, async () => ({ indexes: [] }), '2026-09-23', signal, neverRead, links);
  assert.match(none.message, /нет подходящих/); assert(none.webDisclaimer);
  await assert.rejects(researchOnWeb(task, data, async () => ({ indexes: [99] }), '2026-09-23', signal, neverRead, links),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_INVALID_ANSWER');
  calls = 0;
  await assert.rejects(researchOnWeb(task, data, async () => ++calls === 1 ? { indexes: [0] }
    : { message: 'Выдумано', found: true, sourceIndexes: [8] }, '2026-09-23', signal, async url => page(url), links),
    (e: unknown) => e instanceof AssistantError && e.code === 'WEB_SEARCH_INVALID_ANSWER');
});
test('citation numbers always match the displayed source order', () => {
  assert.equal(numberSourceReferences('Правила [1], сайт [0].', [1, 0]), 'Правила [1], сайт [2].');
  assert.throws(() => numberSourceReferences('Источник [8].', [0]), AssistantError);
});
test('long documents keep the opening and the passages that mention the question', () => {
  const filler = 'Общие положения. '.repeat(2000);
  const text = `${filler}Особые права: победители олимпиад — без вступительных испытаний.${filler}`;
  const excerpt = researchExcerpt(text, 'Какие особые права у победителей олимпиад?');
  assert.ok(excerpt.length <= 12000); assert.match(excerpt, /Особые права: победители/);
  const followed = followableLinks([{ url: 'https://a.ru', title: 'A', kind: 'page', text: '', links: [
    { url: 'https://a.ru/news', title: 'Новости' }, { url: 'https://a.ru/olymp', title: 'Олимпиады и особые права' }] }], 'Какие льготы по олимпиадам?', new Set());
  assert.deepEqual(followed.map(l => l.url), ['https://a.ru/olymp']);
});
