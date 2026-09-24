import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'he';

interface LocaleState {
  language: Language;
  setLanguage: (language: Language) => void;
}

/**
 * App language/direction preference. Scoped honestly: switching this flips
 * the whole document's dir/lang (see App.tsx) and fully translates the AI
 * Coach area (the literal subject of the Hebrew/RTL request), but most
 * other screens (Dashboard, Diary, Search, Profile, Onboarding...) keep
 * their English copy for now — the document-level `dir` still gives them
 * correct base text alignment, just not translated strings.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'nutrition-ai-locale', version: 1 },
  ),
);

export function isRTL(language: Language): boolean {
  return language === 'he';
}
