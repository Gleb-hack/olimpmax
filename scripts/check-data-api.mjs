// Runs the checks of DATA-API.yaml against a running API, the way the evaluation platform would.
// Usage: STUDENT_LOGIN=... STUDENT_PASSWORD=... pnpm data-api:check [base URL]
// Without an argument the base URL is http://localhost:8080/api (docker compose up).
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const spec = parse(readFileSync(new URL('../DATA-API.yaml', import.meta.url), 'utf8'));
const baseUrl = (process.argv[2] ?? process.env.API_BASE_URL ?? 'http://localhost:8080/api').replace(/\/$/, '');
const vars = { STUDENT_LOGIN: process.env.STUDENT_LOGIN, STUDENT_PASSWORD: process.env.STUDENT_PASSWORD };
if (!vars.STUDENT_LOGIN || !vars.STUDENT_PASSWORD) {
  console.error('Задайте STUDENT_LOGIN и STUDENT_PASSWORD — тестовую учётную запись из TEST_ACCOUNTS сервера.');
  process.exit(2);
}
const fill = value => typeof value === 'string' ? value.replace(/\{(STUDENT_LOGIN|STUDENT_PASSWORD)\}/g, (_, key) => vars[key])
  : Array.isArray(value) ? value.map(fill) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)])) : value;

// "items[].id" — the field of every array element; returns the list of paths that are missing.
function missingFields(data, path) {
  const walk = (value, parts, at) => {
    if (!parts.length) return [];
    const [part, ...rest] = parts;
    const name = part.endsWith('[]') ? part.slice(0, -2) : part;
    if (value === null || typeof value !== 'object' || !(name in value)) return [at ? `${at}.${name}` : name];
    const next = value[name];
    if (!part.endsWith('[]')) return walk(next, rest, at ? `${at}.${name}` : name);
    if (!Array.isArray(next)) return [`${at}${name} (не массив)`];
    return next.flatMap((item, i) => walk(item, rest, `${at}${name}[${i}]`));
  };
  return walk(data, path.split('.'), '');
}

let token = null;
let failed = 0;
for (const check of spec.checks) {
  const request = fill(check.request ?? {});
  let path = check.path.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(String(request.path?.[key])));
  if (request.query) path += `?${new URLSearchParams(request.query)}`;
  const headers = { ...request.headers };
  if (check.role === 'student' && check.id !== 'login') headers.Authorization = `Bearer ${token}`;
  const body = request.body === undefined ? undefined : JSON.stringify(request.body);
  const problems = [];
  let response, data = null;
  try {
    response = await fetch(`${baseUrl}${path}`, { method: check.method, headers, body, signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  } catch (error) { problems.push(`нет ответа: ${error.message}`); }
  if (response) {
    const expect = check.expect ?? {};
    if (!expect.status.includes(response.status)) problems.push(`статус ${response.status}, ожидался ${expect.status.join(' или ')}`);
    else if (response.ok && response.status !== 204) {
      if (expect.contentType && !(response.headers.get('content-type') ?? '').startsWith(expect.contentType)) problems.push(`тип ${response.headers.get('content-type')}`);
      for (const [key, value] of Object.entries(expect.body ?? {})) if (data?.[key] !== value) problems.push(`${key} = ${JSON.stringify(data?.[key])}, ожидалось ${JSON.stringify(value)}`);
      for (const field of expect.requiredFields ?? []) problems.push(...missingFields(data, field).map(f => `нет поля ${f}`));
      for (const [key, min] of Object.entries(expect.minItems ?? {})) if (!Array.isArray(data?.[key]) || data[key].length < min) problems.push(`в ${key} меньше ${min} элементов`);
    } else if (!response.ok) {
      for (const [key, value] of Object.entries(expect.body ?? {})) if (data?.[key] !== value) problems.push(`${key} = ${JSON.stringify(data?.[key])}, ожидалось ${JSON.stringify(value)}`);
    }
    if (check.id === 'login' && response.ok) token = data?.[spec.auth.login.tokenField] ?? null;
  }
  failed += problems.length ? 1 : 0;
  console.log(`${problems.length ? '✗' : '✓'} ${check.method.padEnd(6)} ${path.padEnd(52)} ${response?.status ?? '—'}  ${check.title}${problems.length ? `\n    ${problems.slice(0, 5).join('\n    ')}` : ''}`);
}
console.log(`\n${spec.checks.length - failed} из ${spec.checks.length} проверок пройдено · ${baseUrl}`);
process.exit(failed ? 1 : 0);
