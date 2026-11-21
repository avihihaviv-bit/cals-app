/**
 * Calls Google's Gemini API directly from the browser with the user's own
 * API key (entered in Settings, stored only on their device).
 *
 * Model names are discovered at runtime via ListModels rather than
 * hard-coded: Google retires specific versions (gemini-2.5-flash started
 * returning 404 "no longer available to new users"), and a stale pinned name
 * silently breaks every scan. Picking from what the key can actually use
 * avoids that whole class of failure.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_MODELS_TO_TRY = 4;
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];

export interface RawAnalysisItem {
  seenDescription: string;
  bestGuessName: string;
  identificationConfidence: number;
  alternatives?: string[];
  isCountable?: boolean;
  unitCount?: number;
  unitLabel?: string;
  estimatedGramsMin: number;
  estimatedGramsMax: number;
  visibleExtras?: string[];
  per100gCalories: number;
  per100gProteinG: number;
  per100gCarbsG: number;
  per100gFatG: number;
  boxXPct?: number;
  boxYPct?: number;
  boxWPct?: number;
  boxHPct?: number;
}

export interface RawAnalysisResponse {
  isFood?: boolean;
  unusable?: boolean;
  unusableReason?: string;
  items?: RawAnalysisItem[];
  error?: string;
}

export type GeminiErrorKind = 'invalid_key' | 'quota' | 'overloaded' | 'blocked' | 'network' | 'bad_response' | 'unknown';

export class GeminiError extends Error {
  constructor(
    public kind: GeminiErrorKind,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

// Gemini structured-output schema (OpenAPI subset, uppercase types). Flat
// per-item fields — controlled generation is more reliable without nesting.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isFood: { type: 'BOOLEAN', description: 'False if the photo does not show food at all.' },
    unusable: {
      type: 'BOOLEAN',
      description:
        'True only if the photo is genuinely too blurry, dark, cropped, or distant to make even a rough estimate. Use rarely — prefer a wide grams range over refusing.',
    },
    unusableReason: { type: 'STRING', description: 'Short, specific reason the photo could not be analyzed. Only when unusable is true.' },
    items: {
      type: 'ARRAY',
      description: 'One entry per distinct food item visible in the photo.',
      items: {
        type: 'OBJECT',
        properties: {
          seenDescription: {
            type: 'STRING',
            description: 'FACTS ONLY: color, shape, texture, visible components — no assumed identity, weight, or preparation.',
          },
          bestGuessName: { type: 'STRING', description: 'Most likely specific identification in English, e.g. "Grilled chicken breast", "White rice".' },
          identificationConfidence: { type: 'INTEGER', description: 'Confidence in bestGuessName specifically, 0-100.' },
          alternatives: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Other plausible identifications. Only when identificationConfidence is below 70.',
          },
          isCountable: { type: 'BOOLEAN', description: 'True when naturally counted (eggs, slices, pieces, whole fruit).' },
          unitCount: { type: 'NUMBER', description: 'Number of units, only when isCountable.' },
          unitLabel: { type: 'STRING', description: 'Unit name, e.g. "eggs", "slices". Only when isCountable.' },
          estimatedGramsMin: { type: 'NUMBER', description: 'Low end of an honest weight estimate in grams (or ml).' },
          estimatedGramsMax: { type: 'NUMBER', description: 'High end of an honest weight estimate in grams (or ml).' },
          visibleExtras: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Sauces, oil sheen, cheese, dressing etc. actually VISIBLE on this item.',
          },
          per100gCalories: { type: 'NUMBER', description: 'Per-100g calories for this food (fallback if not in the app database).' },
          per100gProteinG: { type: 'NUMBER', description: 'Per-100g protein grams.' },
          per100gCarbsG: { type: 'NUMBER', description: 'Per-100g carb grams.' },
          per100gFatG: { type: 'NUMBER', description: 'Per-100g fat grams.' },
          boxXPct: { type: 'NUMBER', description: 'Left edge of the item, 0-100 % of image width.' },
          boxYPct: { type: 'NUMBER', description: 'Top edge of the item, 0-100 % of image height.' },
          boxWPct: { type: 'NUMBER', description: 'Item width, 0-100 % of image width.' },
          boxHPct: { type: 'NUMBER', description: 'Item height, 0-100 % of image height.' },
        },
        required: [
          'seenDescription',
          'bestGuessName',
          'identificationConfidence',
          'estimatedGramsMin',
          'estimatedGramsMax',
          'per100gCalories',
          'per100gProteinG',
          'per100gCarbsG',
          'per100gFatG',
        ],
      },
    },
  },
  required: ['isFood', 'items'],
};

const SYSTEM_PROMPT = `You are a food-photo analysis system feeding a nutrition tracking app. Work through this protocol internally:
1. What is in the photo overall?
2. How many visually distinct food items are there?
3. Which region of the photo does each item occupy?
4. Is each region actually food, or something else (utensil, hand, label, background)?
5. For each food item, what is the most specific correct identification?
6. How does it appear to be prepared (raw/cooked/fried/grilled), if visible?
7. What portion size is it, judged against reference objects (plate/bowl diameter, cutlery, hands, packaging, cups)?
8. Which sauces, oils, dressings, cheese or toppings can you actually SEE?
9. Is it a packaged product identifiable from its label?
10. Only then, give per-100g nutrition values.

Hard rules:
- Never state an assumption as observed fact. seenDescription contains only what is visually verifiable.
- Prefer counting discrete units (eggs, slices, pieces) over guessing a weight whenever the item is countable.
- Give an honest grams range; a wide range is more honest than a falsely narrow one.
- If confidence in an identification is below 70, list real alternatives.
- Only set "unusable" if the photo truly cannot support even a rough estimate.
- boxXPct/boxYPct/boxWPct/boxHPct are optional — omit them if unsure of the region.
- Write bestGuessName and alternatives in English.
Respond with ONLY the JSON object matching the schema.`;

let cachedModels: { key: string; models: string[] } | null = null;

interface ListedModel {
  name: string;
  supportedGenerationMethods?: string[];
}

const EXCLUDED_MODEL = /(embed|tts|image|imagen|live|audio|native|aqa|learnlm|gemma|veo|robotics|computer-use|banana|exp-\d)/i;

// "-latest" aliases come first: they always point at a currently-served
// model, whereas pinned versions are exactly what Google retires. Within
// that, fast/cheap Flash beats Flash-Lite beats Pro.
function modelRank(id: string): [number, number, number, number] {
  const isAlias = /-latest$/.test(id) ? 0 : 1;
  const tier = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3;
  const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const isPreview = /(preview|exp)/.test(id) ? 1 : 0;
  return [isAlias, tier, -version, isPreview];
}

function compareRanks(a: string, b: string): number {
  const ra = modelRank(a);
  const rb = modelRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return 0;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new GeminiError('network', 'Gemini took too long to answer — try again.', `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new GeminiError('network', "Couldn't reach Gemini — check your internet connection.", String(err));
  } finally {
    clearTimeout(timer);
  }
}

function errorMessageFrom(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText);
    return parsed?.error?.message ?? bodyText;
  } catch {
    return bodyText;
  }
}

function isInvalidKeyResponse(status: number, bodyText: string): boolean {
  return (status === 400 || status === 401 || status === 403) && /(API key not valid|API_KEY_INVALID|API key expired|PERMISSION_DENIED|unregistered callers)/i.test(bodyText);
}

/** Lists the Gemini models this key can use for image+text generation, best first. Also serves as the key check. */
export async function listUsableModels(apiKey: string): Promise<string[]> {
  if (cachedModels?.key === apiKey) return cachedModels.models;

  const res = await fetchWithTimeout(`${API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  const bodyText = await res.text();

  if (!res.ok) {
    if (isInvalidKeyResponse(res.status, bodyText)) {
      throw new GeminiError('invalid_key', 'Your Gemini API key was rejected — check that it was copied in full.', `${res.status}: ${errorMessageFrom(bodyText)}`);
    }
    throw new GeminiError('unknown', "Couldn't load the list of Gemini models.", `${res.status}: ${errorMessageFrom(bodyText)}`);
  }

  let listed: ListedModel[] = [];
  try {
    listed = JSON.parse(bodyText).models ?? [];
  } catch {
    listed = [];
  }

  const usable = listed
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini-') && !EXCLUDED_MODEL.test(id))
    .sort(compareRanks)
    .slice(0, MAX_MODELS_TO_TRY);

  const models = usable.length > 0 ? usable : FALLBACK_MODELS;
  cachedModels = { key: apiKey, models };
  return models;
}

function extractText(data: any): string | null {
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p?.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
  return text || null;
}

const TEXT_SYSTEM_PROMPT = `You are a nutrition-lookup system feeding a nutrition tracking app. The user typed what they ate, possibly with amounts, in any language (often Hebrew or English).

Rules:
- Create one item per distinct food. Translate names to English for bestGuessName (e.g. "חזה עוף" -> "Chicken breast (cooked)").
- If the user states an amount in grams or ml, use EXACTLY that: set estimatedGramsMin and estimatedGramsMax both to it. Never change a stated amount.
- If the user states a count ("2 eggs", "3 slices of bread"), set isCountable true with unitCount/unitLabel and convert to grams with a standard weight per unit.
- If NO amount is given, estimate one typical portion and set a sensible min/max range around it (this is an estimate, not a fact).
- seenDescription must quote what the user wrote for that item (e.g. 'You wrote: "150g chicken breast"') — do not invent preparation details.
- identificationConfidence is how sure you are that bestGuessName matches what they meant; if below 70 list alternatives.
- Give per-100g calories/protein/carbs/fat for the food as typically prepared/eaten (cooked weight if they said cooked). Use well-known reference values (USDA-style).
- Do not include bounding boxes.
- If the text is not about food at all, set isFood false.
Respond with ONLY the JSON object matching the schema.`;

/** Analyzes a food photo. */
export function analyzeFoodPhoto(apiKey: string, mediaType: string, base64Data: string): Promise<RawAnalysisResponse> {
  return generateAnalysis(
    apiKey,
    SYSTEM_PROMPT,
    [{ inline_data: { mime_type: mediaType, data: base64Data } }, { text: 'Analyze this food photo following your protocol.' }],
    'Gemini declined to analyze this photo — try a different shot.',
  );
}

/** Looks up foods the user typed (e.g. "150g chicken breast and 200g rice") — any food, with the exact amounts they gave. */
export function analyzeFoodText(apiKey: string, description: string): Promise<RawAnalysisResponse> {
  return generateAnalysis(apiKey, TEXT_SYSTEM_PROMPT, [{ text: `What I ate: ${description}` }], 'Gemini declined to analyze that text — try rephrasing.');
}

/**
 * Runs a structured Gemini request and parses the JSON it returns.
 */
async function generateAnalysis(
  apiKey: string,
  systemPrompt: string,
  userParts: unknown[],
  blockedMessage: string,
): Promise<RawAnalysisResponse> {
  return runWithModels<RawAnalysisResponse>(
    apiKey,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.2 },
    },
    blockedMessage,
    (text) => {
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as RawAnalysisResponse;
      } catch {
        return null;
      }
    },
  );
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** A free-form chat reply (plain text). `history` must end with the user's new message. */
export function chatWithGemini(apiKey: string, systemPrompt: string, history: ChatTurn[]): Promise<string> {
  // Gemini requires the conversation to start with a user turn.
  const firstUser = history.findIndex((t) => t.role === 'user');
  const turns = firstUser >= 0 ? history.slice(firstUser) : history;
  return runWithModels<string>(
    apiKey,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
    },
    'Gemini declined to answer that — try asking differently.',
    (text) => (text.trim() ? text.trim() : null),
  );
}

/**
 * Sends a request to the best available models in order, moving on when one
 * is overloaded, rate-limited, unavailable, or returns something unusable — a
 * different model is a different capacity pool, so one being busy rarely
 * means all are.
 */
async function runWithModels<T>(
  apiKey: string,
  requestBody: unknown,
  blockedMessage: string,
  parse: (text: string) => T | null,
): Promise<T> {
  let models: string[];
  try {
    models = await listUsableModels(apiKey);
  } catch (err) {
    if (err instanceof GeminiError && err.kind === 'invalid_key') throw err;
    models = FALLBACK_MODELS;
  }

  const body = JSON.stringify(requestBody);
  const failures: string[] = [];
  let sawQuota = false;

  for (const model of models) {
    const res = await fetchWithTimeout(`${API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.promptFeedback?.blockReason) {
        throw new GeminiError('blocked', blockedMessage, `blockReason: ${data.promptFeedback.blockReason}`);
      }
      const text = extractText(data);
      if (!text) {
        failures.push(`${model}: empty response (finishReason ${data?.candidates?.[0]?.finishReason ?? 'unknown'})`);
        continue;
      }
      const parsed = parse(text);
      if (parsed === null) {
        failures.push(`${model}: response was not in the expected format`);
        continue;
      }
      return parsed;
    }

    const bodyText = await res.text();
    if (isInvalidKeyResponse(res.status, bodyText)) {
      throw new GeminiError('invalid_key', 'Your Gemini API key was rejected — check that it was copied in full.', `${res.status}: ${errorMessageFrom(bodyText)}`);
    }
    if (res.status === 429) sawQuota = true;
    failures.push(`${model}: ${res.status} ${errorMessageFrom(bodyText).slice(0, 160)}`);
  }

  const detail = failures.join(' | ');
  if (sawQuota) {
    throw new GeminiError('quota', "You've hit Gemini's free usage limit for now — wait a minute (or until tomorrow for the daily limit) and try again.", detail);
  }
  if (failures.some((f) => /: 5\d\d /.test(f))) {
    throw new GeminiError('overloaded', "Gemini's servers are busy right now — try again in a minute.", detail);
  }
  throw new GeminiError('bad_response', "Gemini couldn't analyze that right now.", detail);
}
