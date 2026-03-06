'use client';
import { useState, useCallback, useEffect } from 'react';

export type TableTheme = 'green' | 'blue' | 'red';

const THEME_KEY = 'poker_table_theme';

export function useTheme() {
  const [theme, setThemeState] = useState<TableTheme>('green');

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as TableTheme | null;
    if (saved && ['green', 'blue', 'red'].includes(saved)) {
      setThemeState(saved);
    }
  }, []);

  const setTheme = useCallback((t: TableTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  return { theme, setTheme };
}
