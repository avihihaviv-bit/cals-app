import { useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clearGeminiKey, getAiQuality, getGeminiKey, maskGeminiKey, normalizeGeminiKey, setAiQuality, setGeminiKey, type AiQuality } from '@/utils/geminiKey';
import { Chip } from '@/components/ui/Chip';
import { GeminiError, listUsableModels } from '@/services/geminiVision';

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; model: string }
  | { status: 'error'; message: string; detail?: string };

export function GeminiKeyCard() {
  const [savedKey, setSavedKey] = useState<string | null>(() => getGeminiKey());
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [quality, setQuality] = useState<AiQuality>(() => getAiQuality());

  function chooseQuality(q: AiQuality) {
    setAiQuality(q);
    setQuality(q);
  }

  async function runTest(key: string) {
    setTest({ status: 'testing' });
    try {
      const models = await listUsableModels(key);
      const pro = models.find((m) => /pro/.test(m));
      setTest({ status: 'ok', model: getAiQuality() === 'best' && pro ? `${pro} (falls back to ${models[0]} when busy)` : models[0] });
    } catch (err) {
      if (err instanceof GeminiError) setTest({ status: 'error', message: err.message, detail: err.detail });
      else setTest({ status: 'error', message: "Couldn't check the key right now.", detail: String(err) });
    }
  }

  function handleSave() {
    const key = normalizeGeminiKey(draft);
    if (!key) return;
    setGeminiKey(key);
    setSavedKey(key);
    setDraft('');
    setReveal(false);
    void runTest(key);
  }

  function handleRemove() {
    if (!window.confirm('Remove your Gemini key from this device? Photo scanning will stop working until you add one again.')) return;
    clearGeminiKey();
    setSavedKey(null);
    setTest({ status: 'idle' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-alt p-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">Gemini API key</p>
          <p className="truncate text-xs text-muted">{savedKey ? `Saved on this device · ${maskGeminiKey(savedKey)}` : 'Not set up yet — photo scanning needs this'}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            savedKey ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {savedKey ? 'Connected' : 'Off'}
        </span>
      </div>

      {savedKey && (
        <div className="rounded-xl bg-surface-alt p-3.5">
          <p className="text-sm font-semibold text-fg">Accuracy</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip selected={quality === 'best'} onClick={() => chooseQuality('best')}>
              🎯 Most accurate
            </Chip>
            <Chip selected={quality === 'fast'} onClick={() => chooseQuality('fast')}>
              ⚡ Fastest
            </Chip>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {quality === 'best'
              ? 'Scans and lookups use Gemini Pro first (smarter, ~10–30 s). If it’s busy or over the free limit, the fast model takes over automatically.'
              : 'Uses Gemini Flash only — answers in a few seconds, slightly less precise.'}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={savedKey ? 'Paste a new key to replace it' : 'Paste your key (starts with AIza…)'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-default bg-surface px-3 py-2.5 pr-10 text-sm text-fg outline-none focus:border-primary-400"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide key' : 'Show key'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted"
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Button onClick={handleSave} disabled={!normalizeGeminiKey(draft)}>
          Save
        </Button>
      </div>

      {test.status === 'testing' && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={13} className="animate-spin" /> Checking the key with Google…
        </p>
      )}
      {test.status === 'ok' && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-primary-700">
          <CheckCircle2 size={14} /> Works! Scans will use {test.model}.
        </p>
      )}
      {test.status === 'error' && (
        <div className="text-xs text-red-600">
          <p className="flex items-center gap-1.5 font-medium">
            <XCircle size={14} /> {test.message}
          </p>
          {test.detail && <p className="mt-0.5 break-words text-[11px] text-red-500/80">{test.detail}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {savedKey && (
          <Button size="sm" variant="secondary" onClick={() => runTest(savedKey)} disabled={test.status === 'testing'}>
            Test connection
          </Button>
        )}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50"
        >
          Get a free key <ExternalLink size={12} />
        </a>
        {savedKey && (
          <button onClick={handleRemove} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
            Remove key
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Your key is stored only on this device and sent only to Google when you scan a photo. It&apos;s never included in data exports.
      </p>
    </div>
  );
}
