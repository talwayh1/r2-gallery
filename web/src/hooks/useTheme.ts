import { useState, useEffect, useCallback } from 'react';
import type { ThemeMode } from '../types';

const THEMES: ThemeMode[] = ['light', 'dark', 'contrast', 'system'];

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove all theme attributes first
    root.removeAttribute('data-theme');
    root.classList.remove('dark');

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.classList.toggle('dark', mq.matches);
      const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else if (mode === 'contrast') {
      root.setAttribute('data-theme', 'contrast');
      root.classList.add('dark');
    } else {
      root.classList.toggle('dark', mode === 'dark');
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const idx = THEMES.indexOf(prev);
      const next = THEMES[(idx + 1) % THEMES.length];
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return { mode, toggle };
}
