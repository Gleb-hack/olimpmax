import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTestAccount, validateMaxInitData } from '../apps/api/src/features/auth.js';
import { parseTestAccounts, readConfig } from '../apps/api/src/config.js';
import { signedInitData, testBotToken } from './fixtures.js';
const now = new Date('2026-09-22T10:00:00Z');
test('MAX HMAC validates decoded values containing special characters', () => {
  const user = validateMaxInitData(signedInitData(111, now), testBotToken, now.getTime());
  assert.equal(user.maxUserId, '111');
  assert.equal(user.displayName, 'Тест + &=ё Пользователь');
});
test('MAX authentication rejects forgery, duplicate keys, stale and future launches', () => {
  const valid = signedInitData(111, now);
  assert.throws(() => validateMaxInitData(valid.replace('111', '222'), testBotToken, now.getTime()));
  assert.throws(() => validateMaxInitData(valid + '&auth_date=1', testBotToken, now.getTime()), /Duplicate/);
  assert.throws(() => validateMaxInitData(valid, 'wrong', now.getTime()), /signature/);
  assert.throws(() => validateMaxInitData(valid, testBotToken, now.getTime() + 3601000), /Expired/);
  assert.throws(() => validateMaxInitData(valid, testBotToken, now.getTime() - 31000), /Expired/);
  assert.throws(() => validateMaxInitData('hash=xyz', testBotToken, now.getTime()));
});
test('dev identity cannot be enabled on a public host or in production', () => {
  const env = { DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'a'.repeat(64), ALLOW_DEV_AUTH: 'true' };
  assert.throws(() => readConfig({ ...env, HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => readConfig({ ...env, NODE_ENV: 'production' }), /loopback/);
  assert.equal(readConfig(env).allowDevAuth, true);
});
test('test accounts: parsed from login:password pairs, checked by exact password, off by default', () => {
  const accounts = parseTestAccounts(' Student:checker-pass-1 , student2:pa:ss:word ');
  assert.deepEqual([...accounts], [['student', 'checker-pass-1'], ['student2', 'pa:ss:word']]);
  assert.equal(checkTestAccount(accounts, 'STUDENT ', 'checker-pass-1'), 'student');
  assert.equal(checkTestAccount(accounts, 'student', 'checker-pass-2'), null);
  assert.equal(checkTestAccount(accounts, 'nobody', 'checker-pass-1'), null);
  assert.equal(parseTestAccounts(undefined).size, 0);
  assert.throws(() => parseTestAccounts('student:short'), /8 до 200/);
  assert.throws(() => parseTestAccounts('ab:long-enough-pass'), /логин/);
  assert.throws(() => parseTestAccounts('student:long-enough-pass,student:another-pass'), /дважды/);
  const env = { DATABASE_URL: 'postgresql://localhost/test', JWT_SECRET: 'a'.repeat(64), NODE_ENV: 'production' };
  assert.throws(() => readConfig(env), /MAX_BOT_TOKEN или TEST_ACCOUNTS/);
  assert.equal(readConfig({ ...env, TEST_ACCOUNTS: 'student:checker-pass-1' }).testAccounts.size, 1);
});
