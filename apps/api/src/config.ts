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
  DEEPSEEK_MODEL: z.string().trim().min(1).max(100).default('deepseek-flash'),
  TEST_ACCOUNTS: z.string().trim().optional(),
});
/**
 * Test accounts for reviewers who cannot open the app inside MAX: `login:password` pairs separated by commas.
 * Empty — the sign-in by password is switched off and POST /auth/test is not registered.
 */
export function parseTestAccounts(value: string | undefined) {
  const accounts = new Map<string, string>();
  for (const entry of (value ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
    const at = entry.indexOf(':');
    const login = entry.slice(0, at).trim().toLowerCase(), password = entry.slice(at + 1);
    if (at < 1 || !/^[a-z0-9_.-]{3,32}$/.test(login)) throw new Error('TEST_ACCOUNTS: логин из 3–32 латинских букв, цифр, «_», «.», «-» в формате login:password');
    if (password.length < 8 || password.length > 200) throw new Error(`TEST_ACCOUNTS: пароль для ${login} должен быть от 8 до 200 символов`);
    if (accounts.has(login)) throw new Error(`TEST_ACCOUNTS: логин ${login} указан дважды`);
    accounts.set(login, password);
  }
  return accounts;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Environment.parse(env);
  if (e.ALLOW_DEV_AUTH === 'true' && (e.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(e.HOST))) {
    throw new Error('Dev auth разрешён только в локальной разработке на loopback-адресе');
  }
  const testAccounts = parseTestAccounts(e.TEST_ACCOUNTS);
  if (e.NODE_ENV === 'production' && !e.MAX_BOT_TOKEN && testAccounts.size === 0) throw new Error('Для production нужен MAX_BOT_TOKEN или TEST_ACCOUNTS');
  return { databaseUrl: e.DATABASE_URL, host: e.HOST, port: e.PORT, jwtSecret: e.JWT_SECRET,
    botToken: e.MAX_BOT_TOKEN, allowDevAuth: e.ALLOW_DEV_AUTH === 'true', corsOrigin: e.CORS_ORIGIN, trustProxyHops: e.TRUST_PROXY_HOPS,
    deepseekApiKey: e.DEEPSEEK_API_KEY, deepseekModel: e.DEEPSEEK_MODEL, testAccounts };
}
