import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface NotificationSettings {
  weeklyCheckIn: boolean;
  mealReminders: boolean;
  dailySummary: boolean;
  aiRecommendations: boolean;
}

interface SettingsState {
  theme: ThemeMode;
  notifications: NotificationSettings;
  setTheme: (theme: ThemeMode) => void;
  setNotification: (key: keyof NotificationSettings, value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      notifications: {
        weeklyCheckIn: true,
        mealReminders: true,
        dailySummary: true,
        aiRecommendations: true,
      },
      setTheme: (theme) => set({ theme }),
      setNotification: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
    }),
    { name: 'nutrition-ai-settings', version: 1 },
  ),
);

/** Resolves 'system' against the OS media query; 'light'/'dark' pass through. */
export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}
