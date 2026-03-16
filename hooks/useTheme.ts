'use client';
import { useState, useCallback, useEffect } from 'react';

export type TableTheme =
  | 'green'
  | 'blue'
  | 'red'
  | 'purple'
  | 'noir'
  | 'gold'
  | 'neon'
  | 'ocean';

export interface ThemeConfig {
  id: TableTheme;
  name: string;
  icon: string;
  felt: string;
  feltDark: string;
  rail: string;
  accent: string;
  description: string;
  unlockLevel?: number; // 0 or undefined = free
}

export const TABLE_THEMES: ThemeConfig[] = [
  {
    id: 'green',
    name: 'Classic Green',
    icon: '🟢',
    felt: '#1a5c2a',
    feltDark: '#0f3d1a',
    rail: '#3d1f00',
    accent: '#2ecc71',
    description: 'The classic casino felt',
  },
  {
    id: 'blue',
    name: 'Midnight Blue',
    icon: '🔵',
    felt: '#1a3a5c',
    feltDark: '#0f2640',
    rail: '#1a1a3d',
    accent: '#3498db',
    description: 'Cool and calm waters',
  },
  {
    id: 'red',
    name: 'Royal Red',
    icon: '🔴',
    felt: '#5c1a2a',
    feltDark: '#3d0f1a',
    rail: '#2d0f15',
    accent: '#e74c3c',
    description: 'High-stakes intensity',
  },
  {
    id: 'purple',
    name: 'Velvet Lounge',
    icon: '🟣',
    felt: '#3a1a5c',
    feltDark: '#260f40',
    rail: '#1f0a33',
    accent: '#9b59b6',
    description: 'VIP luxury vibes',
    unlockLevel: 5,
  },
  {
    id: 'noir',
    name: 'Noir',
    icon: '⚫',
    felt: '#1a1a1f',
    feltDark: '#0f0f14',
    rail: '#2a2a30',
    accent: '#95a5a6',
    description: 'Sleek and sophisticated',
    unlockLevel: 10,
  },
  {
    id: 'gold',
    name: 'Golden Palace',
    icon: '🟡',
    felt: '#4a3a0a',
    feltDark: '#332800',
    rail: '#5c4a1a',
    accent: '#f1c40f',
    description: 'For the true high roller',
    unlockLevel: 15,
  },
  {
    id: 'neon',
    name: 'Neon City',
    icon: '💜',
    felt: '#0a0a2e',
    feltDark: '#050520',
    rail: '#1a0a33',
    accent: '#00ff88',
    description: 'Cyberpunk casino vibes',
    unlockLevel: 20,
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    icon: '🌊',
    felt: '#0a2a3a',
    feltDark: '#051d2a',
    rail: '#0f1a26',
    accent: '#1abc9c',
    description: 'Beneath the waves',
    unlockLevel: 25,
  },
];

const THEME_KEY = 'poker_table_theme';

export function getThemeConfig(themeId: TableTheme): ThemeConfig {
  return TABLE_THEMES.find(t => t.id === themeId) ?? TABLE_THEMES[0];
}

export function useTheme() {
  const [theme, setThemeState] = useState<TableTheme>('green');

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as TableTheme | null;
    if (saved && TABLE_THEMES.some(t => t.id === saved)) {
      setThemeState(saved);
    }
  }, []);

  const setTheme = useCallback((t: TableTheme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  const themeConfig = getThemeConfig(theme);

  return { theme, setTheme, themeConfig };
}
