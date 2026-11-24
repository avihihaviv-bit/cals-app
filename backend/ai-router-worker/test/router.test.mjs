// Run: node --test backend/ai-router-worker/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, RouterState, routeRequest, classifyError, backoffDelay, toJsonSchema, planTargets } from '../worker.js';

const ENV = {
  ROUTER_ACCESS_TOKEN: 'secret-token',
  GEMINI_API_KEYS: 'AIzaGEMINI_KEY_ONE,AIzaGEMINI_KEY_TWO',
  GROQ_API_KEYS: 'gsk_GROQ_KEY_1',
  OPENROUTER_API_KEYS: 'sk-or-OPENROUTER_1',
  AI_PROVIDER_ORDER: 'gemini,groq,openrouter',
  OPENROUTER_DISCOVER: 'false',
};

const geminiOk = (text) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: 'gemini-2.5-flash' } });
const openaiOk = (text, model = 'm') => ({ status: 200, body: { model, choices: [{ message: { content: text }, finish_reason: 'stop' }] } });
const err = (status, message, headers = {}) => ({ status, body: { error: { message } }, headers });

/** fetch mock: `handler(url, body, init)` returns {status, body, headers} or throws. Records every call. */
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, headers: init.headers });
    const r = await handler(url, body, init);
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
  };
  fn.calls = calls;
  return fn;
}
const deps = (fetch) => ({ fetch, sleep: async () => {}, random: () => 0.5 });
const textReq = { messages: [{ role: 'user', parts: [{ text: 'hello' }] }] };
const imageReq = { messages: [{ role: 'user', parts: [{ image: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: 'what food?' }] }] };
const host = (u) => new URL(u).host;

test('primary answers → no other provider is called', async () => {
  const f = mockFetch(() => geminiOk('hi'));
  const out = await routeRequest(textReq, ENV, new RouterState(), deps(f));
  assert.equal(out.text, 'hi');
  assert.equal(out.provider, 'gemini');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].headers['x-goog-api-key'], 'AIzaGEMINI_KEY_ONE');
});

test('429 on Gemini → next key, then next model, then Groq (one at a time, never in parallel)', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const f = mockFetch(async (url) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    if (host(url).includes('googleapis')) return err(429, 'Resource has been exhausted (e.g. check quota).');
    return openaiOk('from groq', 'llama-3.3-70b-versatile');
  });
  const out = await routeRequest(textReq, { ...ENV, GEMINI_MODELS_BALANCED: 'gemini-flash-latest', GEMINI_MODELS_FAST: 'gemini-flash-lite-latest', GEMINI_MODELS_BEST: '-' }, new RouterState(), deps(f));
  assert.equal(out.provider, 'groq');
  assert.equal(out.text, 'from groq');
  assert.equal(maxInFlight, 1, 'requests must be sequential');
  const gem = f.calls.filter((c) => host(c.url).includes('googleapis'));
  assert.ok(gem.length >= 2);
  assert.equal(gem[0].headers['x-goog-api-key'], 'AIzaGEMINI_KEY_ONE');
  assert.equal(gem[1].headers['x-goog-api-key'], 'AIzaGEMINI_KEY_TWO', 'second key tried before giving up on the model');
});

test('rate-limited key/model rests: the next request skips it without calling it', async () => {
  const state = new RouterState();
  const env = { ...ENV, GEMINI_API_KEYS: 'AIzaONLY_KEY', GEMINI_MODELS_BALANCED: 'gemini-flash-latest', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' };
  const f1 = mockFetch((url) => (host(url).includes('googleapis') ? err(429, 'quota', { 'retry-after': '120' }) : openaiOk('groq')));
  await routeRequest(textReq, env, state, deps(f1));
  const f2 = mockFetch(() => openaiOk('groq again'));
  const out = await routeRequest(textReq, env, state, deps(f2));
  assert.equal(out.provider, 'groq');
  assert.ok(!f2.calls.some((c) => host(c.url).includes('googleapis')), 'cooling Gemini model not retried');
});

test('daily Gemini limit rests until the daily reset, not one minute', async () => {
  const state = new RouterState();
  const env = { ...ENV, GEMINI_API_KEYS: 'AIzaONLY_KEY', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' };
  const f = mockFetch((url) => (host(url).includes('googleapis') ? err(429, 'quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier') : openaiOk('ok')));
  await routeRequest(textReq, env, state, deps(f));
  const cd = Object.entries(state.s.cooldowns).find(([id]) => id.includes('gemini-2.5-flash'));
  assert.ok(cd, 'cooldown recorded');
  assert.equal(cd[1].reason, 'daily limit');
  assert.ok(cd[1].until - Date.now() > 60_000);
});

test('rejected key (401/invalid) is skipped for all its models; other key still used', async () => {
  const state = new RouterState();
  const f = mockFetch((url, body, init) => {
    if (init.headers['x-goog-api-key'] === 'AIzaGEMINI_KEY_ONE') return err(400, 'API key not valid. Please pass a valid API key.');
    return geminiOk('second key works');
  });
  const out = await routeRequest(textReq, ENV, state, deps(f));
  assert.equal(out.text, 'second key works');
  assert.equal(classifyError(400, JSON.stringify({ error: { message: 'API key not valid' } })).kind, 'auth');
  assert.ok(state.coolingUntil('key:gemini#1 …_ONE'));
  // next request never touches the bad key
  const f2 = mockFetch(() => geminiOk('ok'));
  await routeRequest(textReq, ENV, state, deps(f2));
  assert.ok(f2.calls.every((c) => c.headers['x-goog-api-key'] !== 'AIzaGEMINI_KEY_ONE'));
});

test('auth vs rate limit are told apart', () => {
  assert.equal(classifyError(401, '{"error":{"message":"Invalid API Key"}}').kind, 'auth');
  assert.equal(classifyError(403, '{}').kind, 'auth');
  assert.equal(classifyError(429, '{"error":{"message":"Rate limit reached"}}').kind, 'rate_limit');
  assert.equal(classifyError(429, 'tokens per day (TPD)').daily, true);
  assert.equal(classifyError(503, 'overloaded').kind, 'server');
  assert.equal(classifyError(404, 'model not found').kind, 'model_unavailable');
  assert.equal(classifyError(400, 'The model `x` has been decommissioned').kind, 'model_unavailable');
  assert.equal(classifyError(402, 'insufficient credits').kind, 'quota');
});

test('503 is retried once with backoff on the same model, then moves on', async () => {
  const waits = [];
  let n = 0;
  const f = mockFetch((url) => {
    if (host(url).includes('googleapis')) {
      n++;
      return n <= 2 ? err(503, 'The model is overloaded.') : geminiOk('later model');
    }
    return openaiOk('x');
  });
  const out = await routeRequest(textReq, ENV, new RouterState(), { fetch: f, sleep: async (ms) => waits.push(ms), random: () => 0.5 });
  assert.equal(out.text, 'later model');
  assert.equal(waits.length, 1, 'one backoff wait');
  assert.ok(waits[0] >= 250 && waits[0] <= 500);
  assert.equal(f.calls[0].url, f.calls[1].url, 'retried same model');
  assert.notEqual(f.calls[1].url, f.calls[2].url, 'then moved to another model');
});

test('backoff grows exponentially with jitter and a cap', () => {
  assert.equal(backoffDelay(0, 400, 4000, () => 0), 200);
  assert.equal(backoffDelay(0, 400, 4000, () => 1), 400);
  assert.equal(backoffDelay(2, 400, 4000, () => 1), 1600);
  assert.equal(backoffDelay(10, 400, 4000, () => 1), 4000);
});

test('an image request only goes to models that read images', async () => {
  const f = mockFetch((url, body) => {
    if (host(url).includes('googleapis')) return err(429, 'quota');
    return openaiOk('{"items":[]}', body.model);
  });
  const out = await routeRequest(imageReq, ENV, new RouterState(), deps(f));
  assert.equal(out.provider, 'groq');
  const groqCalls = f.calls.filter((c) => host(c.url) === 'api.groq.com');
  assert.ok(groqCalls.length >= 1);
  assert.ok(groqCalls.every((c) => /llama-4/.test(c.body.model)), `text-only Groq models must not get images: ${groqCalls.map((c) => c.body.model)}`);
  const content = groqCalls[0].body.messages.at(-1).content;
  assert.equal(content[0].type, 'image_url');
  assert.match(content[0].image_url.url, /^data:image\/jpeg;base64,AAAA$/);
});

test('web search only goes to providers that can search (Gemini)', () => {
  const targets = planTargets({ capability: 'web_search', tier: 'best', messages: [], stream: false }, ENV, new RouterState());
  assert.ok(targets.length > 0);
  assert.ok(targets.every((t) => t.provider === 'gemini'));
});

test('no endless switching: everything failing stops after the attempt cap', async () => {
  const f = mockFetch(() => err(500, 'boom'));
  await assert.rejects(routeRequest(textReq, { ...ENV, MAX_ATTEMPTS: '6' }, new RouterState(), deps(f)), (e) => e.code === 'exhausted');
  assert.equal(f.calls.length, 6);
});

test('every suitable target cooling → fails fast without calling anyone', async () => {
  const state = new RouterState();
  const env = { ...ENV, GEMINI_API_KEYS: 'AIzaK', GROQ_API_KEYS: '', OPENROUTER_API_KEYS: '', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' };
  const f1 = mockFetch(() => err(429, 'PerDay quota'));
  await assert.rejects(routeRequest(textReq, env, state, deps(f1)), (e) => e.code === 'daily_limit');
  const f2 = mockFetch(() => geminiOk('x'));
  await assert.rejects(routeRequest(textReq, env, state, deps(f2)), (e) => e.code === 'all_cooling');
  assert.equal(f2.calls.length, 0);
});

test('unknown/retired model is skipped for every key', async () => {
  const state = new RouterState();
  const f = mockFetch((url) => (url.includes('gemini-flash-latest') ? err(404, 'models/gemini-flash-latest is not found') : geminiOk('ok')));
  await routeRequest(textReq, ENV, state, deps(f));
  assert.equal(f.calls.filter((c) => c.url.includes('gemini-flash-latest')).length, 1, 'not retried with the second key');
  assert.ok(state.coolingUntil('model:gemini:gemini-flash-latest'));
});

test('JSON schema: Gemini gets responseSchema; OpenAI-compatible providers get json_object + schema text', async () => {
  const schema = { type: 'OBJECT', properties: { a: { type: 'STRING', format: 'enum', enum: ['x'] } }, propertyOrdering: ['a'] };
  assert.deepEqual(toJsonSchema(schema), { type: 'object', properties: { a: { type: 'string', enum: ['x'] } } });
  const f = mockFetch((url) => (host(url).includes('googleapis') ? err(429, 'q') : openaiOk('{"a":"x"}')));
  await routeRequest({ ...textReq, json: { schema } }, { ...ENV, GEMINI_API_KEYS: 'AIzaK', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' }, new RouterState(), deps(f));
  assert.deepEqual(f.calls[0].body.generationConfig.responseSchema, schema);
  const g = f.calls.find((c) => host(c.url) === 'api.groq.com');
  assert.deepEqual(g.body.response_format, { type: 'json_object' });
  assert.match(g.body.messages[0].content, /JSON Schema/);
});

test('a model that refuses json mode is retried once without it', async () => {
  let first = true;
  const f = mockFetch((url, body) => {
    if (host(url).includes('googleapis')) return err(429, 'q');
    if (first && body.response_format) {
      first = false;
      return err(400, 'response_format json_object is not supported for this model');
    }
    return openaiOk('{"ok":true}');
  });
  const out = await routeRequest({ ...textReq, json: { schema: { type: 'OBJECT' } } }, { ...ENV, GEMINI_API_KEYS: 'AIzaK', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' }, new RouterState(), deps(f));
  assert.equal(out.text, '{"ok":true}');
  const groq = f.calls.filter((c) => host(c.url) === 'api.groq.com');
  assert.equal(groq.length, 2);
  assert.ok(!groq[1].body.response_format);
});

test('tier picks the model: fast → lite/8b, best → pro', async () => {
  const f = mockFetch(() => geminiOk('x'));
  await routeRequest({ ...textReq, tier: 'fast' }, ENV, new RouterState(), deps(f));
  assert.match(f.calls[0].url, /flash-lite/);
  const f2 = mockFetch(() => geminiOk('x'));
  await routeRequest({ ...textReq, tier: 'best' }, ENV, new RouterState(), deps(f2));
  assert.match(f2.calls[0].url, /pro/);
  const f3 = mockFetch((url, body) => (host(url).includes('googleapis') ? err(429, 'q') : openaiOk('x', body.model)));
  await routeRequest({ ...textReq, tier: 'fast' }, { ...ENV, GEMINI_API_KEYS: 'AIzaK', GEMINI_MODELS_FAST: 'gemini-2.5-flash-lite', GEMINI_MODELS_BALANCED: '-', GEMINI_MODELS_BEST: '-' }, new RouterState(), deps(f3));
  assert.equal(f3.calls.find((c) => host(c.url) === 'api.groq.com').body.model, 'llama-3.1-8b-instant');
});

test('streaming: Gemini and OpenAI-style streams are normalized; falls back before the stream starts', async () => {
  const sse = (lines) => new Response(lines.map((l) => `data: ${l}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const fetch = async (url) => {
    if (url.includes('googleapis')) return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
    return sse([JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }), JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }), '[DONE]']);
  };
  const req = new Request('https://w/v1/generate', { method: 'POST', headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' }, body: JSON.stringify({ ...textReq, stream: true }) });
  const res = await handleRequest(req, { ...ENV, GEMINI_API_KEYS: 'AIzaK', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' }, null, { state: new RouterState(), fetch, sleep: async () => {}, random: () => 0.5 });
  assert.equal(res.headers.get('x-ai-provider'), 'groq');
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, '')));
  assert.equal(events.filter((e) => e.delta).map((e) => e.delta).join(''), 'Hello');
  assert.equal(events.at(-1).done, true);

  const gfetch = async () => sse([JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Sha' }] } }] }), JSON.stringify({ candidates: [{ content: { parts: [{ text: 'lom' }] } }] })]);
  const req2 = new Request('https://w/v1/generate', { method: 'POST', headers: { authorization: 'Bearer secret-token' }, body: JSON.stringify({ ...textReq, stream: true }) });
  const res2 = await handleRequest(req2, ENV, null, { state: new RouterState(), fetch: gfetch, sleep: async () => {} });
  assert.match(await res2.text(), /"delta":"Sha"[\s\S]*"delta":"lom"/);
});

test('HTTP: token required; status never reveals keys; CORS', async () => {
  const state = new RouterState();
  const call = (path, init = {}) => handleRequest(new Request(`https://w${path}`, init), ENV, null, { state, fetch: async () => { throw new Error('should not call'); } });
  assert.equal((await call('/v1/health')).status, 200);
  assert.equal((await call('/v1/status')).status, 401);
  assert.equal((await call('/v1/status', { headers: { authorization: 'Bearer wrong-token!' } })).status, 401);
  const res = await call('/v1/status', { headers: { authorization: 'Bearer secret-token', origin: 'https://avihihaviv-bit.github.io' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://avihihaviv-bit.github.io');
  const raw = await res.text();
  for (const secret of ['AIzaGEMINI_KEY_ONE', 'gsk_GROQ_KEY_1', 'sk-or-OPENROUTER_1', 'secret-token']) assert.ok(!raw.includes(secret), `leaked ${secret}`);
  const st = JSON.parse(raw);
  assert.deepEqual(st.order, ['gemini', 'groq', 'openrouter']);
  assert.equal(st.providers[0].role, 'primary');
  assert.equal(st.providers[0].keys.length, 2);
  const unconfigured = await handleRequest(new Request('https://w/v1/status', { headers: { authorization: 'Bearer x' } }), { GEMINI_API_KEYS: 'k' }, null, { state });
  assert.equal(unconfigured.status, 503, 'no token configured → closed, not an open proxy');
});

test('usage stats and logs are recorded per provider and key', async () => {
  const state = new RouterState();
  const f = mockFetch((url) => (host(url).includes('googleapis') ? err(429, 'q') : openaiOk('x')));
  await routeRequest(textReq, { ...ENV, GEMINI_API_KEYS: 'AIzaK', GEMINI_MODELS_BALANCED: 'gemini-2.5-flash', GEMINI_MODELS_FAST: '-', GEMINI_MODELS_BEST: '-' }, state, deps(f));
  assert.equal(state.s.stats.gemini.failures, 1);
  assert.equal(state.s.stats.gemini.byKind.rate_limit, 1);
  assert.equal(state.s.stats.groq.successes, 1);
  assert.equal(state.s.lastSuccess.provider, 'groq');
  assert.equal(state.s.logs.length, 2);
  assert.ok(state.s.logs.every((l) => typeof l.ms === 'number' && !JSON.stringify(l).includes('hello')), 'logs hold timings, never the user content');
});

test('KV persistence: cooldowns survive a restart', async () => {
  const store = new Map();
  const kv = { get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null), put: async (k, v) => store.set(k, v) };
  const a = new RouterState();
  await a.load(kv);
  a.coolDown('key:gemini#1 …_ONE', 60_000, 'test');
  await a.save(kv);
  const b = new RouterState();
  await b.load(kv);
  assert.ok(b.coolingUntil('key:gemini#1 …_ONE'));
});

test('OpenRouter: only free models, never paid ones', () => {
  const env = { ...ENV, GEMINI_API_KEYS: '', GROQ_API_KEYS: '', OPENROUTER_MODELS_BALANCED: 'openai/gpt-4o,deepseek/deepseek-chat-v3-0324:free' };
  const targets = planTargets({ capability: 'text', tier: 'balanced', messages: [], stream: false }, env, new RouterState());
  assert.ok(targets.length > 0);
  assert.ok(targets.every((t) => t.model.endsWith(':free')), targets.map((t) => t.model).join(','));
  const paid = planTargets({ capability: 'text', tier: 'balanced', messages: [], stream: false }, { ...env, OPENROUTER_ALLOW_PAID: 'true' }, new RouterState());
  assert.ok(paid.some((t) => t.model === 'openai/gpt-4o'));
});
