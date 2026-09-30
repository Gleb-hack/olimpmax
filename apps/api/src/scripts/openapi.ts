// Writes openapi.yaml (OpenAPI 3.1) from the route schemas of the API: pnpm openapi. With --check it only compares
// the file with the routes and fails when they differ (part of pnpm test).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { buildApp } from '../app.js';
import type { Database } from '../db/client.js';

type Operation = { operationId?: string; summary?: string; description?: string; tags?: string[]; security?: unknown[]; responses?: Record<string, unknown> };
const file = fileURLToPath(new URL('../../../../openapi.yaml', import.meta.url));

// The database is never queried: routes are only registered to read their schemas.
const app = await buildApp({ db: {} as Database, jwtSecret: 'openapi'.repeat(8), botToken: 'openapi', openapi: true,
  testAccounts: new Map([['openapi', 'openapi-only']]) });
await app.ready();
const document = app.swagger() as unknown as { paths: Record<string, Record<string, Operation>> } & Record<string, unknown>;
await app.close();

const about: Record<string, [tag: string, summary: string, description?: string]> = {
  'get /health': ['Служебное', 'Проверка API и базы данных'],
  'get /auth/options': ['Вход', 'Доступные способы входа', 'max — вход через подписанные данные MAX, test — вход тестовой учётной записью.'],
  'post /auth/max': ['Вход', 'Вход через MAX', 'Принимает window.WebApp.initData, проверяет подпись токеном бота и выдаёт JWT на час.'],
  'post /auth/test': ['Вход', 'Вход тестовой учётной записью', 'Доступен, только если на сервере задан TEST_ACCOUNTS. Выдаёт JWT на час.'],
  'get /olympiads/filters': ['Каталог', 'Значения фильтров каталога'],
  'get /olympiads': ['Каталог', 'Поиск и фильтрация олимпиад'],
  'get /olympiads/{id}': ['Каталог', 'Карточка олимпиады'],
  'get /olympiads/{id}/programs': ['Поступление', 'Программы вузов, куда помогает поступить олимпиада'],
  'get /directions': ['Поступление', 'Направления подготовки'],
  'get /directions/{code}': ['Поступление', 'Направление подготовки: олимпиады и программы'],
  'get /universities': ['Поступление', 'Вузы с льготами'],
  'get /universities/{slug}': ['Поступление', 'Карточка вуза'],
  'get /series/{slug}': ['Каталог', 'Олимпиада по справочнику: уровни, этапы, льготы'],
  'get /calendar/{file}': ['План', 'Календарь плана в формате iCalendar', 'Открывается по секретной ссылке из POST /me/calendar-feed без входа.'],
  'get /me': ['Профиль', 'Профиль текущего пользователя'],
  'post /me/registration': ['Профиль', 'Завершить регистрацию', 'Один раз для аккаунта; повторный вызов возвращает 409.'],
  'patch /me/profile': ['Профиль', 'Изменить профиль и цель'],
  'delete /me': ['Профиль', 'Удалить аккаунт и все его данные'],
  'get /me/notifications': ['Напоминания', 'Настройки напоминаний бота'],
  'patch /me/notifications': ['Напоминания', 'Включить или выключить напоминания'],
  'get /me/plan': ['План', 'Личный план'],
  'get /me/plan/events': ['План', 'Ближайшие сроки из плана'],
  'put /me/plan/{id}': ['План', 'Добавить олимпиаду в план', 'Идемпотентно: повторный вызов тоже возвращает 204.'],
  'patch /me/plan/{id}': ['План', 'Заметка, статус, отслеживание и результаты'],
  'delete /me/plan/{id}': ['План', 'Убрать олимпиаду из плана'],
  'post /me/calendar-feed': ['План', 'Ссылка на календарь плана для подписки'],
  'post /assistant/chat': ['Ассистент', 'Вопрос ассистенту «Олимп»', 'Нужен DEEPSEEK_API_KEY на сервере, иначе 503.'],
  'post /assistant/web-search': ['Ассистент', 'Поиск на сайтах организаторов и вузов', 'Принимает токен из ответа /assistant/chat.'],
};
const missing: string[] = [];
for (const [path, methods] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    const key = `${method} ${path}`;
    const info = about[key];
    if (!info) { missing.push(key); continue; }
    const [tag, summary, description] = info;
    const secured = /^\/(me|assistant)(\/|$)/.test(path);
    // Human-readable fields first, so the file reads well.
    const operationId = method + path.split('/').filter(Boolean).map(part => part.replace(/[{}]/g, '').replace(/(^|[-_])(\w)/g, (_m, _s, c: string) => c.toUpperCase())).join('');
    methods[method] = { operationId, tags: [tag], summary, ...(description ? { description } : {}), security: secured ? [{ bearerAuth: [] }] : [], ...operation,
      ...(secured ? { responses: { ...operation.responses, 401: operation.responses?.[401] ?? { description: 'Нет действительного JWT' } } } : {}) };
  }
}
if (missing.length) throw new Error(`Нет описания для маршрутов: ${missing.join(', ')}`);

const ordered = {
  openapi: document.openapi,
  info: { title: 'Olimp API', version: '1.0.0',
    description: 'API мини-приложения «Олимп» в MAX: каталог олимпиад, льготы вузов, личный план и напоминания. '
      + 'Защищённые методы требуют заголовок Authorization: Bearer <accessToken> из POST /auth/max или POST /auth/test.' },
  servers: [
    { url: 'https://{domain}/api', description: 'Публичный сервер', variables: { domain: { default: 'olimp.example.ru', description: 'Домен из APP_DOMAIN' } } },
    { url: 'http://localhost:8080/api', description: 'Локальный запуск: docker compose up' },
  ],
  tags: [
    { name: 'Служебное', description: 'Состояние сервиса' },
    { name: 'Вход', description: 'Получение JWT: через MAX или тестовой учётной записью' },
    { name: 'Каталог', description: 'Олимпиады, фильтры, расписания и источники' },
    { name: 'Поступление', description: 'Вузы, льготы, направления и программы' },
    { name: 'Профиль', description: 'Регистрация и данные ученика' },
    { name: 'План', description: 'Личный план олимпиад и календарь' },
    { name: 'Напоминания', description: 'Сообщения бота MAX о сроках' },
    { name: 'Ассистент', description: 'Чат «Олимп» и поиск на сайтах' },
  ],
  paths: document.paths,
  components: { ...(document.components as object), securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
};
const text = '# Generated by `pnpm openapi` from the route schemas in apps/api/src/app.ts. Do not edit by hand.\n'
  + stringify(ordered, { lineWidth: 0, aliasDuplicateObjects: false });
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(file, 'utf8'); } catch { /* Missing file is reported below. */ }
  if (current !== text) { console.error('openapi.yaml устарел: выполните pnpm openapi'); process.exit(1); }
  console.log('openapi.yaml соответствует маршрутам API');
} else {
  writeFileSync(file, text);
  console.log(`openapi.yaml: ${Object.keys(document.paths).length} путей`);
}
