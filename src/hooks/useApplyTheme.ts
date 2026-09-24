import { useEffect } from 'react';
import { useSettingsStore, resolveTheme } from '@/store/useSettingsStore';

/** Syncs the `dark` class on <html> with the theme setting, live-tracking OS changes in 'system' mode. */
export function useApplyTheme() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    };
    apply();
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);
}
