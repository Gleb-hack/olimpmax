import { create } from 'zustand';
import type { UserProfile } from '@olimp/contracts';
import { localKeys } from '../../lib/local-data';

type Owner = Pick<UserProfile, 'id' | 'maxUserId'>;
type Mark = 'pending' | 'done';

function read(user: Owner): Mark | null {
  try { const value = localStorage.getItem(localKeys.onboarding(user)); return value === 'pending' || value === 'done' ? value : null; } catch { return null; }
}
function write(user: Owner, value: Mark) {
  try { localStorage.setItem(localKeys.onboarding(user), value); } catch { /* The tour still runs; it may show again after a reload. */ }
}

/** A new account gets the tour on its first visit to the app. Accounts made before the tour existed never see it by themselves. */
export function markOnboardingPending(user: Owner) { if (read(user) !== 'done') write(user, 'pending'); }
export const onboardingPending = (user: Owner) => read(user) === 'pending';

type OnboardingState = {
  active: boolean; step: number;
  start: () => void; go: (step: number) => void; finish: (user: Owner | null) => void;
};
/** The tour over the real screens: «Помощь и FAQ» can start it again at any time. */
export const useOnboarding = create<OnboardingState>(set => ({
  active: false, step: 0,
  start: () => set({ active: true, step: 0 }),
  go: step => set({ step }),
  finish: user => { if (user) write(user, 'done'); set({ active: false, step: 0 }); },
}));
