import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getRouterConfig, isDeviceRouterConfigured, routerStatus, RouterFailure, type RouterStatus } from '@/services/aiRouter';

const KIND_LABEL: Record<string, string> = {
  ok: 'OK',
  rate_limit: 'Rate limit (429)',
  quota: 'Out of credits',
  auth: 'Key rejected',
  server: 'Server busy (5xx)',
  model_unavailable: 'Model unavailable',
  bad_param: 'Setting not accepted',
  bad_request: 'Bad request',
  too_large: 'Too large',
  timeout: 'Timed out',
  network: 'Network error',
  blocked: 'Blocked',
  empty: 'Empty answer',
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Admin view of the AI router: which provider is active, what's available, usage and recent attempts. Live from the server. */
export function AiStatusPage() {
  const [status, setStatus] = useState<RouterStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const configured = !!getRouterConfig() || isDeviceRouterConfigured();
  const onDevice = !getRouterConfig();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await routerStatus());
      setError('');
    } catch (err) {
      setError(err instanceof RouterFailure ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    void load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [configured, load]);

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/settings" aria-label="Back to settings" className="rounded-full p-1.5 text-muted hover:bg-surface-alt">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-fg">AI providers</h1>
            <p className="text-xs text-muted">{onDevice ? 'Providers on this phone' : 'Live from your AI server'} · refreshes every 15 s</p>
          </div>
        </div>
        {configured && (
          <button onClick={load} disabled={loading} aria-label="Refresh" className="rounded-full p-2 text-muted hover:bg-surface-alt">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </header>

      {!configured && (
        <div className="rounded-xl2 bg-surface p-5 text-center shadow-card">
          <p className="text-sm text-fg">No extra AI companies are set up yet.</p>
          <Link to="/settings" className="mt-2 inline-block text-sm font-semibold text-primary-700 underline">
            Add them in Settings
          </Link>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {status && (
        <>
          <div className="rounded-xl2 bg-surface p-4 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Active provider</p>
            {status.lastSuccess ? (
              <p className="mt-1 text-sm text-fg">
                <b className="capitalize">{status.lastSuccess.provider}</b> · {status.lastSuccess.model}{' '}
                <span className="text-muted">(last answer {time(status.lastSuccess.at)})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">No requests yet.</p>
            )}
            <p className="mt-2 text-xs text-muted">
              Order: {status.order.join(' → ')} · {onDevice || status.persistent ? 'stats are kept' : 'stats reset when the server restarts (add a KV store to keep them)'}
            </p>
          </div>

          {status.providers.map((p) => (
            <div key={p.name} className="rounded-xl2 bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold capitalize text-fg">
                  {p.name} <span className="text-xs font-normal text-muted">· {p.role}</span>
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    !p.configured ? 'bg-surface-alt text-muted' : p.available ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {!p.configured ? 'No key' : p.available ? 'Available' : 'Resting'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">Can do: {p.capabilities.filter((c) => c !== 'json' && c !== 'stream').join(', ')}</p>
              {p.stats && (
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <Stat label="requests" value={p.stats.requests} />
                  <Stat label="ok" value={p.stats.successes} />
                  <Stat label="failed" value={p.stats.failures} />
                  <Stat label="avg" value={p.stats.avgMs != null ? `${(p.stats.avgMs / 1000).toFixed(1)}s` : '—'} />
                </div>
              )}
              {p.stats && Object.keys(p.stats.byKind).length > 0 && (
                <p className="mt-2 text-[11px] text-muted">
                  Failures: {Object.entries(p.stats.byKind).map(([k, n]) => `${KIND_LABEL[k] ?? k} ×${n}`).join(' · ')}
                </p>
              )}
              {p.keys.map((k) => (
                <div key={k.id} className="mt-2 rounded-lg bg-surface-alt px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-fg">{k.id}</span>
                    <span className="text-muted">{k.stats ? `${k.stats.successes}/${k.stats.requests} ok` : 'unused'}</span>
                  </div>
                  {k.cooldown && (
                    <p className="text-amber-800">
                      Resting until {time(k.cooldown.until)} — {k.cooldown.reason}
                    </p>
                  )}
                  {k.modelCooldowns.map((m) => (
                    <p key={m.model} className="text-amber-800">
                      {m.model}: resting until {time(m.until)} ({m.reason})
                    </p>
                  ))}
                  {k.stats?.lastError && (
                    <p className="text-muted">
                      Last error {time(k.stats.lastError.at)}: {KIND_LABEL[k.stats.lastError.kind] ?? k.stats.lastError.kind}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="rounded-xl2 bg-surface p-4 shadow-card">
            <p className="mb-2 text-sm font-semibold text-fg">Recent attempts</p>
            {status.logs.length === 0 && <p className="text-xs text-muted">Nothing yet.</p>}
            <div className="space-y-1">
              {status.logs.slice(0, 30).map((l, i) => (
                <div key={`${l.at}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate text-fg">
                    <span className={l.outcome === 'ok' ? 'text-primary-600' : 'text-red-500'}>{l.outcome === 'ok' ? '✓' : '✗'}</span> {time(l.at)} · {l.provider} ·{' '}
                    {l.model} · {l.capability}
                  </span>
                  <span className="shrink-0 text-muted">
                    {l.outcome === 'ok' ? '' : `${KIND_LABEL[l.kind ?? ''] ?? l.kind} · `}
                    {(l.ms / 1000).toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-surface-alt py-1.5">
      <p className="text-sm font-bold tabular-nums text-fg">{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}
