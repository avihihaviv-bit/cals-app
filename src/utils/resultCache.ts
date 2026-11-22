/**
 * Remembers AI answers on the device. The same photo or the same typed text
 * gets exactly the same result instantly, instead of a new (slow, slightly
 * different) answer every time. Small: only the AI's JSON is stored, never photos.
 */
const STORAGE_KEY = 'nutrition-ai-result-cache';
const MAX_ENTRIES = 80;

interface Entry {
  k: string;
  t: number;
  v: unknown;
}

function readAll(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = readAll().find((e) => e.k === key);
  return hit ? (hit.v as T) : undefined;
}

export function cacheSet(key: string, value: unknown): void {
  try {
    const rest = readAll().filter((e) => e.k !== key);
    const next = [{ k: key, t: Date.now(), v: value }, ...rest].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked — caching is optional */
  }
}

export function clearResultCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Fast content fingerprint (two independent 32-bit hashes + length). */
export function fingerprint(text: string): string {
  let a = 5381;
  let b = 2166136261;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = ((a << 5) + a + c) >>> 0;
    b = Math.imul(b ^ c, 16777619) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}${text.length.toString(36)}`;
}
