import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completenessScore, type CompletenessFacts } from '../apps/api/src/features/catalog.js';
import { parseUniversityProfiles } from '../apps/api/src/reference/university-profiles.js';
import { parseDelimited } from '../packages/contracts/src/index.js';

const none: CompletenessFacts = { countdown: false, datedSchedule: false, scheduleText: false, verifiedEvent: false,
  benefits: false, level: false, description: false, organizers: false, notHeld: false };

test('«most complete first»: days to the next stage and dated stages weigh most, then university benefits', () => {
  const full = completenessScore({ ...none, countdown: true, datedSchedule: true, benefits: true, level: true, description: true, organizers: true });
  const noBenefits = completenessScore({ ...none, countdown: true, datedSchedule: true, level: true, description: true, organizers: true });
  const textOnly = completenessScore({ ...none, scheduleText: true, benefits: true, level: true, description: true, organizers: true });
  assert.ok(full > noBenefits);
  assert.ok(noBenefits > textOnly);
  assert.ok(completenessScore({ ...none, description: true, organizers: true }) > completenessScore({ ...none, description: true, organizers: true, notHeld: true }));
});

test('every university of the reference has a profile for its page', () => {
  const profiles = parseUniversityProfiles(readFileSync(new URL('../data/reference/university-profiles.csv', import.meta.url), 'utf8'));
  const slugs = parseDelimited(readFileSync(new URL('../data/reference/universities.csv', import.meta.url), 'utf8')).map(row => row.slug!);
  for (const slug of slugs) {
    const profile = profiles.get(slug);
    assert.ok(profile, `нет профиля для ${slug}`);
    assert.ok(profile.type && profile.description && profile.site?.startsWith('https://') && /^https?:\/\//.test(profile.rules ?? ''), slug);
  }
  assert.equal(profiles.get('innopolis')?.type, 'private');
  // Tracking parameters are not part of the address.
  assert.equal(profiles.get('mgimo')?.rules, 'https://abiturient.mgimo.ru/pravila-priema');
});
