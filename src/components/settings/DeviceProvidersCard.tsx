import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { getGeminiKey } from '@/utils/geminiKey';
import { getDeviceProviders, getRouterConfig, setDeviceProviders, testDeviceProvider, type ProviderName } from '@/services/aiRouter';

const PROVIDERS: { name: ProviderName; label: string; field: 'geminiExtra' | 'groq' | 'openrouter'; placeholder: string; link: string; linkLabel: string }[] = [
  { name: 'groq', label: 'Groq', field: 'groq', placeholder: 'gsk_… (one key per line)', link: 'https://console.groq.com/keys', linkLabel: 'console.groq.com/keys' },
  { name: 'openrouter', label: 'OpenRouter', field: 'openrouter', placeholder: 'sk-or-… (one key per line)', link: 'https://openrouter.ai/keys', linkLabel: 'openrouter.ai/keys' },
  { name: 'gemini', label: 'More Gemini keys', field: 'geminiExtra', placeholder: 'AIza… (optional, one per line)', link: 'https://aistudio.google.com/apikey', linkLabel: 'aistudio.google.com/apikey' },
];

/**
 * Several AI companies without any server: keys for Groq and OpenRouter (and
 * extra Gemini keys) stay on this phone and go only to that company's API.
 * When one runs out, the next takes over automatically.
 */
export function DeviceProvidersCard() {
  const [p, setP] = useState(getDeviceProviders);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState<Partial<Record<ProviderName, { ok: boolean; text: string } | 'testing'>>>({});
  const hasServer = !!getRouterConfig();

  function save() {
    setDeviceProviders(p);
    setP(getDeviceProviders());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function test(name: ProviderName) {
    setDeviceProviders(p);
    setTests((t) => ({ ...t, [name]: 'testing' }));
    const result = await testDeviceProvider(name);
    setTests((t) => ({ ...t, [name]: result }));
  }

  const keyCount = (v: string) => v.split(/[\s,]+/).filter(Boolean).length;

  return (
    <div className="rounded-xl bg-surface-alt p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Layers size={15} className="text-primary-600" /> More AI companies (no server needed)
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Add free keys from Groq and OpenRouter: when Gemini runs out (or is busy) the next company answers by itself. Photos only go to models that can see
        images. Keys stay only on this phone and are sent only to that company — never in the app&apos;s code or in backups.
        {hasServer && ' The AI server above is used first; these are its backup.'}
      </p>

      {PROVIDERS.map((prov) => {
        const result = tests[prov.name];
        const canTest = prov.name === 'gemini' ? !!getGeminiKey() || keyCount(p.geminiExtra) > 0 : keyCount(p[prov.field]) > 0;
        return (
          <div key={prov.name} className="mt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg" htmlFor={`keys-${prov.name}`}>
                {prov.label} {keyCount(p[prov.field]) > 0 && <span className="font-normal text-muted">· {keyCount(p[prov.field])} key(s)</span>}
              </label>
              <a href={prov.link} target="_blank" rel="noreferrer" className="text-[11px] text-primary-700 underline">
                {prov.linkLabel}
              </a>
            </div>
            <textarea
              id={`keys-${prov.name}`}
              value={p[prov.field]}
              onChange={(e) => setP({ ...p, [prov.field]: e.target.value })}
              rows={1}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder={prov.placeholder}
              className="input mt-1 w-full resize-none py-2 font-mono text-xs"
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={!canTest || result === 'testing'}
                onClick={() => test(prov.name)}
                className="text-[11px] font-semibold text-primary-700 disabled:text-faint"
              >
                {result === 'testing' ? 'Testing…' : `Test ${prov.name === 'gemini' ? 'Gemini' : prov.label}`}
              </button>
              {result && result !== 'testing' && <span className={`text-[11px] ${result.ok ? 'text-primary-700' : 'text-red-600'}`}>{result.text}</span>}
            </div>
          </div>
        );
      })}

      <p className="mt-3 text-xs font-semibold text-fg">Try first</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(['gemini', 'groq', 'openrouter'] as ProviderName[]).map((name) => (
          <Chip key={name} selected={p.primary === name} onClick={() => setP({ ...p, primary: name })}>
            {name === 'gemini' ? 'Gemini (most accurate for food)' : name === 'groq' ? 'Groq (fastest)' : 'OpenRouter'}
          </Chip>
        ))}
      </div>

      <Button fullWidth size="sm" className="mt-3" onClick={save}>
        {saved ? 'Saved ✓' : 'Save keys'}
      </Button>
      <Link to="/ai-status" className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline">
        <Activity size={13} /> Provider status & usage
      </Link>
    </div>
  );
}
