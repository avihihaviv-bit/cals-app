/**
 * Client for the multi-provider AI router (backend/ai-router-worker). The
 * provider keys (Gemini, Groq, OpenRouter) live only on that server; this
 * device keeps just the server's address and its access code. The router
 * picks a provider that can do the job and moves on by itself when one is
 * out of quota — requests go one at a time, never duplicated in parallel.
 */

import { routeRequest, RouterError, RouterState, statusReport, type KvLike, type RouterEnv } from '../../backend/ai-router-worker/worker.js';

const STORAGE_KEY = 'nutrition-ai-router';
const DEVICE_KEYS = 'nutrition-ai-provider-keys';
const DEVICE_STATE = 'nutrition-ai-router-state';
const GEMINI_DEVICE_KEY = 'nutrition-ai-gemini-key';

export type ProviderName = 'gemini' | 'groq' | 'openrouter';

/**
 * Extra provider keys kept on this device (for when there's no server). They
 * stay in their own storage entry — never in the code, never in a backup
 * file — and are sent only to that provider's own API.
 */
export interface DeviceProviders {
  geminiExtra: string;
  groq: string;
  openrouter: string;
  primary: ProviderName;
}

export function getDeviceProviders(): DeviceProviders {
  try {
    const raw = JSON.parse(localStorage.getItem(DEVICE_KEYS) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        geminiExtra: String(raw.geminiExtra ?? ''),
        groq: String(raw.groq ?? ''),
        openrouter: String(raw.openrouter ?? ''),
        primary: ['gemini', 'groq', 'openrouter'].includes(raw.primary) ? raw.primary : 'gemini',
      };
    }
  } catch {
    /* ignore */
  }
  return { geminiExtra: '', groq: '', openrouter: '', primary: 'gemini' };
}

export function setDeviceProviders(p: DeviceProviders) {
  const clean = (v: string) => v.split(/[\s,]+/).filter(Boolean).join('\n');
  localStorage.setItem(DEVICE_KEYS, JSON.stringify({ geminiExtra: clean(p.geminiExtra), groq: clean(p.groq), openrouter: clean(p.openrouter), primary: p.primary }));
}

/** Several providers set up on this device (more than just the one Gemini key). */
export function isDeviceRouterConfigured(): boolean {
  const p = getDeviceProviders();
  return !!(p.groq.trim() || p.openrouter.trim() || p.geminiExtra.trim());
}

function deviceEnv(only?: ProviderName): RouterEnv {
  const p = getDeviceProviders();
  let gemini = '';
  try {
    gemini = localStorage.getItem(GEMINI_DEVICE_KEY) ?? '';
  } catch {
    /* ignore */
  }
  const order = [p.primary, ...(['gemini', 'groq', 'openrouter'] as ProviderName[]).filter((x) => x !== p.primary)];
  const env: RouterEnv = {
    AI_PROVIDER_ORDER: (only ? [only] : order).join(','),
    GEMINI_API_KEYS: [gemini, p.geminiExtra].filter(Boolean).join(','),
    GROQ_API_KEYS: p.groq,
    OPENROUTER_API_KEYS: p.openrouter,
  };
  return env;
}

// The device router remembers which providers are resting (and usage stats) between app openings.
const deviceKv: KvLike = {
  async get() {
    try {
      return JSON.parse(localStorage.getItem(DEVICE_STATE) ?? 'null');
    } catch {
      return null;
    }
  },
  async put(_key, value) {
    try {
      localStorage.setItem(DEVICE_STATE, value);
    } catch {
      /* storage full */
    }
  },
};
const deviceState = new RouterState();

function failureFromRouterError(err: unknown): RouterFailure {
  if (err instanceof RouterError) {
    const detail = err.attempts.map((a) => `${a.provider}/${a.model}: ${a.kind}${a.status ? ` ${a.status}` : ''}`).join(' | ');
    return new RouterFailure(err.code, err.message, detail || undefined);
  }
  return new RouterFailure('internal', String((err as Error)?.message ?? err));
}

async function deviceGenerate(req: RouterRequest): Promise<RouterAnswer> {
  await deviceState.load(deviceKv);
  try {
    return await routeRequest({ ...req, stream: false }, deviceEnv(), deviceState);
  } catch (err) {
    throw failureFromRouterError(err);
  } finally {
    await deviceState.save(deviceKv);
  }
}

/** Sends a tiny test question to one provider — each key on its own, so a bad key is pointed out. */
export async function testDeviceProvider(name: ProviderName): Promise<{ ok: boolean; text: string }> {
  const base = deviceEnv(name);
  const varName = { gemini: 'GEMINI_API_KEYS', groq: 'GROQ_API_KEYS', openrouter: 'OPENROUTER_API_KEYS' }[name];
  const keys = String(base[varName] ?? '').split(/[\s,]+/).filter(Boolean);
  if (keys.length === 0) return { ok: false, text: 'No key entered.' };
  const why: Record<string, string> = {
    auth: 'rejected — check it was copied in full',
    daily_limit: 'works, but its free daily limit is used up',
    rate_limited: 'works, but it is at its limit right now',
    all_cooling: 'at its limit right now',
  };
  const results = await Promise.all(
    keys.map(async (key, i) => {
      try {
        const out = await routeRequest(
          { tier: 'fast', messages: [{ role: 'user', parts: [{ text: 'Reply with just the word OK.' }] }], maxTokens: 64 },
          { ...base, [varName]: key, MAX_ATTEMPTS: '3' },
          new RouterState(), // test the key as it is now, ignoring earlier rests
        );
        return { ok: true, text: `Key ${i + 1}: works ✓ (${out.model}, ${(out.latencyMs / 1000).toFixed(1)}s)` };
      } catch (err) {
        const f = failureFromRouterError(err);
        return { ok: false, text: `Key ${i + 1}: ${why[f.code] ?? f.message} ✗` };
      }
    }),
  );
  return { ok: results.some((r) => r.ok), text: results.map((r) => r.text).join(' · ') };
}

export interface RouterConfig {
  url: string;
  token: string;
}

export function getRouterConfig(): RouterConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (raw && typeof raw.url === 'string' && raw.url && typeof raw.token === 'string' && raw.token) return { url: raw.url, token: raw.token };
  } catch {
    /* ignore */
  }
  return null;
}

/** True when AI should go through a router: the server, or several providers on this device. */
export function isRouterConfigured(): boolean {
  return getRouterConfig() !== null || isDeviceRouterConfigured();
}

export function normalizeRouterUrl(raw: string): string {
  let url = raw.trim().replace(/\s+/g, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '').replace(/\/v1(\/.*)?$/, '');
}

export function setRouterConfig(cfg: RouterConfig | null) {
  if (!cfg) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: normalizeRouterUrl(cfg.url), token: cfg.token.trim() }));
}

export type RouterCapability = 'text' | 'vision' | 'web_search';
export type RouterTier = 'fast' | 'balanced' | 'best';

export interface RouterPart {
  text?: string;
  image?: { mimeType: string; data: string };
}

export interface RouterRequest {
  capability?: RouterCapability;
  tier: RouterTier;
  system?: string;
  messages: { role: 'user' | 'assistant'; parts: RouterPart[] }[];
  json?: { schema: unknown } | null;
  maxTokens?: number;
  temperature?: number;
  deterministic?: boolean;
  thinking?: 'none' | 'default';
  deadlineMs?: number;
}

export interface RouterAnswer {
  text: string;
  provider: string;
  model: string;
  key?: string;
  latencyMs?: number;
  grounding?: { sources: { title: string; url: string }[]; queries: string[] };
}

export class RouterFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

async function call(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const cfg = getRouterConfig();
  if (!cfg) throw new RouterFailure('not_configured', 'The AI server is not set up.');
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${cfg.token}` },
      signal: ctrl.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new RouterFailure('aborted', 'Cancelled.');
    if (ctrl.signal.aborted) throw new RouterFailure('timeout', 'The AI server took too long to answer.');
    throw new RouterFailure('network', "Couldn't reach the AI server — check your internet connection.", String(err));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function failureFrom(res: Response): Promise<RouterFailure> {
  let code = `http_${res.status}`;
  let message = `AI server error ${res.status}`;
  let detail = '';
  try {
    const data = await res.json();
    code = data?.error?.code ?? code;
    message = data?.error?.message ?? message;
    if (Array.isArray(data?.attempts)) {
      detail = data.attempts.map((a: { provider: string; model: string; kind: string; status?: number }) => `${a.provider}/${a.model}: ${a.kind}${a.status ? ` ${a.status}` : ''}`).join(' | ');
    }
  } catch {
    /* not JSON */
  }
  return new RouterFailure(code, message, detail || undefined);
}

/** One request through the router. With onDelta it streams (text arrives in pieces) when the provider supports it. */
export async function routerGenerate(req: RouterRequest, opts: { signal?: AbortSignal; onDelta?: (piece: string) => void } = {}): Promise<RouterAnswer> {
  if (!getRouterConfig()) return deviceGenerate(req);
  try {
    return await serverGenerate(req, opts);
  } catch (err) {
    // Server unreachable or out of options — the providers on this device (if any) get a turn.
    if (err instanceof RouterFailure && err.code !== 'aborted' && isDeviceRouterConfigured()) return deviceGenerate(req);
    throw err;
  }
}

async function serverGenerate(req: RouterRequest, opts: { signal?: AbortSignal; onDelta?: (piece: string) => void }): Promise<RouterAnswer> {
  const timeoutMs = (req.deadlineMs ?? 55_000) + 15_000;
  const stream = !!opts.onDelta;
  const res = await call(
    '/v1/generate',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...req, stream }) },
    timeoutMs,
    opts.signal,
  );
  if (!res.ok) throw await failureFrom(res);
  if (!stream || !(res.headers.get('content-type') ?? '').includes('event-stream') || !res.body) {
    return (await res.json()) as RouterAnswer;
  }
  // Server-sent events: data: {"delta":"…"} … data: {"done":true,"provider":…,"model":…}
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let meta: Partial<RouterAnswer> = { provider: res.headers.get('x-ai-provider') ?? '', model: res.headers.get('x-ai-model') ?? '' };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const ev of events) {
      const line = ev.replace(/^data:\s?/, '');
      try {
        const data = JSON.parse(line);
        if (data.delta) {
          text += data.delta;
          opts.onDelta?.(data.delta);
        }
        if (data.done) meta = { ...meta, ...data };
      } catch {
        /* partial */
      }
    }
  }
  if (!text) throw new RouterFailure('empty', 'The AI answered with nothing — try again.');
  return { text, provider: meta.provider ?? '', model: meta.model ?? '', key: meta.key };
}

export interface RouterStatus {
  version: string;
  order: string[];
  lastSuccess: { provider: string; model: string; at: string } | null;
  persistent: boolean;
  providers: {
    name: string;
    role: 'primary' | 'backup';
    configured: boolean;
    available: boolean;
    capabilities: string[];
    keys: {
      id: string;
      cooldown: { until: string; reason: string } | null;
      modelCooldowns: { model: string; until: string; reason: string }[];
      stats: { requests: number; successes: number; failures: number; lastError: { kind: string; status?: number; message: string; at: string } | null; lastUsed: string | null } | null;
    }[];
    stats: { requests: number; successes: number; failures: number; avgMs: number | null; byKind: Record<string, number>; lastUsed: string | null } | null;
  }[];
  logs: { at: string; provider: string; key: string; model: string; capability: string; outcome: 'ok' | 'fail'; kind?: string; status?: number; ms: number }[];
}

export async function routerStatus(signal?: AbortSignal): Promise<RouterStatus> {
  if (!getRouterConfig()) {
    await deviceState.load(deviceKv);
    return statusReport(deviceEnv(), deviceState) as RouterStatus;
  }
  const res = await call('/v1/status', { method: 'GET' }, 15_000, signal);
  if (!res.ok) throw await failureFrom(res);
  return (await res.json()) as RouterStatus;
}
