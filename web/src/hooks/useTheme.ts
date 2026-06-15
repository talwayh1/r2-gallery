import { useState, useEffect, useCallback } from 'react';
import type { ThemeMode } from '../types';

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => {
      root.classList.toggle('dark', dark);
    };

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(mode === 'dark');
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return { mode, toggle };
}
