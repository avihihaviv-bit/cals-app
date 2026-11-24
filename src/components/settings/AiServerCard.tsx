import { useState } from 'react';
import { Server } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getRouterConfig, routerStatus, RouterFailure, setRouterConfig, type RouterStatus } from '@/services/aiRouter';

/**
 * Connects the app to the AI router server (Gemini + Groq + OpenRouter with
 * automatic switching). Provider keys are entered on the server, never here —
 * this device only stores the server address and its access code.
 */
export function AiServerCard() {
  const saved = getRouterConfig();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(!!saved);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function summary(st: RouterStatus): string {
    const ready = st.providers.filter((p) => p.configured).map((p) => `${p.name}${p.available ? '' : ' (resting)'}`);
    return ready.length ? `Connected ✓ Providers: ${ready.join(', ')}` : 'Connected, but the server has no provider keys yet.';
  }

  async function save() {
    setBusy(true);
    setResult(null);
    const previous = getRouterConfig();
    setRouterConfig({ url, token: token || previous?.token || '' });
    try {
      const st = await routerStatus();
      setConnected(true);
      setToken('');
      setResult({ ok: true, text: summary(st) });
    } catch (err) {
      // Keep the old working settings if the new ones don't work.
      setRouterConfig(previous);
      setConnected(!!previous);
      setResult({ ok: false, text: err instanceof RouterFailure ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    setRouterConfig(null);
    setConnected(false);
    setUrl('');
    setToken('');
    setResult(null);
  }

  return (
    <div className="rounded-xl bg-surface-alt p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Server size={15} className="text-primary-600" /> AI server (several providers)
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Optional. Your own server holds the Gemini, Groq and OpenRouter keys and switches to the next provider by itself when one runs out. The keys never
        come to this phone — only the server address and its access code.
      </p>
      {connected && (
        <p className="mt-2 text-xs font-medium text-primary-700">
          ✓ Using the AI server{getRouterConfig()?.url ? ` (${new URL(getRouterConfig()!.url).host})` : ''}. Your Gemini key above (if any) is only a backup.
        </p>
      )}
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://your-router.workers.dev"
        className="input mt-2.5 w-full py-2 text-sm"
        aria-label="AI server address"
        dir="ltr"
      />
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={connected ? 'Access code (saved — leave empty to keep)' : 'Access code (ROUTER_ACCESS_TOKEN)'}
        type="password"
        autoComplete="off"
        className="input mt-2 w-full py-2 text-sm"
        aria-label="AI server access code"
        dir="ltr"
      />
      <div className="mt-2.5 flex gap-2">
        <Button fullWidth size="sm" disabled={busy || !url.trim() || (!token.trim() && !connected)} onClick={save}>
          {busy ? 'Checking…' : connected ? 'Save & test' : 'Connect'}
        </Button>
        {connected && (
          <Button size="sm" variant="secondary" onClick={disconnect}>
            Disconnect
          </Button>
        )}
      </div>
      {result && <p className={`mt-2 text-xs ${result.ok ? 'text-primary-700' : 'text-red-600'}`}>{result.text}</p>}
    </div>
  );
}
