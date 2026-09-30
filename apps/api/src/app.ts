import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import ipaddr from 'ipaddr.js';
import { eq, sql } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { users, planItems, olympiads } from './db/schema.js';
import * as c from '../../../packages/contracts/src/index.js';
import { goalOf } from './features/goal-match.js';
import { catalog, detail, filters } from './features/catalog.js';
import { seriesDetail, universityDetail, universityList } from './features/reference.js';
import { directionDetail, directionList, olympiadPrograms } from './features/directions.js';
import { readPlan, planEvents, planKey, patchPlanItem } from './features/plan.js';
import { calendarFeed, calendarFeedLink } from './features/calendar-feed.js';
import { validateMaxInitData, checkTestAccount } from './features/auth.js';
import { readProfile, saveProfile, deleteAccount, ProfileError } from './features/profile.js';
import { moscowToday } from './features/calendar.js';
import { answerAssistant, databaseAssistantData } from './features/assistant/assistant.js';
import { AssistantError, deepseekCompletion, type CompleteJson } from './features/assistant/deepseek.js';
import { webResearchTickets, WebTaskError } from './features/assistant/web-task.js';
import { researchOnWeb } from './features/assistant/web-research.js';
import type { ReadPublicPage } from './features/assistant/public-page.js';
import type { LinkEntry } from './features/assistant/knowledge.js';
import { maxMessenger, type Messenger } from './features/reminders/max.js';
import { NotificationError, readNotificationSettings, setNotificationsEnabled } from './features/reminders/delivery.js';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string }; user: { sub: string } }
}
type AppOptions = {
  db: Database; jwtSecret: string; botToken?: string; allowDevAuth?: boolean;
  corsOrigin?: string; trustProxyHops?: number; logger?: boolean; now?: () => Date;
  deepseekApiKey?: string; deepseekModel?: string; assistantCompletion?: CompleteJson;
  /** Reviewer accounts (login → password) for signing in outside MAX; empty or absent switches POST /auth/test off. */
  testAccounts?: Map<string, string>;
  /** Collect route schemas for the OpenAPI description (pnpm openapi); the running API does not need it. */
  openapi?: boolean;
  /** Test seams: page reader and the list of links Olimp may open (default: data/assistant/*.csv). */
  readPublicPage?: ReadPublicPage; researchLinks?: LinkEntry[];
  /** MAX bot client (bot name and link for the notification settings); default: built from botToken. Tests pass a fake. */
  messenger?: Messenger | null;
};
export async function buildApp(options: AppOptions) {
  const { db } = options;
  // The API has no public port in production; Caddy connects over the private Docker network.
  const trustProxy = options.trustProxyHops === 1 ? (address: string, hop: number) => {
    if (hop !== 0) return false;
    try { return ['private', 'uniqueLocal', 'loopback'].includes(ipaddr.process(address).range()); }
    catch { return false; }
  } : false;
  const app = Fastify({ trustProxy, logger: options.logger ? { redact: ['req.headers.authorization', 'req.body.initData'] } : false, bodyLimit: 32768 });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  if (options.openapi) {
    const { default: swagger } = await import('@fastify/swagger');
    await app.register(swagger, { openapi: { openapi: '3.1.0', info: { title: 'Olimp API', version: '1.0.0' } }, transform: jsonSchemaTransform });
  }
  await app.register(cors, { origin: options.corsOrigin ?? 'http://localhost:5173', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(jwt, { secret: options.jwtSecret, sign: { expiresIn: '1h', iss: 'olimp-api', aud: 'olimp-mini-app' },
    verify: { allowedIss: 'olimp-api', allowedAud: 'olimp-mini-app', algorithms: ['HS256'] } });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ProfileError || error instanceof NotificationError) return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    reply.status(status).send({ error: status >= 500 ? 'INTERNAL_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
      message: status >= 500 ? 'Внутренняя ошибка сервера' : status === 401 ? 'Требуется вход в MAX' : status === 429 ? 'Слишком много запросов' : 'Проверьте параметры запроса' });
  });
  const api = app.withTypeProvider<ZodTypeProvider>();
  const now = () => options.now?.() ?? new Date();
  const today = () => moscowToday(now());
  const complete = options.assistantCompletion ?? deepseekCompletion(options.deepseekApiKey, options.deepseekModel);
  const activeChats = new Set<string>();
  const tickets = webResearchTickets(options.jwtSecret, () => now().getTime());
  const messenger = options.messenger !== undefined ? options.messenger : options.botToken ? maxMessenger(options.botToken) : null;
  api.get('/health', { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } }, async () => {
    await db.execute(sql`select 1`); return { status: 'ok' as const };
  });
  const issueToken = async (identity: { maxUserId: string; displayName: string }) => {
    const [user] = await db.insert(users).values(identity).onConflictDoUpdate({ target: users.maxUserId, set: { displayName: identity.displayName } }).returning({ id: users.id });
    return { accessToken: app.jwt.sign({ sub: user!.id }), expiresIn: 3600 as const, user: await readProfile(db, user!.id) };
  };
  api.post('/auth/max', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { body: c.AuthBody, response: { 200: c.AuthResponse, 401: c.ErrorResponse, 503: c.ErrorResponse } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!options.botToken) return reply.code(503).send({ error: 'AUTH_NOT_CONFIGURED', message: 'Вход через MAX пока не подключён. Попробуйте позже.' });
    let identity;
    try { identity = validateMaxInitData(request.body.initData, options.botToken, now().getTime()); }
    catch { return reply.code(401).send({ error: 'INVALID_INIT_DATA', message: 'Недействительные или устаревшие данные MAX' }); }
    return issueToken(identity);
  });
  const testAccounts = options.testAccounts ?? new Map<string, string>();
  api.get('/auth/options', { schema: { response: { 200: c.AuthOptions } } }, () => ({ max: Boolean(options.botToken), test: testAccounts.size > 0 }));
  if (testAccounts.size > 0) api.post('/auth/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { body: c.TestAuthBody, response: { 200: c.AuthResponse, 401: c.ErrorResponse } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const login = checkTestAccount(testAccounts, request.body.login, request.body.password);
    if (!login) return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль тестового аккаунта' });
    // A prefix that no MAX ID can have: test accounts never receive bot messages and never meet real users.
    return issueToken({ maxUserId: `test:${login}`, displayName: `Тестовый ученик ${login}` });
  });
  if (options.allowDevAuth) api.post('/auth/dev', { schema: { body: z.object({}).strict().nullish(), response: { 200: c.AuthResponse } } }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return issueToken({ maxUserId: 'local-demo', displayName: 'Локальный пользователь' });
  });
  api.get('/olympiads/filters', { schema: { response: { 200: c.FiltersResponse } } }, () => filters(db));
  api.get('/olympiads', { schema: { querystring: c.CatalogQuery, response: { 200: c.CatalogResponse } } }, request => catalog(db, request.query, today()));
  api.get('/olympiads/:id', { schema: { params: c.OlympiadParams, querystring: c.OlympiadGoalQuery, response: { 200: c.OlympiadDetail, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await detail(db, request.params.id, today(), goalOf(request.query));
    if (!result) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не найдена' });
    return result;
  });
  api.get('/olympiads/:id/programs', { schema: { params: c.OlympiadParams, querystring: c.OlympiadProgramsQuery,
    response: { 200: c.OlympiadProgramsResponse, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await olympiadPrograms(db, request.params.id, request.query);
    if (!result) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не найдена' });
    return result;
  });
  api.get('/directions', { schema: { querystring: c.DirectionListQuery, response: { 200: c.DirectionListResponse } } }, request => directionList(db, request.query));
  api.get('/directions/:code', { schema: { params: c.DirectionParams, response: { 200: c.DirectionResponse, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await directionDetail(db, request.params.code);
    if (!result) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Направление не найдено' });
    return result;
  });
  api.get('/universities', { schema: { querystring: c.UniversityListQuery, response: { 200: c.UniversityListResponse } } }, request => universityList(db, request.query));
  api.get('/universities/:slug', { schema: { params: c.SlugParams, response: { 200: c.UniversityResponse, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await universityDetail(db, request.params.slug);
    if (!result) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Вуз не найден' });
    return result;
  });
  // Read by calendar apps without a sign-in: the random token in the link is the only key. Unknown or reset links get 404.
  api.get('/calendar/:file', { schema: { params: c.CalendarFeedParams } }, async (request, reply) => {
    const body = await calendarFeed(db, request.params.file.slice(0, -'.ics'.length), today(), now());
    if (body === null) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Календарь не найден: ссылка устарела или была сброшена' });
    return reply.header('Content-Type', 'text/calendar; charset=utf-8').header('Content-Disposition', 'attachment; filename="olimp-plan.ics"')
      .header('Cache-Control', 'private, max-age=900').send(body);
  });
  api.get('/series/:slug', { schema: { params: c.SlugParams, response: { 200: c.SeriesResponse, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await seriesDetail(db, request.params.slug);
    if (!result) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не найдена' });
    return result;
  });
  await api.register(async secured => {
    secured.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
        if (!z.uuid().safeParse(request.user.sub).success) throw new Error('Invalid subject');
        const found = await db.select({ id: users.id }).from(users).where(eq(users.id, request.user.sub));
        if (!found.length) throw new Error('Unknown user');
      } catch { return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Требуется вход в MAX' }); }
    });
    const routes = secured.withTypeProvider<ZodTypeProvider>();
    secured.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
    routes.get('/me', { schema: { response: { 200: c.UserProfile } } }, request => readProfile(db, request.user.sub));
    routes.post('/me/registration', { schema: { body: c.ProfilePreferences, response: { 200: c.UserProfile, 400: c.ErrorResponse, 409: c.ErrorResponse } } }, request =>
      saveProfile(db, request.user.sub, request.body, true, now()));
    routes.patch('/me/profile', { bodyLimit: 1500000, schema: { body: c.ProfilePatch, response: { 200: c.UserProfile, 400: c.ErrorResponse, 409: c.ErrorResponse } } }, request =>
      saveProfile(db, request.user.sub, request.body, false, now()));
    routes.delete('/me', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
      await deleteAccount(db, request.user.sub);
      return reply.code(204).send();
    });
    routes.post('/assistant/chat', {
      bodyLimit: 65536,
      config: { rateLimit: { max: 10, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: request => request.user.sub } },
      schema: { body: c.AssistantRequest, response: { 200: c.AssistantResponse, 401: c.ErrorResponse,
        429: c.ErrorResponse, 502: c.ErrorResponse, 503: c.ErrorResponse, 504: c.ErrorResponse } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user.sub;
      if (activeChats.has(userId) || activeChats.size >= 8) return reply.code(429).send({ error: 'ASSISTANT_BUSY', message: 'Олимп уже готовит ответ. Попробуйте чуть позже.' });
      activeChats.add(userId);
      const controller = new AbortController();
      const onClose = () => { if (!reply.raw.writableEnded) controller.abort(); };
      reply.raw.on('close', onClose);
      try {
        const { research, ...answer } = await answerAssistant(request.body, databaseAssistantData(db, userId, today()), complete,
          today(), AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]));
        return { ...answer, ...(research ? { webSearch: { token: tickets.issue(userId, research.task),
          question: research.task.question, olympiadIds: research.task.olympiadIds } } : {}) };
      } catch (error) {
        if (error instanceof AssistantError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { activeChats.delete(userId); reply.raw.off('close', onClose); }
    });
    // Runs automatically after a chat answer that found nothing in the database: at most one per chat question.
    routes.post('/assistant/web-search', {
      config: { rateLimit: { max: 6, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: request => request.user.sub } },
      schema: { body: c.AssistantWebRequest, response: { 200: c.AssistantResponse, 400: c.ErrorResponse, 401: c.ErrorResponse,
        429: c.ErrorResponse, 502: c.ErrorResponse, 503: c.ErrorResponse, 504: c.ErrorResponse } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user.sub;
      let task;
      try { task = tickets.verify(userId, request.body.token); }
      catch (error) {
        if (error instanceof WebTaskError) return reply.code(400).send({ error: 'WEB_SEARCH_EXPIRED', message: error.message });
        throw error;
      }
      if (activeChats.has(userId) || activeChats.size >= 8) return reply.code(429).send({ error: 'ASSISTANT_BUSY', message: 'Олимп уже готовит ответ. Попробуйте чуть позже.' });
      activeChats.add(userId);
      const controller = new AbortController();
      const onClose = () => { if (!reply.raw.writableEnded) controller.abort(); };
      reply.raw.on('close', onClose);
      try {
        return await researchOnWeb(task, databaseAssistantData(db, userId, today()), complete,
          today(), AbortSignal.any([controller.signal, AbortSignal.timeout(100000)]), options.readPublicPage, options.researchLinks);
      } catch (error) {
        if (error instanceof AssistantError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { activeChats.delete(userId); reply.raw.off('close', onClose); }
    });
    routes.get('/me/notifications', { schema: { response: { 200: c.NotificationSettings } } }, request =>
      readNotificationSettings(db, request.user.sub, messenger));
    routes.patch('/me/notifications', { schema: { body: c.NotificationSettingsPatch, response: { 200: c.NotificationSettings } } }, async request => {
      await setNotificationsEnabled(db, request.user.sub, request.body.enabled, now());
      return readNotificationSettings(db, request.user.sub, messenger);
    });
    routes.get('/me/plan', { schema: { response: { 200: c.PlanResponse } } }, request => readPlan(db, request.user.sub, today()));
    routes.post('/me/calendar-feed', { schema: { body: c.CalendarFeedRequest.nullish(), response: { 200: c.CalendarFeedResponse } } }, request =>
      calendarFeedLink(db, request.user.sub, request.body?.reset === true));
    routes.get('/me/plan/events', { schema: { querystring: c.PlanEventsQuery, response: { 200: c.PlanEventsResponse } } }, request => planEvents(db, request.user.sub, request.query.days, today()));
    routes.put('/me/plan/:id', { schema: { params: c.OlympiadParams, body: z.object({}).strict().nullish() } }, async (request, reply) => {
      const id = request.params.id;
      const found = await db.select({ id: olympiads.id }).from(olympiads).where(eq(olympiads.id, id));
      if (!found.length) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не найдена' });
      await db.insert(planItems).values({ userId: request.user.sub, olympiadId: id }).onConflictDoNothing();
      return reply.code(204).send();
    });
    routes.patch('/me/plan/:id', { schema: { params: c.OlympiadParams, body: c.PlanPatch } }, async (request, reply) => {
      if (!await patchPlanItem(db, request.user.sub, request.params.id, request.body)) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не добавлена в план' });
      return reply.code(204).send();
    });
    routes.delete('/me/plan/:id', { schema: { params: c.OlympiadParams } }, async (request, reply) => {
      await db.delete(planItems).where(planKey(request.user.sub, request.params.id));
      return reply.code(204).send();
    });
  });
  return app;
}
