// «О вузе» for the university page: type, a description, the official site and the admission rules.
// A plain CSV in data/reference, read once per process; edit the file and restart the API to update it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDelimited } from '../../../../packages/contracts/src/index.js';
import { dataDir } from '../features/assistant/knowledge.js';

export const universityProfilesFile = 'reference/university-profiles.csv';
export type UniversityProfile = { type: 'state' | 'private' | null; description: string | null; site: string | null; rules: string | null };

function webAddress(value: string | undefined) {
  if (!value?.trim()) return null;
  try { return /^https?:$/.test(new URL(value).protocol) ? new URL(value).href : null; } catch { return null; }
}

export function parseUniversityProfiles(text: string) {
  const profiles = new Map<string, UniversityProfile>();
  for (const row of parseDelimited(text)) {
    const slug = row.slug?.trim();
    if (!slug) continue;
    const type = row.type === 'state' || row.type === 'private' ? row.type : null;
    profiles.set(slug, { type, description: row.description?.trim() || null, site: webAddress(row.site), rules: webAddress(row.rules) });
  }
  return profiles;
}

const cache = new Map<string, Map<string, UniversityProfile>>();
export function universityProfiles(dir = dataDir()) {
  const hit = cache.get(dir);
  if (hit) return hit;
  const path = join(dir, universityProfilesFile);
  const value = parseUniversityProfiles(existsSync(path) ? readFileSync(path, 'utf8') : '');
  cache.set(dir, value);
  return value;
}
