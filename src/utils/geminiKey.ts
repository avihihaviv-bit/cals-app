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
/** Placeholder passed around when AI goes through the server router and this device holds no Gemini key. */
export const ROUTER_ONLY = '__router__';

/**
 * What AI features should use: the device's own Gemini key, or — when only
 * the AI server is set up — a placeholder meaning "use the server". Null
 * means no AI is set up at all.
 */
export function getAiAccessKey(): string | null {
  const key = getGeminiKey();
  if (key) return key;
  try {
    const raw = JSON.parse(localStorage.getItem('nutrition-ai-router') ?? 'null');
    return raw?.url && raw?.token ? ROUTER_ONLY : null;
  } catch {
    return null;
  }
}

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

/** "fast" (default) uses Flash; "best" tries Gemini Pro first — noticeably slower. */
export function getAiQuality(): AiQuality {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'best' ? 'best' : 'fast';
  } catch {
    return 'fast';
  }
}

export function setAiQuality(q: AiQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* ignore */
  }
}
