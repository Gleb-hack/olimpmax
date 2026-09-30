import type { UserProfile } from '@olimp/contracts';
import { isMock } from './api';
import { max } from './max';

// Every piece of personal data the app keeps in this browser, so account deletion stays complete.
type Owner = Pick<UserProfile, 'id' | 'maxUserId'>;
export const localKeys = {
  avatar: (user: Owner) => `olimp.avatar.v1.${isMock ? 'mock' : user.id}`,
  preferencesImported: (user: Owner) => `olimp.preferences.imported.v1.${isMock ? 'mock' : user.id}`,
  legacyPreferences: (user: Owner) => `olimp.preferences.v1.${isMock ? 'mock' : user.maxUserId === 'local-demo' ? 'browser' : user.maxUserId}`,
  searchHistory: () => `olimp.search-history.v1.${isMock ? 'mock' : max.preferenceScope}`,
  comparison: () => `olimp.comparison.v1.${isMock ? 'mock' : max.preferenceScope}`,
  /** «Не сейчас» on the offer to connect the reminder bot in the plan. */
  botPromptDismissed: () => `olimp.bot-prompt.dismissed.v1.${isMock ? 'mock' : max.preferenceScope}`,
  /** The app tour is due: set on registration and by «Пройти обучение заново», cleared when the tour is closed. */
  tourPending: () => `olimp.tour.pending.v1.${isMock ? 'mock' : max.preferenceScope}`,
};

export function readSearchHistory(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(localKeys.searchHistory()) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 200).slice(0, 8) : [];
  } catch { return []; }
}

export function clearLocalData(user: Owner) {
  for (const key of [localKeys.avatar(user), localKeys.preferencesImported(user), localKeys.legacyPreferences(user), localKeys.searchHistory(), localKeys.comparison(), localKeys.botPromptDismissed(), localKeys.tourPending()]) {
    try { localStorage.removeItem(key); } catch { /* Storage is unavailable, so nothing was kept there. */ }
  }
}
