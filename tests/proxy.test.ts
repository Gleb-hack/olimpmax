import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../apps/api/src/app.js';
import { readConfig } from '../apps/api/src/config.js';
import type { Database } from '../apps/api/src/db/client.js';

test('only the configured Caddy hop supplies the client address', async () => {
  for (const hops of [0, 1]) {
    const app = await buildApp({ db: {} as Database, jwtSecret: 'test-only-secret'.repeat(4), trustProxyHops: hops });
    app.get('/test-ip', request => ({ ip: request.ip }));
    try {
      const response = await app.inject({ url: '/test-ip', remoteAddress: '127.0.0.1', headers: {
        'x-forwarded-for': '198.51.100.99, 192.0.2.1',
      } });
      assert.equal(response.json().ip, hops ? '192.0.2.1' : '127.0.0.1');
      const direct = await app.inject({ url: '/test-ip', remoteAddress: '203.0.113.7', headers: { 'x-forwarded-for': '192.0.2.1' } });
      assert.equal(direct.json().ip, '203.0.113.7');
    } finally { await app.close(); }
  }
});

test('proxy trust defaults to off and rejects an unbounded hop count', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'test-only-secret'.repeat(4) };
  assert.equal(readConfig(env).trustProxyHops, 0);
  assert.equal(readConfig({ ...env, TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
  assert.throws(() => readConfig({ ...env, TRUST_PROXY_HOPS: '2' }));
});
