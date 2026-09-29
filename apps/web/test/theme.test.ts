import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseThemePreference, resolveTheme } from '../src/lib/theme.ts';

test('an unknown or missing saved choice falls back to the light theme', () => {
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
  assert.equal(parseThemePreference(null), 'light');
  assert.equal(parseThemePreference('sepia'), 'light');
});

test('an explicit choice wins over MAX and the device', () => {
  assert.equal(resolveTheme('light', 'dark', true), 'light');
  assert.equal(resolveTheme('dark', 'light', false), 'dark');
});

test('the system choice follows MAX first, then the device setting', () => {
  assert.equal(resolveTheme('system', 'dark', false), 'dark');
  assert.equal(resolveTheme('system', 'light', true), 'light');
  assert.equal(resolveTheme('system', undefined, true), 'dark');
  assert.equal(resolveTheme('system', 'unexpected', false), 'light');
});
