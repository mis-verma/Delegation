import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark';
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

const PAGE_BG: Record<'light' | 'dark', string> = { light: '#f5f7fb', dark: '#0b1020' };

const applyTheme = (theme: 'light' | 'dark') => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('data-theme', theme);
  root.style.backgroundColor = PAGE_BG[theme];
  root.style.colorScheme = theme;
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const getInitialPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'light';

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;

  return 'system';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);
  const theme: Theme = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }, [preference]);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemIsDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

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
  const setTheme = useCallback((next: Theme) => switchTo(next), [switchTo]);

  const toggleTheme = useCallback(() => {
    switchTo(theme === 'light' ? 'dark' : 'light');
  }, [switchTo, theme]);

  return (
    <ThemeContext.Provider value={{ theme, preference, toggleTheme, setTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }

  return context;
};
