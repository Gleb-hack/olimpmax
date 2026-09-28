import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

// Keep in sync with the inline script in index.html, which applies the saved theme before the first paint.
export const themeStorageKey = 'olimp.theme.v1';
// Screen background of each theme: the color of the system status bar.
export const themeColors: Record<Theme, string> = { light: '#f8f9fb', dark: '#0b0f14' };

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

// "System" follows the theme MAX reports, if it reports one, and the device setting otherwise.
export function resolveTheme(preference: ThemePreference, maxScheme: unknown, systemDark: boolean): Theme {
  if (preference !== 'system') return preference;
  if (maxScheme === 'light' || maxScheme === 'dark') return maxScheme;
  return systemDark ? 'dark' : 'light';
}

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readPreference(): ThemePreference {
  try { return parseThemePreference(localStorage.getItem(themeStorageKey)); } catch { return 'system'; }
}

function currentTheme(preference: ThemePreference): Theme {
  return resolveTheme(preference, typeof window !== 'undefined' ? window.WebApp?.colorScheme : undefined, Boolean(darkQuery?.matches));
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
}

type ThemeState = { preference: ThemePreference; theme: Theme; setPreference: (preference: ThemePreference) => void };
export const useTheme = create<ThemeState>(set => {
  const preference = readPreference();
  const theme = currentTheme(preference);
  applyTheme(theme);
  darkQuery?.addEventListener('change', () => {
    const next = currentTheme(useTheme.getState().preference);
    applyTheme(next);
    set({ theme: next });
  });
  return {
    preference,
    theme,
    setPreference: next => {
      try { localStorage.setItem(themeStorageKey, next); } catch { /* The choice still applies until the app closes. */ }
      const nextTheme = currentTheme(next);
      applyTheme(nextTheme);
      set({ preference: next, theme: nextTheme });
    },
  };
});
