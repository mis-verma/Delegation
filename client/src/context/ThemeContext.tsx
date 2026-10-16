import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';

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

// Page colours from index.css, the same two index.html paints before the first frame. The <html> element keeps
// them inline, so they must follow every switch or the old theme shows through behind the app.
const PAGE_BG: Record<'light' | 'dark', string> = { light: '#f5f7fb', dark: '#0b1020' };

/** Puts a theme on the page: the class Tailwind's dark: variants read, the data attribute the tokens read, and the
 *  page background and native colour scheme (scrollbars, form controls). Safe to call twice. */
const applyTheme = (theme: 'light' | 'dark') => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  root.style.backgroundColor = PAGE_BG[theme];
  root.style.colorScheme = theme;
};


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

  // Keeps the page in step with `theme` for every way it changes (a switch below, or the OS flipping while on "system").
  useEffect(() => { applyTheme(theme); }, [theme]);

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

  // A switch the person made: instant, the way GitHub, Linear and Notion do it. Every element's own colour transition is
  // switched off for that one frame (.theme-switching in index.css), the new theme goes on, the browser is made to
  // apply it at once (the getComputedStyle read), and transitions come back on the next frame. Left on, each element
  // faded on its own schedule, so borders, gradients and text changed at different moments: slow, with lines.
  const switchTo = useCallback((next: ThemePreference) => {
    const root = document.documentElement;
    const resolved: Theme = next === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : next;
    root.classList.add('theme-switching');
    flushSync(() => setPreferenceState(next));
    applyTheme(resolved);
    void window.getComputedStyle(root).backgroundColor;
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  }, []);

  const setPreference = useCallback((next: ThemePreference) => switchTo(next), [switchTo]);
  // Kept for existing callers that only ever dealt in concrete themes — setting one this way is
  // itself an explicit choice, same as `toggleTheme` below, so it also leaves "system" behind.
  const setTheme = useCallback((next: Theme) => switchTo(next), [switchTo]);

  // Memoized toggle function to prevent unnecessary re-renders in consumer components. Flips the
  // currently APPLIED theme, not the stored preference — toggling while on "system" should feel
  // like "no, dark, actually," landing on a concrete explicit choice rather than jumping around
  // based on where "system" happened to resolve.
  const toggleTheme = useCallback(() => {
    switchTo(theme === 'light' ? 'dark' : 'light');
  }, [switchTo, theme]);

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
