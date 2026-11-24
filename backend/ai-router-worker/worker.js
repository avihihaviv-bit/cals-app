/**
 * Multi-provider AI router — Cloudflare Worker.
 *
 * The app sends ONE provider-neutral request; this Worker picks a provider,
 * key and model that can actually do the job (text / image / web search),
 * and moves on to the next one when a provider is out of quota (429), busy
 * (5xx), the model is gone, or a key is rejected. Requests are tried one at a
 * time — never the same content to several providers in parallel.
 *
 * Provider API keys live ONLY here, as Worker secrets:
 *   GEMINI_API_KEYS, GROQ_API_KEYS, OPENROUTER_API_KEYS   (comma/newline separated)
 *   ROUTER_ACCESS_TOKEN                                     (the app's password for this Worker)
 * Optional plain variables:
 *   AI_PROVIDER_ORDER = "gemini,groq,openrouter"          (primary first, then backups)
 *   ALLOWED_ORIGINS   = "https://you.github.io"           (CORS; comma separated)
 *   <PROVIDER>_MODELS_FAST / _BALANCED / _BEST / _VISION   (override model lists, comma separated)
 *   MAX_ATTEMPTS (default 10), REQUEST_DEADLINE_MS (default 55000)
 * Optional KV binding ROUTER_STATE keeps cooldowns and usage stats across restarts.
 *
 * Adding a provider later: write an adapter (see PROVIDERS below) and add its
 * name to AI_PROVIDER_ORDER.
 *
 * Note: a second key from the same company is only extra capacity if the
 * provider counts it separately (Gemini counts quota per Google Cloud
 * project, not per key). This router just moves on when a key is limited; it
 * does not try to get around anyone's limits.
 */

// ---------------------------------------------------------------- utilities

const VERSION = '1.0.0';
const enc = new TextEncoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function splitList(v) {
  return String(v ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '-'); // "-" = deliberately empty list
}

function fingerprint(provider, index, key) {
  return `${provider}#${index + 1} …${String(key).slice(-4)}`;
}

/** Exponential backoff with full jitter: random in [base·2^n / 2, base·2^n], capped. */
export function backoffDelay(attempt, baseMs = 400, capMs = 4000, rand = Math.random) {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + rand() * (exp / 2));
}

/** Milliseconds until midnight Pacific time — when Gemini's free daily quota resets. */
function msUntilPacificMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const elapsed = ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) * 1000;
  return Math.max(60_000, 86_400_000 - elapsed);
}

function retryAfterMs(headers, bodyText) {
  const h = headers?.get?.('retry-after');
  if (h) {
    const n = Number(h);
    if (Number.isFinite(n)) return n * 1000;
    const at = Date.parse(h);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  const m = String(bodyText).match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) || String(bodyText).match(/try again in (\d+(?:\.\d+)?)s/i);
  return m ? Number(m[1]) * 1000 : null;
}

function errorText(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    return String(j?.error?.message ?? j?.message ?? bodyText).slice(0, 300);
  } catch {
    return String(bodyText).slice(0, 300);
  }
}

/**
 * Turns an HTTP failure into a decision. Kinds:
 *   auth              key rejected → this key is skipped
 *   rate_limit        429 → this key+model cools down (daily limits until reset)
 *   quota             out of credits (402) → this key cools down
 *   model_unavailable model gone / unsupported → this model is skipped for every key
 *   bad_param         a setting the model doesn't accept → retried without it
 *   server / network  transient → retried with backoff, then moves on
 *   too_large / bad_request / blocked → next provider
 */
export function classifyError(status, bodyText, headers) {
  const msg = errorText(bodyText);
  const lower = msg.toLowerCase();
  if (status === 401 || status === 403 || /api key not valid|api_key_invalid|invalid api key|invalid_api_key|unauthorized|no auth credentials/i.test(msg)) {
    // A 403 can also be "region not supported" or "model access" — still: this key can't do it here.
    return { kind: 'auth', message: msg };
  }
  if (status === 429) {
    const daily = /per ?day|perday|daily|requests per day|tokens per day|\bRPD\b|\bTPD\b/i.test(bodyText);
    return { kind: 'rate_limit', daily, retryAfterMs: retryAfterMs(headers, bodyText), message: msg };
  }
  if (status === 402) return { kind: 'quota', message: msg };
  if (status === 413) return { kind: 'too_large', message: msg };
  if (status >= 500) return { kind: 'server', message: msg };
  // A setting the model doesn't accept is fixable by resending without it — check before "model unavailable".
  if (status === 400 && /thinking/i.test(msg)) return { kind: 'bad_param', param: 'thinking', message: msg };
  if (status === 400 && /response_format|json_object|json mode|json_validate_failed/i.test(msg)) return { kind: 'bad_param', param: 'json', message: msg };
  if (status === 400 && /\bseed\b/i.test(msg)) return { kind: 'bad_param', param: 'seed', message: msg };
  if (status === 404 || /not found|does not exist|decommissioned|deprecated|no endpoints found|model_not_found|is not supported|unsupported model|not available/i.test(lower)) {
    return { kind: 'model_unavailable', message: msg };
  }
  return { kind: 'bad_request', message: msg };
}

/** Gemini's OpenAPI-style schema (uppercase types) → standard JSON Schema text for OpenAI-compatible providers. */
export function toJsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'propertyOrdering' || k === 'format') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toLowerCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toJsonSchema(pv)]));
    else if (k === 'items') out.items = toJsonSchema(v);
    else out[k] = v;
  }
  return out;
}

function jsonInstruction(schema) {
  return `\n\nOutput format: respond with ONLY one JSON object (no markdown, no code fences, no commentary) that follows this JSON Schema exactly:\n${JSON.stringify(toJsonSchema(schema))}`;
}

// ---------------------------------------------------------------- provider adapters

const TIER_ORDER = { fast: ['fast', 'balanced', 'best'], balanced: ['balanced', 'fast', 'best'], best: ['best', 'balanced', 'fast'] };

function modelsFromEnv(env, prefix, slot, defaults) {
  const v = env[`${prefix}_MODELS_${slot.toUpperCase()}`];
  return v ? splitList(v) : defaults;
}

/** Ordered, de-duplicated model list for a tier (falls back to the other tiers). */
function tieredModels(adapter, env, tier, capability) {
  const list = [];
  const add = (m) => !list.includes(m) && list.push(m);
  if (capability === 'vision') {
    modelsFromEnv(env, adapter.envPrefix, 'vision', adapter.defaults.vision ?? []).forEach(add);
    return list;
  }
  for (const t of TIER_ORDER[tier] ?? TIER_ORDER.balanced) modelsFromEnv(env, adapter.envPrefix, t, adapter.defaults[t] ?? []).forEach(add);
  return list;
}

const gemini = {
  name: 'gemini',
  envPrefix: 'GEMINI',
  keysVar: 'GEMINI_API_KEYS',
  capabilities: ['text', 'vision', 'web_search', 'json', 'stream'],
  // Each Gemini model has its own free quota, so the lists hold several distinct models. All of them read images.
  defaults: {
    fast: ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'],
    balanced: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    best: ['gemini-pro-latest', 'gemini-2.5-pro'],
    vision: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  },
  models(env, req) {
    if (req.capability === 'vision' && req.tier === 'best') return ['gemini-pro-latest', 'gemini-2.5-pro', ...tieredModels(this, env, req.tier, 'vision')];
    return tieredModels(this, env, req.tier, req.capability);
  },
  supportsModel() {
    return true;
  },
  request(req, model, key, opts) {
    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.parts.map((p) => (p.image ? { inline_data: { mime_type: p.image.mimeType, data: p.image.data } } : { text: p.text ?? '' })),
    }));
    const gc = {};
    if (req.maxTokens) gc.maxOutputTokens = req.maxTokens;
    // Gemini 3+ (and the -latest aliases, which now point at it) keep their own recommended temperature.
    const modern = /gemini-[3-9]/.test(model) || /-latest$/.test(model);
    if (req.deterministic && !opts.noSeed) gc.seed = 7;
    if (!modern) {
      if (req.deterministic) gc.temperature = 0;
      else if (typeof req.temperature === 'number') gc.temperature = req.temperature;
    }
    if (req.json?.schema && req.capability !== 'web_search') {
      gc.responseMimeType = 'application/json';
      gc.responseSchema = req.json.schema;
    }
    // Only explicit 2.5 Flash/Lite names get "no thinking" (faster); other models keep their defaults.
    if (!opts.noThinking && req.thinking === 'none' && /gemini-2\.5-flash/.test(model)) gc.thinkingConfig = { thinkingBudget: 0 };
    const body = {
      ...(req.system ? { system_instruction: { parts: [{ text: req.system }] } } : {}),
      contents,
      generationConfig: gc,
      ...(req.capability === 'web_search' ? { tools: [{ google_search: {} }] } : {}),
    };
    const action = req.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`,
      init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) },
    };
  },
  parse(data) {
    if (data?.promptFeedback?.blockReason) return { blocked: `blockReason: ${data.promptFeedback.blockReason}` };
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('');
    if (!text) return { empty: `finishReason ${cand?.finishReason ?? 'unknown'}` };
    const meta = cand?.groundingMetadata;
    const sources = (meta?.groundingChunks ?? [])
      .map((c) => c?.web)
      .filter((w) => w?.uri)
      .map((w) => ({ title: String(w.title ?? w.uri), url: String(w.uri) }));
    return { text, modelVersion: data?.modelVersion, grounding: meta ? { sources, queries: meta.webSearchQueries ?? [] } : undefined };
  },
  streamDelta(event) {
    return (event?.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('');
  },
};

/** Shared request/response handling for OpenAI-compatible APIs (Groq, OpenRouter). */
function openAICompatible({ name, envPrefix, keysVar, baseUrl, extraHeaders = () => ({}), defaults, isVisionModel, maxTokensField = 'max_tokens' }) {
  return {
    name,
    envPrefix,
    keysVar,
    capabilities: ['text', 'vision', 'json', 'stream'],
    defaults,
    models(env, req) {
      return tieredModels(this, env, req.tier, req.capability);
    },
    supportsModel(model, req) {
      return req.capability !== 'vision' || isVisionModel(model);
    },
    request(req, model, key, opts) {
      const system = (req.system ?? '') + (req.json?.schema ? jsonInstruction(req.json.schema) : '');
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      for (const m of req.messages) {
        const hasImage = m.parts.some((p) => p.image);
        messages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: hasImage
            ? m.parts.map((p) => (p.image ? { type: 'image_url', image_url: { url: `data:${p.image.mimeType};base64,${p.image.data}` } } : { type: 'text', text: p.text ?? '' }))
            : m.parts.map((p) => p.text ?? '').join('\n'),
        });
      }
      const body = { model, messages };
      if (req.maxTokens) body[maxTokensField] = req.maxTokens;
      if (req.deterministic) body.temperature = 0;
      else if (typeof req.temperature === 'number') body.temperature = req.temperature;
      if (req.deterministic && !opts.noSeed) body.seed = 7;
      if (req.json?.schema && !opts.noJson) body.response_format = { type: 'json_object' };
      if (req.stream) body.stream = true;
      return {
        url: `${baseUrl}/chat/completions`,
        init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extraHeaders() }, body: JSON.stringify(body) },
      };
    },
    parse(data) {
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      const text = Array.isArray(content) ? content.map((c) => c?.text ?? '').join('') : typeof content === 'string' ? content : '';
      if (data?.error) return { failed: errorText(JSON.stringify(data)) };
      if (choice?.finish_reason === 'content_filter') return { blocked: 'content_filter' };
      if (!text) return { empty: `finish_reason ${choice?.finish_reason ?? 'unknown'}` };
      return { text, modelVersion: data?.model };
    },
    streamDelta(event) {
      return event?.choices?.[0]?.delta?.content ?? '';
    },
  };
}

const groq = openAICompatible({
  name: 'groq',
  envPrefix: 'GROQ',
  keysVar: 'GROQ_API_KEYS',
  baseUrl: 'https://api.groq.com/openai/v1',
  maxTokensField: 'max_completion_tokens',
  defaults: {
    fast: ['llama-3.1-8b-instant'],
    balanced: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
    best: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    vision: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
  },
  isVisionModel: (m) => /llama-4|vision|-vl\b|scout|maverick/i.test(m),
});

const openrouter = openAICompatible({
  name: 'openrouter',
  envPrefix: 'OPENROUTER',
  keysVar: 'OPENROUTER_API_KEYS',
  baseUrl: 'https://openrouter.ai/api/v1',
  extraHeaders: () => ({ 'http-referer': 'https://github.com/cals-app', 'x-title': 'Nutrition AI' }),
  defaults: {
    fast: ['meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'],
    balanced: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    best: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    vision: ['meta-llama/llama-4-maverick:free', 'google/gemma-3-27b-it:free', 'qwen/qwen2.5-vl-72b-instruct:free'],
  },
  isVisionModel: (m) => openrouterVision.has(m) || /vision|-vl|llama-4|gemma-3|gemini|gpt-4o|pixtral|claude/i.test(m),
});

// OpenRouter publishes which free models exist and which read images — use that instead of guessing.
const openrouterVision = new Set();
let openrouterDiscovery = { at: 0, text: [], vision: [] };
async function discoverOpenRouter(env, fetchImpl) {
  if (env.OPENROUTER_DISCOVER === 'false') return;
  if (Date.now() - openrouterDiscovery.at < 6 * 3600_000) return;
  openrouterDiscovery.at = Date.now();
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models', { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    const free = (data?.data ?? []).filter((m) => typeof m.id === 'string' && m.id.endsWith(':free'));
    const vision = free.filter((m) => (m.architecture?.input_modalities ?? []).includes('image')).map((m) => m.id);
    vision.forEach((id) => openrouterVision.add(id));
    openrouterDiscovery = { at: Date.now(), text: free.map((m) => m.id), vision };
  } catch {
    /* discovery is a bonus — the default list still works */
  }
}

export const PROVIDERS = { gemini, groq, openrouter };

// ---------------------------------------------------------------- state (cooldowns, usage, logs)

function freshState() {
  return { cooldowns: {}, stats: {}, keyStats: {}, logs: [], lastSuccess: null, loadedAt: Date.now() };
}

export class RouterState {
  constructor() {
    this.s = freshState();
    this.dirty = false;
  }
  async load(kv) {
    if (!kv || this.loadedFromKv) return;
    this.loadedFromKv = true;
    try {
      const saved = await kv.get('state', 'json');
      if (saved && typeof saved === 'object') this.s = { ...freshState(), ...saved };
    } catch {
      /* start fresh */
    }
  }
  async save(kv) {
    if (!kv || !this.dirty) return;
    this.dirty = false;
    try {
      await kv.put('state', JSON.stringify(this.s));
    } catch {
      /* ignore */
    }
  }
  coolingUntil(id) {
    const until = this.s.cooldowns[id]?.until ?? 0;
    return until > Date.now() ? until : 0;
  }
  coolDown(id, ms, reason) {
    this.s.cooldowns[id] = { until: Date.now() + ms, reason };
    this.dirty = true;
  }
  record({ provider, keyId, model, capability, outcome, status, ms, kind, message }) {
    const st = (this.s.stats[provider] ??= { requests: 0, successes: 0, failures: 0, totalMs: 0, byKind: {}, lastError: null, lastUsed: null });
    const ks = (this.s.keyStats[keyId] ??= { requests: 0, successes: 0, failures: 0, lastError: null, lastUsed: null });
    st.requests++;
    ks.requests++;
    st.lastUsed = ks.lastUsed = new Date().toISOString();
    if (outcome === 'ok') {
      st.successes++;
      ks.successes++;
      st.totalMs += ms;
      this.s.lastSuccess = { provider, model, at: st.lastUsed };
    } else {
      st.failures++;
      ks.failures++;
      st.byKind[kind] = (st.byKind[kind] ?? 0) + 1;
      st.lastError = ks.lastError = { kind, status, message: String(message ?? '').slice(0, 160), at: st.lastUsed };
    }
    const entry = { at: st.lastUsed, provider, key: keyId, model, capability, outcome, kind, status, ms };
    this.s.logs.unshift(entry);
    this.s.logs.length = Math.min(this.s.logs.length, 100);
    this.dirty = true;
    console.log(JSON.stringify({ event: 'ai_attempt', ...entry }));
  }
}

// ---------------------------------------------------------------- the router

export class RouterError extends Error {
  constructor(code, message, attempts, status = 502) {
    super(message);
    this.code = code;
    this.attempts = attempts;
    this.status = status;
  }
}

function keysFor(adapter, env) {
  return splitList(env[adapter.keysVar]);
}

function providerOrder(env) {
  const order = splitList(env.AI_PROVIDER_ORDER || 'gemini,groq,openrouter').filter((p) => PROVIDERS[p]);
  return order.length ? order : ['gemini', 'groq', 'openrouter'];
}

/** Every (provider, key, model) that can handle this request, in preference order. */
export function planTargets(req, env, state) {
  const targets = [];
  for (const pname of providerOrder(env)) {
    const adapter = PROVIDERS[pname];
    if (!adapter.capabilities.includes(req.capability)) continue; // e.g. no web search outside Gemini
    if (req.stream && !adapter.capabilities.includes('stream')) continue;
    const keys = keysFor(adapter, env);
    if (!keys.length) continue;
    let models = adapter.models(env, req);
    if (pname === 'openrouter' && openrouterDiscovery.at) {
      const found = req.capability === 'vision' ? openrouterDiscovery.vision : openrouterDiscovery.text;
      // Prefer models OpenRouter currently lists; keep configured ones that are still listed.
      if (found.length) models = [...models.filter((m) => found.includes(m)), ...found.filter((m) => !models.includes(m))].slice(0, 6);
    }
    models = models.filter((m) => adapter.supportsModel(m, req));
    // Rotate keys inside each model: a limited key hands over to the next key before the next model.
    for (const model of models) {
      keys.forEach((key, i) => targets.push({ provider: pname, adapter, key, keyIndex: i, keyId: fingerprint(pname, i, key), model }));
    }
  }
  return targets.filter((t) => !state.coolingUntil(`key:${t.keyId}`) && !state.coolingUntil(`model:${t.provider}:${t.model}`) && !state.coolingUntil(`km:${t.keyId}:${t.model}`));
}

function normalizeRequest(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const clean = messages
    .filter((m) => m && Array.isArray(m.parts))
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      parts: m.parts
        .map((p) => (p?.image && typeof p.image.data === 'string' ? { image: { mimeType: String(p.image.mimeType || 'image/jpeg'), data: p.image.data } } : typeof p?.text === 'string' ? { text: p.text } : null))
        .filter(Boolean),
    }))
    .filter((m) => m.parts.length);
  if (!clean.length) throw new RouterError('bad_request', 'messages must contain at least one text or image part', [], 400);
  const hasImage = clean.some((m) => m.parts.some((p) => p.image));
  let capability = body.capability === 'web_search' ? 'web_search' : hasImage ? 'vision' : 'text';
  if (body.capability === 'vision' && !hasImage) capability = 'text';
  return {
    capability,
    tier: ['fast', 'balanced', 'best'].includes(body.tier) ? body.tier : 'balanced',
    system: typeof body.system === 'string' ? body.system : '',
    messages: clean,
    json: body.json?.schema ? { schema: body.json.schema } : null,
    maxTokens: Math.min(16384, Math.max(64, Number(body.maxTokens) || 4096)),
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    deterministic: !!body.deterministic,
    thinking: body.thinking === 'none' ? 'none' : 'default',
    stream: !!body.stream,
    // Web research can take a minute or two; everything else gets the default deadline.
    deadlineMs: Number(body.deadlineMs) > 0 ? Math.min(150_000, Math.max(5_000, Number(body.deadlineMs))) : 0,
  };
}

async function timedFetch(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Runs one request through the providers. Each target is tried at most once
 * (plus bounded transient retries), with a hard cap on attempts and time, so
 * it can never bounce between providers forever.
 */
export async function routeRequest(rawBody, env, state, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const rand = deps.random ?? Math.random;
  const req = normalizeRequest(rawBody);
  if (providerOrder(env).includes('openrouter') && keysFor(openrouter, env).length) await discoverOpenRouter(env, fetchImpl);

  const maxAttempts = Math.max(1, Number(env.MAX_ATTEMPTS) || 10);
  // Each provider gets a share, so a provider with many keys × models can't use up every attempt before the backups get a turn.
  const perProvider = Math.max(1, Number(env.MAX_ATTEMPTS_PER_PROVIDER) || 5);
  const usedBy = {};
  const deadline = Date.now() + (req.deadlineMs || Number(env.REQUEST_DEADLINE_MS) || 55_000);
  const attempts = [];
  const targets = planTargets(req, env, state);
  if (!targets.length) {
    const anyKeys = providerOrder(env).some((p) => keysFor(PROVIDERS[p], env).length);
    throw new RouterError(
      anyKeys ? 'all_cooling' : 'no_providers',
      anyKeys
        ? `No provider can take a "${req.capability}" request right now — every suitable key/model is resting after a limit or error.`
        : 'No AI provider keys are configured on the server.',
      attempts,
      503,
    );
  }

  let sawDaily = false;
  let sawRate = false;
  let sawAuth = false;
  for (const t of targets) {
    if (attempts.length >= maxAttempts || Date.now() > deadline) break;
    // A cooldown set earlier in this same request (e.g. key rejected) skips the remaining models for it.
    if (state.coolingUntil(`key:${t.keyId}`) || state.coolingUntil(`model:${t.provider}:${t.model}`)) continue;
    if ((usedBy[t.provider] ?? 0) >= perProvider) continue;

    const opts = {};
    for (let transient = 0; transient < 3; transient++) {
      if (attempts.length >= maxAttempts || Date.now() > deadline) break;
      const started = Date.now();
      usedBy[t.provider] = (usedBy[t.provider] ?? 0) + 1;
      const { url, init } = t.adapter.request(req, t.model, t.key, opts);
      const timeoutMs = Math.min(req.capability === 'web_search' ? 90_000 : 40_000, Math.max(1000, deadline - Date.now()));
      let res;
      try {
        res = await timedFetch(fetchImpl, url, init, timeoutMs);
      } catch (err) {
        const ms = Date.now() - started;
        const kind = err?.name === 'AbortError' ? 'timeout' : 'network';
        attempts.push({ provider: t.provider, key: t.keyId, model: t.model, kind, ms });
        state.record({ provider: t.provider, keyId: t.keyId, model: t.model, capability: req.capability, outcome: 'fail', kind, ms, message: String(err) });
        if (kind === 'timeout') break; // a slow model gets no second chance — next target
        await wait(backoffDelay(transient, 400, 4000, rand));
        continue;
      }
      const ms = Date.now() - started;

      if (res.ok && req.stream) {
        state.record({ provider: t.provider, keyId: t.keyId, model: t.model, capability: req.capability, outcome: 'ok', status: res.status, ms });
        attempts.push({ provider: t.provider, key: t.keyId, model: t.model, kind: 'ok', ms });
        return { stream: res.body, target: t, attempts };
      }

      const text = await res.text();
      if (res.ok) {
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          /* fall through */
        }
        const parsed = data ? t.adapter.parse(data) : { empty: 'unreadable body' };
        if (parsed.text) {
          state.record({ provider: t.provider, keyId: t.keyId, model: t.model, capability: req.capability, outcome: 'ok', status: res.status, ms });
          attempts.push({ provider: t.provider, key: t.keyId, model: t.model, kind: 'ok', ms });
          return {
            text: parsed.text,
            provider: t.provider,
            model: parsed.modelVersion || t.model,
            key: t.keyId,
            grounding: parsed.grounding,
            latencyMs: ms,
            attempts,
          };
        }
        const kind = parsed.blocked ? 'blocked' : 'empty';
        attempts.push({ provider: t.provider, key: t.keyId, model: t.model, kind, ms });
        state.record({ provider: t.provider, keyId: t.keyId, model: t.model, capability: req.capability, outcome: 'fail', kind, status: res.status, ms, message: parsed.blocked || parsed.empty || parsed.failed });
        break; // next target
      }

      const c = classifyError(res.status, text, res.headers);
      attempts.push({ provider: t.provider, key: t.keyId, model: t.model, kind: c.kind, status: res.status, ms });
      state.record({ provider: t.provider, keyId: t.keyId, model: t.model, capability: req.capability, outcome: 'fail', kind: c.kind, status: res.status, ms, message: c.message });

      if (c.kind === 'bad_param') {
        const flag = { thinking: 'noThinking', json: 'noJson', seed: 'noSeed' }[c.param];
        if (flag && !opts[flag]) {
          opts[flag] = true;
          transient--; // a settings fix isn't a transient retry
          continue;
        }
        break;
      }
      if (c.kind === 'server') {
        if (transient < 1) {
          await wait(backoffDelay(transient, 500, 4000, rand));
          continue;
        }
        // An overloaded model is overloaded for every key — move on to a different model.
        state.coolDown(`model:${t.provider}:${t.model}`, 60_000, 'server errors');
        break;
      }
      if (c.kind === 'rate_limit') {
        sawRate = true;
        if (c.daily) sawDaily = true;
        const ms2 = c.daily ? (t.provider === 'gemini' ? msUntilPacificMidnight() : Math.max(c.retryAfterMs ?? 0, 3600_000)) : Math.min(15 * 60_000, Math.max(5_000, c.retryAfterMs ?? 60_000));
        // A very short wait on a non-daily limit: one polite retry after backoff instead of abandoning the model.
        if (!c.daily && (c.retryAfterMs ?? Infinity) <= 2000 && transient < 1) {
          await wait(Math.max(c.retryAfterMs, backoffDelay(transient, 500, 2000, rand)));
          continue;
        }
        state.coolDown(`km:${t.keyId}:${t.model}`, ms2, c.daily ? 'daily limit' : 'rate limit');
        break;
      }
      if (c.kind === 'auth') {
        sawAuth = true;
        state.coolDown(`key:${t.keyId}`, 6 * 3600_000, 'key rejected');
        break;
      }
      if (c.kind === 'quota') {
        state.coolDown(`key:${t.keyId}`, 3600_000, 'out of credits');
        break;
      }
      if (c.kind === 'model_unavailable') {
        state.coolDown(`model:${t.provider}:${t.model}`, 6 * 3600_000, 'model unavailable');
        break;
      }
      break; // too_large / bad_request → next target
    }
  }

  const code = sawDaily && attempts.every((a) => a.kind === 'rate_limit' || a.kind === 'server') ? 'daily_limit' : sawRate ? 'rate_limited' : sawAuth && attempts.every((a) => a.kind === 'auth') ? 'auth' : 'exhausted';
  const messages = {
    daily_limit: 'Every provider that can do this has used up its free daily limit.',
    rate_limited: 'All suitable providers are rate-limited right now — try again in a minute.',
    auth: 'Every configured key was rejected by its provider — check the keys in the Worker settings.',
    exhausted: 'No provider could answer this request.',
  };
  throw new RouterError(code, messages[code], attempts, code === 'auth' ? 502 : 503);
}

// ---------------------------------------------------------------- streaming normalization

/** Upstream SSE (Gemini or OpenAI style) → our SSE: data: {"delta":"…"} … data: {"done":true,…}. */
export function normalizeStream(upstream, adapter, meta) {
  let buffer = '';
  const decoder = new TextDecoder();
  return upstream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const m = line.match(/^data:\s?(.*)$/);
          if (!m || !m[1] || m[1] === '[DONE]') continue;
          try {
            const delta = adapter.streamDelta(JSON.parse(m[1]));
            if (delta) controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          } catch {
            /* keep-alive or partial line */
          }
        }
      },
      flush(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`));
      },
    }),
  );
}

// ---------------------------------------------------------------- HTTP

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = splitList(env.ALLOWED_ORIGINS || 'https://avihihaviv-bit.github.io,http://localhost:5173,http://localhost:4173,http://localhost:4311');
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Safe status: which providers/keys exist and how they're doing — never the keys themselves. */
export function statusReport(env, state) {
  const now = Date.now();
  const cooling = (id) => {
    const c = state.s.cooldowns[id];
    return c && c.until > now ? { until: new Date(c.until).toISOString(), reason: c.reason } : null;
  };
  const providers = providerOrder(env).map((pname, rank) => {
    const adapter = PROVIDERS[pname];
    const keys = keysFor(adapter, env).map((k, i) => {
      const id = fingerprint(pname, i, k);
      const modelCooldowns = Object.entries(state.s.cooldowns)
        .filter(([cid, c]) => cid.startsWith(`km:${id}:`) && c.until > now)
        .map(([cid, c]) => ({ model: cid.slice(`km:${id}:`.length), until: new Date(c.until).toISOString(), reason: c.reason }));
      // Usable = key not rejected AND at least one of its models (text or image) not resting.
      const models = new Set([...adapter.models(env, { capability: 'text', tier: 'balanced' }), ...adapter.models(env, { capability: 'vision', tier: 'balanced' })]);
      const usableModels = [...models].filter((m) => !cooling(`km:${id}:${m}`) && !cooling(`model:${pname}:${m}`)).length;
      return { id, cooldown: cooling(`key:${id}`), modelCooldowns, usableModels, stats: state.s.keyStats[id] ?? null };
    });
    const st = state.s.stats[pname];
    return {
      name: pname,
      role: rank === 0 ? 'primary' : 'backup',
      configured: keys.length > 0,
      available: keys.some((k) => !k.cooldown && k.usableModels > 0),
      capabilities: adapter.capabilities,
      keys,
      stats: st ? { ...st, avgMs: st.successes ? Math.round(st.totalMs / st.successes) : null } : null,
    };
  });
  return {
    version: VERSION,
    order: providerOrder(env),
    lastSuccess: state.s.lastSuccess,
    providers,
    logs: state.s.logs.slice(0, 50),
    persistent: !!env.ROUTER_STATE,
  };
}

const globalState = new RouterState();

export async function handleRequest(request, env, ctx, deps = {}) {
  const state = deps.state ?? globalState;
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/v1/health') return json({ ok: true, version: VERSION }, 200, cors);

  if (!env.ROUTER_ACCESS_TOKEN) return json({ error: { code: 'not_configured', message: 'Set the ROUTER_ACCESS_TOKEN secret first.' } }, 503, cors);
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(token, env.ROUTER_ACCESS_TOKEN)) return json({ error: { code: 'unauthorized', message: 'Wrong or missing access token.' } }, 401, cors);

  await state.load(env.ROUTER_STATE);
  const persist = () => ctx?.waitUntil?.(state.save(env.ROUTER_STATE));

  if (url.pathname === '/v1/status' && request.method === 'GET') {
    return json(statusReport(env, state), 200, cors);
  }
  if (url.pathname === '/v1/generate' && request.method === 'POST') {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 10_000_000) return json({ error: { code: 'too_large', message: 'Request too large.' } }, 413, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'bad_request', message: 'Body must be JSON.' } }, 400, cors);
    }
    try {
      const out = await routeRequest(body, env, state, deps);
      persist();
      if (out.stream) {
        const meta = { provider: out.target.provider, model: out.target.model, key: out.target.keyId };
        return new Response(normalizeStream(out.stream, out.target.adapter, meta), {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-ai-provider': meta.provider, 'x-ai-model': meta.model, ...cors },
        });
      }
      return json(out, 200, cors);
    } catch (err) {
      persist();
      if (err instanceof RouterError) return json({ error: { code: err.code, message: err.message }, attempts: err.attempts }, err.status, cors);
      return json({ error: { code: 'internal', message: String(err?.message ?? err).slice(0, 200) } }, 500, cors);
    }
  }
  return json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, 404, cors);
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
