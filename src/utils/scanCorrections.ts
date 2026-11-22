/**
 * Remembers when the user corrects what the AI saw ("Chicken breast" was
 * really tofu), so the next photo analysis is told about it and the same
 * mistake isn't repeated. Stored only on this device.
 */
const KEY = 'nutrition-ai-scan-corrections';
const MAX = 25;

export interface ScanCorrection {
  /** What the AI called it. */
  from: string;
  /** What the user said it really was. */
  to: string;
  /** Database id of the chosen food, when there is one. */
  toId?: string;
  times: number;
  at: number;
}

function read(): ScanCorrection[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ScanCorrection[]) : [];
    return Array.isArray(list) ? list.filter((c) => c && typeof c.from === 'string' && typeof c.to === 'string') : [];
  } catch {
    return [];
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function rememberCorrection(from: string | undefined, to: string, toId?: string) {
  if (!from || !to || same(from, to)) return;
  const list = read();
  const existing = list.find((c) => same(c.from, from) && same(c.to, to));
  const next = existing
    ? [{ ...existing, toId: toId ?? existing.toId, times: existing.times + 1, at: Date.now() }, ...list.filter((c) => c !== existing)]
    : [{ from, to, toId, times: 1, at: Date.now() }, ...list];
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)));
  } catch {
    /* storage full or blocked — corrections are a nice-to-have */
  }
}

export function getCorrections(): ScanCorrection[] {
  return read();
}

/** The correction the user made before for this AI name, if any. */
export function correctionFor(aiName: string): ScanCorrection | undefined {
  return read().find((c) => same(c.from, aiName));
}

/** Lines for the AI prompt, most recent first. */
export function correctionsForPrompt(): string {
  const list = read().slice(0, 12);
  if (list.length === 0) return '';
  return list.map((c) => `- You said "${c.from}" → it was really "${c.to}"${c.times > 1 ? ` (${c.times} times)` : ''}`).join('\n');
}
