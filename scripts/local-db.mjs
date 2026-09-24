import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = join(root, '.local');
const data = join(local, 'postgres');
const candidates = [process.env.PG_BIN, '/opt/homebrew/opt/postgresql@16/bin', '/usr/local/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin'].filter(Boolean);
const bin = candidates.find(p => existsSync(join(p, 'pg_ctl')));
if (!bin) throw new Error('PostgreSQL 16 не найден. Укажите PG_BIN или используйте docker compose up -d.');
const command = process.argv[2] ?? 'start';
if (!['start', 'stop', 'status'].includes(command)) throw new Error('Использование: pnpm db:local [start|stop|status]');
function run(name, args, capture = false, env = process.env) {
  const result = spawnSync(join(bin, name), args, { stdio: capture ? 'pipe' : 'inherit', env, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
if (command !== 'start') {
  const result = run('pg_ctl', ['-D', data, ...(command === 'stop' ? ['-m', 'fast'] : []), command]);
  process.exit(result.status ?? 1);
}
const password = process.env.POSTGRES_PASSWORD;
if (!password) throw new Error('Укажите POSTGRES_PASSWORD в .env');
const expectedUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://olimp@127.0.0.1:55432/olimp');
if (expectedUrl.hostname !== '127.0.0.1' || expectedUrl.port !== '55432' || expectedUrl.pathname !== '/olimp' || expectedUrl.username !== 'olimp') {
  throw new Error('db:local обслуживает только olimp@127.0.0.1:55432/olimp. Для другой базы используйте её собственный способ запуска.');
}
mkdirSync(local, { recursive: true });
if (!existsSync(join(data, 'PG_VERSION'))) {
  const passwordFile = join(local, 'initdb-password');
  writeFileSync(passwordFile, password, { mode: 0o600 });
  try {
    const result = run('initdb', ['-D', data, '-A', 'scram-sha-256', '--pwfile=' + passwordFile, '-U', 'olimp', '--encoding=UTF8', '--locale=C']);
    if (result.status !== 0) process.exitCode = 1;
  } finally { unlinkSync(passwordFile); }
  if (process.exitCode) process.exit(process.exitCode);
}
if (run('pg_ctl', ['-D', data, 'status'], true).status !== 0) {
  const result = run('pg_ctl', ['-D', data, '-l', join(local, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55432 -k ""', 'start']);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const env = { ...process.env, PGPASSWORD: password };
const found = run('psql', ['-h', '127.0.0.1', '-p', '55432', '-U', 'olimp', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'olimp'"], true, env);
if (found.status !== 0) throw new Error('Не удалось подключиться к локальной базе; проверьте POSTGRES_PASSWORD');
if (found.stdout.trim() !== '1') {
  const result = run('createdb', ['-h', '127.0.0.1', '-p', '55432', '-U', 'olimp', 'olimp'], false, env);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('PostgreSQL проекта готов: 127.0.0.1:55432/olimp');
