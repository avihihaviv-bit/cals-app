// The user's own Gemini API key, kept in its own localStorage entry rather
// than the persisted app store so it never ends up in an exported backup file.
const STORAGE_KEY = 'nutrition-ai-gemini-key';

export function getGeminiKey(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

/** Strips all whitespace — keys pasted from a phone's Notes app often pick up stray spaces or line breaks. */
export function normalizeGeminiKey(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function setGeminiKey(raw: string): void {
  localStorage.setItem(STORAGE_KEY, normalizeGeminiKey(raw));
}

export function clearGeminiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function maskGeminiKey(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

const QUALITY_KEY = 'nutrition-ai-gemini-quality';
export type AiQuality = 'best' | 'fast';

/** "best" (default) tries Gemini Pro first for nutrition lookups; "fast" uses Flash only. */
export function getAiQuality(): AiQuality {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'fast' ? 'fast' : 'best';
  } catch {
    return 'best';
  }
}

export function setAiQuality(q: AiQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* ignore */
  }
}
