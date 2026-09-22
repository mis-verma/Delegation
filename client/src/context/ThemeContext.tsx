import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);
const THEME_STORAGE_KEY = 'tm-theme';

/**
 * Determines the initial theme by checking local storage first,
 * then falling back to the user's OS-level system preferences.
 */
const getInitialTheme = (): Theme => {
  // SSR safety check
  if (typeof window === 'undefined') return 'light';

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

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
    localStorage.setItem(THEME_STORAGE_KEY, theme);

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

  // Memoized toggle function to prevent unnecessary re-renders in consumer components
  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
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