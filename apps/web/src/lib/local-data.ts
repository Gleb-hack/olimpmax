import type { UserProfile } from '@olimp/contracts';
import { isMock } from './api';
import { max } from './max';

// Every piece of personal data the app keeps in this browser, so export and account deletion stay complete.
type Owner = Pick<UserProfile, 'id' | 'maxUserId'>;
export const localKeys = {
  avatar: (user: Owner) => `olimp.avatar.v1.${isMock ? 'mock' : user.id}`,
  preferencesImported: (user: Owner) => `olimp.preferences.imported.v1.${isMock ? 'mock' : user.id}`,
  legacyPreferences: (user: Owner) => `olimp.preferences.v1.${isMock ? 'mock' : user.maxUserId === 'local-demo' ? 'browser' : user.maxUserId}`,
  searchHistory: () => `olimp.search-history.v1.${isMock ? 'mock' : max.preferenceScope}`,
};

export function readSearchHistory(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(localKeys.searchHistory()) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 200).slice(0, 8) : [];
  } catch { return []; }
}

export function clearLocalData(user: Owner) {
  for (const key of [localKeys.avatar(user), localKeys.preferencesImported(user), localKeys.legacyPreferences(user), localKeys.searchHistory()]) {
    try { localStorage.removeItem(key); } catch { /* Storage is unavailable, so nothing was kept there. */ }
  }
}
