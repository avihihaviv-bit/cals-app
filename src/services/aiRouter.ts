/**
 * Client for the multi-provider AI router (backend/ai-router-worker). The
 * provider keys (Gemini, Groq, OpenRouter) live only on that server; this
 * device keeps just the server's address and its access code. The router
 * picks a provider that can do the job and moves on by itself when one is
 * out of quota — requests go one at a time, never duplicated in parallel.
 */

const STORAGE_KEY = 'nutrition-ai-router';

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

export function isRouterConfigured(): boolean {
  return getRouterConfig() !== null;
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
  const res = await call('/v1/status', { method: 'GET' }, 15_000, signal);
  if (!res.ok) throw await failureFrom(res);
  return (await res.json()) as RouterStatus;
}
