import { z } from 'zod';
import * as c from '@olimp/contracts';
import detailsData from './mock-details.json';
import filtersData from './mock-filters.json';

// Six records from the 2026-09-24 CSV, captured through the API on 2026-09-25. Never an API-error fallback.
const details = z.array(c.OlympiadDetail).parse(detailsData);
const cards = details.map(item => c.OlympiadCard.parse(item));
const filters = c.FiltersResponse.parse(filtersData);
const key = 'olimp.demo.plan.v1';
const profileKey = 'olimp.demo.profile.v2';
function readProfile() {
  try { return c.UserProfile.parse(JSON.parse(localStorage.getItem(profileKey) ?? 'null')); }
  catch { return c.UserProfile.parse({ id: '00000000-0000-4000-8000-000000000001', maxUserId: 'demo', name: 'Ученик',
    grade: null, region: '', subjects: [], online: true, onsite: true, registeredAt: null, createdAt: new Date().toISOString() }); }
}
const readPlan = () => {
  try { return c.PlanResponse.parse(JSON.parse(localStorage.getItem(key) ?? 'null')).items; }
  catch { return []; }
};
const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function mockRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = new URL(path, 'http://demo.local');
  if (url.pathname === '/me' && options.method === 'DELETE') {
    try { localStorage.removeItem(profileKey); localStorage.removeItem(key); }
    catch { throw new Error('Не удалось удалить демонстрационные данные из браузера.'); }
    return undefined;
  }
  if (url.pathname === '/me') return readProfile();
  if (url.pathname === '/me/registration' || url.pathname === '/me/profile') {
    const current = readProfile();
    const registering = url.pathname === '/me/registration';
    if (registering && current.registeredAt) throw new Error('Профиль уже существует. Перейдите на вкладку «Вход».');
    if (!registering && !current.registeredAt) throw new Error('Сначала завершите регистрацию.');
    const patch = (registering ? c.ProfilePreferences : c.ProfilePatch).parse(JSON.parse(String(options.body)));
    if (patch.subjects?.some(id => !filters.subjects.some(subject => subject.id === id))) throw new Error('Неизвестный предмет.');
    const next = c.UserProfile.parse({ ...current, ...patch, registeredAt: current.registeredAt ?? new Date().toISOString() });
    try { localStorage.setItem(profileKey, JSON.stringify(next)); }
    catch { throw new Error('Не удалось сохранить демонстрационный профиль в браузере.'); }
    return next;
  }
  if (url.pathname === '/olympiads/filters') return {
    ...filters,
    subjects: filters.subjects.map(subject => ({ ...subject, count: cards.filter(card => card.subjects.some(value => value.id === subject.id)).length })),
    grades: filters.grades.map(grade => ({ ...grade, count: cards.filter(card => card.gradeFrom !== null && card.gradeTo !== null && card.gradeFrom <= grade.value && card.gradeTo >= grade.value).length })),
    formats: filters.formats.map(format => ({ ...format, count: cards.filter(card => card.format === format.value).length })),
    participation: filters.participation.map(participation => ({ ...participation, count: cards.filter(card => card.participation === participation.value).length })),
    scheduleStatuses: filters.scheduleStatuses.map(status => ({ ...status, count: cards.filter(card => card.scheduleStatus === status.value).length })),
  };
  if (url.pathname === '/olympiads') {
    const raw = Object.fromEntries(url.searchParams);
    const query = c.CatalogQuery.parse(raw);
    const words = query.q ? normalize(query.q).split(' ').filter(Boolean) : [];
    const items = cards.filter(item => {
      const detail = details.find(detail => detail.id === item.id)!;
      const searchable = normalize([item.title, item.description, ...item.subjects.map(s => s.name), ...detail.organizers].join(' '));
      return words.every(word => searchable.includes(word))
        && (!query.subjectIds || item.subjects.some(s => query.subjectIds!.includes(s.id)))
        && (!query.grades || query.grades.some(grade => item.gradeFrom !== null && item.gradeTo !== null && item.gradeFrom <= grade && grade <= item.gradeTo))
        && (!query.formats || query.formats.includes(item.format))
        && (!query.participation || query.participation.includes(item.participation))
        && (!query.scheduleStatus || query.scheduleStatus === item.scheduleStatus);
    }).sort((a, b) => (query.sort === 'name' ? a.title.localeCompare(b.title, 'ru') : (b.rating ?? -Infinity) - (a.rating ?? -Infinity)) || a.id - b.id);
    return { items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize };
  }
  if (url.pathname.startsWith('/olympiads/')) {
    const item = details.find(value => value.id === Number(url.pathname.split('/').pop()));
    if (!item) throw new Error('Олимпиада не найдена в демоверсии.');
    return item;
  }
  if (url.pathname === '/me/plan/events') {
    // The fixture contains no verified dates. Do not manufacture demonstration deadlines.
    const from = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
    const end = new Date(`${from}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 89);
    return { from, through: end.toISOString().slice(0, 10), items: [] };
  }
  const plan = readPlan();
  if (url.pathname === '/me/plan') return { items: plan, total: plan.length };
  const id = Number(url.pathname.split('/').pop());
  const item = details.find(value => value.id === id);
  if (!item || !url.pathname.startsWith('/me/plan/')) throw new Error('Запись не найдена.');
  let next = plan;
  if (options.method === 'PUT' && !plan.some(entry => entry.olympiad.id === id)) next = [...plan, { olympiad: c.OlympiadCard.parse(item), tracking: true, note: null, savedAt: new Date().toISOString(), stages: item.stages, calendarRaw: item.calendarRaw }];
  if (options.method === 'DELETE') next = plan.filter(entry => entry.olympiad.id !== id);
  if (options.method === 'PATCH') {
    if (!plan.some(entry => entry.olympiad.id === id)) throw new Error('Олимпиада больше не сохранена.');
    const patch = c.PlanPatch.parse(JSON.parse(String(options.body)));
    next = plan.map(entry => entry.olympiad.id === id ? { ...entry, ...patch } : entry);
  }
  try { localStorage.setItem(key, JSON.stringify(c.PlanResponse.parse({ items: next, total: next.length }))); }
  catch { throw new Error('Не удалось сохранить демонстрационный план в браузере.'); }
  return undefined;
}
