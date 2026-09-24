import { z } from 'zod';
const Environment = z.object({
  DATABASE_URL: z.url().refine(v => /^postgres(?:ql)?:\/\//.test(v)),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
  JWT_SECRET: z.string().min(32).refine(v => !v.includes('replace-this'), 'Создайте собственный JWT_SECRET'),
  MAX_BOT_TOKEN: z.string().optional(), ALLOW_DEV_AUTH: z.enum(['true', 'false']).default('false'),
  DEEPSEEK_API_KEY: z.string().trim().optional(),
  SERPER_API_KEY: z.string().trim().optional(),
  DEEPSEEK_MODEL: z.string().trim().min(1).max(100).default('deepseek-flash'),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Environment.parse(env);
  if (e.ALLOW_DEV_AUTH === 'true' && (e.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(e.HOST))) {
    throw new Error('Dev auth разрешён только в локальной разработке на loopback-адресе');
  }
  if (e.NODE_ENV === 'production' && !e.MAX_BOT_TOKEN) throw new Error('Для production нужен MAX_BOT_TOKEN');
  return { databaseUrl: e.DATABASE_URL, host: e.HOST, port: e.PORT, jwtSecret: e.JWT_SECRET,
    botToken: e.MAX_BOT_TOKEN, allowDevAuth: e.ALLOW_DEV_AUTH === 'true', corsOrigin: e.CORS_ORIGIN, trustProxyHops: e.TRUST_PROXY_HOPS,
    deepseekApiKey: e.DEEPSEEK_API_KEY, deepseekModel: e.DEEPSEEK_MODEL, serperApiKey: e.SERPER_API_KEY };
}
