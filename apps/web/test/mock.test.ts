import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as c from '@olimp/contracts';
import { mockRequest } from '../src/lib/mock.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} });

test('demo records satisfy the real API contracts without inventing deadlines', async () => {
  const catalog = c.CatalogResponse.parse(await mockRequest('/olympiads?pageSize=100'));
  assert.equal(catalog.total, 6);
  for (const item of catalog.items) {
    assert.equal(item.nextEvent, null);
    assert.ok(item.sourceUrl.startsWith('https://olimpiada.ru/'));
    const detail = c.OlympiadDetail.parse(await mockRequest(`/olympiads/${item.id}`));
    assert.equal(detail.id, item.id);
    assert.ok(detail.stages.every(stage => stage.beginsOn === null && stage.endsOn === null));
  }
  const filters = c.FiltersResponse.parse(await mockRequest('/olympiads/filters'));
  assert.equal(filters.formats.reduce((sum, item) => sum + item.count, 0), catalog.total);
});

test('combined demo filters, pagination and empty results keep API semantics', async () => {
  const filters = c.FiltersResponse.parse(await mockRequest('/olympiads/filters'));
  const math = filters.subjects.find(item => item.name === 'Математика')!;
  const page = c.CatalogResponse.parse(await mockRequest(`/olympiads?subjectIds=${math.id}&grades=9&formats=hybrid&pageSize=1&page=2`));
  assert.equal(page.items.length, 1);
  assert.ok(page.total >= 2);
  assert.equal(page.items[0]!.format, 'hybrid');
  assert.ok(page.items[0]!.subjects.some(subject => subject.id === math.id));
  assert.equal(c.CatalogResponse.parse(await mockRequest('/olympiads?q=небывалаяолимпиада')).total, 0);
  await assert.rejects(() => mockRequest('/olympiads?grades=12'));
});

test('demo plan preserves notes on repeat save, supports pause and idempotent removal', async () => {
  storage.clear();
  const catalog = c.CatalogResponse.parse(await mockRequest('/olympiads'));
  const id = catalog.items[0]!.id;
  await mockRequest(`/me/plan/${id}`, { method: 'PUT' });
  await mockRequest(`/me/plan/${id}`, { method: 'PATCH', body: JSON.stringify({ tracking: false, note: 'Моя заметка' }) });
  await mockRequest(`/me/plan/${id}`, { method: 'PUT' });
  const plan = c.PlanResponse.parse(await mockRequest('/me/plan'));
  assert.equal(plan.total, 1);
  assert.equal(plan.items[0]!.note, 'Моя заметка');
  assert.equal(plan.items[0]!.tracking, false);
  assert.deepEqual(c.PlanEventsResponse.parse(await mockRequest('/me/plan/events')).items, []);
  await mockRequest(`/me/plan/${id}`, { method: 'DELETE' });
  await mockRequest(`/me/plan/${id}`, { method: 'DELETE' });
  assert.equal(c.PlanResponse.parse(await mockRequest('/me/plan')).total, 0);
});

test('corrupt demo storage can recover and unknown records fail explicitly', async () => {
  storage.set('olimp.demo.plan.v1', '{invalid');
  assert.equal(c.PlanResponse.parse(await mockRequest('/me/plan')).total, 0);
  await assert.rejects(() => mockRequest('/olympiads/999999999'), /не найдена/);
});

test('deleting the demo account removes its profile and plan from the browser', async () => {
  await mockRequest('/me/registration', { method: 'POST', body: JSON.stringify({ name: 'Анна', grade: 9, region: '', subjects: [], online: true, onsite: true }) }).catch(() => undefined);
  const { items: [first] } = c.CatalogResponse.parse(await mockRequest('/olympiads?pageSize=1'));
  await mockRequest(`/me/plan/${first!.id}`, { method: 'PUT' });
  assert.ok(c.UserProfile.parse(await mockRequest('/me')).registeredAt);
  assert.equal(await mockRequest('/me', { method: 'DELETE' }), undefined);
  assert.equal(c.UserProfile.parse(await mockRequest('/me')).registeredAt, null);
  assert.equal(c.PlanResponse.parse(await mockRequest('/me/plan')).total, 0);
  assert.equal([...storage.keys()].filter(key => key.startsWith('olimp.demo.')).length, 0);
});
