import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import ipaddr from 'ipaddr.js';
import { eq, sql } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { users, planItems, olympiads } from './db/schema.js';
import * as c from '../../../packages/contracts/src/index.js';
import { catalog, detail, filters } from './features/catalog.js';
import { readPlan, planEvents, planKey } from './features/plan.js';
import { validateMaxInitData } from './features/auth.js';
import { readProfile, saveProfile, ProfileError } from './features/profile.js';
import { moscowToday } from './features/calendar.js';
import { answerAssistant, databaseAssistantData } from './features/assistant/assistant.js';
import { AssistantError, deepseekCompletion, type CompleteJson } from './features/assistant/deepseek.js';
import { webConsent, WebConsentError } from './features/assistant/web-consent.js';
import { researchOlympiad } from './features/assistant/web-research.js';
import type { ReadPublicPage } from './features/assistant/public-page.js';
import { serperSearch, type SearchWeb } from './features/assistant/serper.js';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string }; user: { sub: string } }
}
type AppOptions = {
  db: Database; jwtSecret: string; botToken?: string; allowDevAuth?: boolean;
  corsOrigin?: string; trustProxyHops?: number; logger?: boolean; now?: () => Date;
  deepseekApiKey?: string; deepseekModel?: string; assistantCompletion?: CompleteJson;
  readPublicPage?: ReadPublicPage;
  serperApiKey?: string; searchWeb?: SearchWeb;
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
  await app.register(cors, { origin: options.corsOrigin ?? 'http://localhost:5173', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(jwt, { secret: options.jwtSecret, sign: { expiresIn: '1h', iss: 'olimp-api', aud: 'olimp-mini-app' },
    verify: { allowedIss: 'olimp-api', allowedAud: 'olimp-mini-app', algorithms: ['HS256'] } });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ProfileError) return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    reply.status(status).send({ error: status >= 500 ? 'INTERNAL_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST',
      message: status >= 500 ? 'Внутренняя ошибка сервера' : status === 401 ? 'Требуется вход в MAX' : status === 429 ? 'Слишком много запросов' : 'Проверьте параметры запроса' });
  });
  const api = app.withTypeProvider<ZodTypeProvider>();
  const now = () => options.now?.() ?? new Date();
  const today = () => moscowToday(now());
  const complete = options.assistantCompletion ?? deepseekCompletion(options.deepseekApiKey, options.deepseekModel);
  const search = options.searchWeb ?? serperSearch(options.serperApiKey);
  const activeChats = new Set<string>();
  const consent = webConsent(options.jwtSecret, () => now().getTime());
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
  if (options.allowDevAuth) api.post('/auth/dev', { schema: { body: z.object({}).strict().nullish(), response: { 200: c.AuthResponse } } }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return issueToken({ maxUserId: 'local-demo', displayName: 'Локальный пользователь' });
  });
  api.get('/olympiads/filters', { schema: { response: { 200: c.FiltersResponse } } }, () => filters(db));
  api.get('/olympiads', { schema: { querystring: c.CatalogQuery, response: { 200: c.CatalogResponse } } }, request => catalog(db, request.query, today()));
  api.get('/olympiads/:id', { schema: { params: c.OlympiadParams, response: { 200: c.OlympiadDetail, 404: c.ErrorResponse } } }, async (request, reply) => {
    const result = await detail(db, request.params.id, today());
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
    routes.patch('/me/profile', { schema: { body: c.ProfilePatch, response: { 200: c.UserProfile, 400: c.ErrorResponse, 409: c.ErrorResponse } } }, request =>
      saveProfile(db, request.user.sub, request.body, false, now()));
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
        return { ...answer, ...(research ? { webSearchOffer: { token: consent.issue(userId, research.task),
          question: research.task.question, olympiads: research.olympiads } } : {}) };
      } catch (error) {
        if (error instanceof AssistantError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { activeChats.delete(userId); reply.raw.off('close', onClose); }
    });
    routes.post('/assistant/web-search', {
      config: { rateLimit: { max: 3, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: request => request.user.sub } },
      schema: { body: c.AssistantWebRequest, response: { 200: c.AssistantResponse, 400: c.ErrorResponse, 401: c.ErrorResponse,
        429: c.ErrorResponse, 502: c.ErrorResponse, 503: c.ErrorResponse, 504: c.ErrorResponse } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user.sub;
      let task;
      try { task = consent.verify(userId, request.body.token); }
      catch (error) {
        if (error instanceof WebConsentError) return reply.code(400).send({ error: 'WEB_CONSENT_INVALID', message: error.message });
        throw error;
      }
      if (activeChats.has(userId) || activeChats.size >= 8) return reply.code(429).send({ error: 'ASSISTANT_BUSY', message: 'Олимп уже готовит ответ. Попробуйте чуть позже.' });
      activeChats.add(userId);
      const controller = new AbortController();
      const onClose = () => { if (!reply.raw.writableEnded) controller.abort(); };
      reply.raw.on('close', onClose);
      try {
        return await researchOlympiad(task, databaseAssistantData(db, userId, today()), complete,
          today(), AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]), search, options.readPublicPage);
      } catch (error) {
        if (error instanceof AssistantError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { activeChats.delete(userId); reply.raw.off('close', onClose); }
    });
    routes.get('/me/plan', { schema: { response: { 200: c.PlanResponse } } }, request => readPlan(db, request.user.sub, today()));
    routes.get('/me/plan/events', { schema: { querystring: c.PlanEventsQuery, response: { 200: c.PlanEventsResponse } } }, request => planEvents(db, request.user.sub, request.query.days, today()));
    routes.put('/me/plan/:id', { schema: { params: c.OlympiadParams, body: z.object({}).strict().nullish() } }, async (request, reply) => {
      const id = request.params.id;
      const found = await db.select({ id: olympiads.id }).from(olympiads).where(eq(olympiads.id, id));
      if (!found.length) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не найдена' });
      await db.insert(planItems).values({ userId: request.user.sub, olympiadId: id }).onConflictDoNothing();
      return reply.code(204).send();
    });
    routes.patch('/me/plan/:id', { schema: { params: c.OlympiadParams, body: c.PlanPatch } }, async (request, reply) => {
      const changed = await db.update(planItems).set(request.body).where(planKey(request.user.sub, request.params.id)).returning({ id: planItems.olympiadId });
      if (!changed.length) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Олимпиада не добавлена в план' });
      return reply.code(204).send();
    });
    routes.delete('/me/plan/:id', { schema: { params: c.OlympiadParams } }, async (request, reply) => {
      await db.delete(planItems).where(planKey(request.user.sub, request.params.id));
      return reply.code(204).send();
    });
  });
  return app;
}
