import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Available theme options */
export type Theme = 'synthwave' | 'dark';

/** Theme context value */
interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'dagent.theme';
const DEFAULT_THEME: Theme = 'synthwave';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Get initial theme from localStorage or default */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'synthwave' || stored === 'dark') {
    return stored;
  }
  return DEFAULT_THEME;
}

/** Apply theme to document root */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * ThemeProvider
 *
 * Manages theme state and applies it to the document root.
 * Persists theme preference to localStorage.
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Set theme and persist to localStorage
  const setTheme = (newTheme: Theme): void => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme hook
 *
 * Access the current theme and setTheme function.
 * Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
