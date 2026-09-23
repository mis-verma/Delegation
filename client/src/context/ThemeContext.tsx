import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';
// What the user actually chose, as opposed to `Theme` (what's currently applied on screen) —
// 'system' isn't a real theme, it means "whatever the OS says right now," which can change while
// the app stays open (e.g. macOS's scheduled light/dark switch).
type ThemePreference = Theme | 'system';

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);
const THEME_STORAGE_KEY = 'tm-theme';

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Determines the initial preference by checking local storage first, then falling back to
 * "system" — not to whatever the OS happens to say right now, permanently pinned. A first-time
 * visitor should keep following their OS as it changes, not silently lock in today's reading.
 */
const getInitialPreference = (): ThemePreference => {
  // SSR safety check
  if (typeof window === 'undefined') return 'light';

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;

  return 'system';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  // Only relevant while `preference === 'system'`, kept up to date by the matchMedia listener
  // below — a plain "subscribe to an external system, setState in its callback" effect, not state
  // derived from state, so `theme` itself can stay a pure render-time computation (no synced
  // useState/useEffect pair fighting the "don't setState inside an effect body" rule).
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);
  const theme: Theme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;

  // Skips the very first run — the initial theme is applied before paint (see index.html's inline
  // script, or this being the mount value), so there's no color change to smooth there, only on a
  // real switch afterward.
  const isFirstRun = useRef(true);

  useEffect(() => {
    const root = document.documentElement;

    // Support for Tailwind's standard `darkMode: 'class'` configuration
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Support for custom CSS variables or DaisyUI
    root.setAttribute('data-theme', theme);

    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    // Every --color-* token flips the instant the attribute above changes. `.theme-switching`
    // (index.css) is what makes that a 200ms fade instead of a hard snap — scoped to just this
    // window around a real switch, not left on permanently, so it can't leave frequently
    // re-rendering elements (a live count, a hover state) stuck perpetually mid-fade instead of
    // settling into their resting color.
    root.classList.add('theme-switching');
    const timeout = window.setTimeout(() => root.classList.remove('theme-switching'), 260);
    return () => window.clearTimeout(timeout);
  }, [theme]);

  // Persists the PREFERENCE ('light' / 'dark' / 'system'), not the resolved theme — "system" has
  // to stay "system" across reloads, not collapse into whatever it happened to resolve to once.
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  // Always subscribed (cheap, and simpler than tearing the listener down/up as `preference`
  // changes) — only actually affects `theme` above while `preference === 'system'`.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemIsDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => setPreferenceState(next), []);
  // Kept for existing callers that only ever dealt in concrete themes — setting one this way is
  // itself an explicit choice, same as `toggleTheme` below, so it also leaves "system" behind.
  const setTheme = useCallback((next: Theme) => setPreferenceState(next), []);

  // Memoized toggle function to prevent unnecessary re-renders in consumer components. Flips the
  // currently APPLIED theme, not the stored preference — toggling while on "system" should feel
  // like "no, dark, actually," landing on a concrete explicit choice rather than jumping around
  // based on where "system" happened to resolve.
  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => {
      const current: Theme = prev === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : prev;
      return current === 'light' ? 'dark' : 'light';
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, preference, toggleTheme, setTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Custom hook to consume the theme context.
 * Throws a helpful error if used outside of the ThemeProvider.
 */
// Provider + hook intentionally live in one file (the hook is meaningless without its provider);
// only affects Fast Refresh granularity, not runtime correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }

  return context;
};
