// Types for worker.js, so the app can run the same router on the device (no server needed).
export interface RouterEnv {
  [name: string]: string | undefined;
}

export interface RouterAttempt {
  provider: string;
  key: string;
  model: string;
  kind: string;
  status?: number;
  ms: number;
}

export interface RouteResult {
  text: string;
  provider: string;
  model: string;
  key: string;
  latencyMs: number;
  attempts: RouterAttempt[];
  grounding?: { sources: { title: string; url: string }[]; queries: string[] };
}

export interface KvLike {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export class RouterState {
  s: { cooldowns: Record<string, { until: number; reason: string }>; logs: unknown[] };
  dirty: boolean;
  load(kv?: KvLike): Promise<void>;
  save(kv?: KvLike): Promise<void>;
  coolingUntil(id: string): number;
}

export class RouterError extends Error {
  code: string;
  attempts: RouterAttempt[];
  status: number;
}

export function routeRequest(body: unknown, env: RouterEnv, state: RouterState, deps?: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number }): Promise<RouteResult>;
export function statusReport(env: RouterEnv, state: RouterState): unknown;
export function classifyError(status: number, bodyText: string, headers?: Headers): { kind: string; daily?: boolean; retryAfterMs?: number | null; message: string };
