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

import { getAiQuality } from '@/utils/geminiKey';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 45_000;
// Pro models think longer before answering — give them more room.
const PRO_TIMEOUT_MS = 100_000;
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
  hebrewName?: string;
  emoji?: string;
  naturalnessScore?: number;
  databaseId?: string;
  referenceFood?: string;
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
          databaseId: {
            type: 'STRING',
            description: 'id from the app food database list when it is the SAME food in the SAME preparation; otherwise omit.',
          },
          referenceFood: {
            type: 'STRING',
            description: 'The standard reference entry your per-100g values are based on, e.g. "USDA: Chicken breast, meat only, roasted".',
          },
          hebrewName: { type: 'STRING', description: 'The common Hebrew name of this food, e.g. "חזה עוף".' },
          emoji: { type: 'STRING', description: 'One emoji that best represents this food.' },
          naturalnessScore: {
            type: 'INTEGER',
            description: 'How close the food is to its whole, unprocessed form, 1-100 (fresh fruit ~98, plain grilled chicken ~90, white bread ~45, candy/soda ~10). Not a health judgment.',
          },
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
7. What portion size is it? Measure against reference objects: a standard dinner plate is ~26-27 cm across, a side plate ~20 cm, a fork ~19 cm long, a tablespoon bowl ~4 cm, a soda can 12 cm tall, an adult palm ~8-9 cm wide. Estimate the food's footprint and height/thickness, then convert volume to weight with a realistic density (e.g. cooked rice ~0.8 g/ml packed loosely, salad leaves ~0.1 g/ml, meat ~1.05 g/ml).
8. Which sauces, oils, dressings, cheese or toppings can you actually SEE?
9. Is it a packaged product identifiable from its label?
10. Only then, give per-100g nutrition values for the food AS SERVED (cooked weight for cooked foods; fried foods include absorbed oil).
11. Check yourself: per-100g calories should roughly equal 4×protein + 4×carbs + 9×fat. If not, fix the numbers.

Hard rules:
- Never state an assumption as observed fact. seenDescription contains only what is visually verifiable.
- Prefer counting discrete units (eggs, slices, pieces) over guessing a weight whenever the item is countable.
- Give an honest grams range; a wide range is more honest than a falsely narrow one.
- If confidence in an identification is below 70, list real alternatives.
- Only set "unusable" if the photo truly cannot support even a rough estimate.
- boxXPct/boxYPct/boxWPct/boxHPct are optional — omit them if unsure of the region.
- Write bestGuessName and alternatives in English; also give hebrewName, one emoji and naturalnessScore per item.
- Base per-100g values on a real reference entry (USDA FoodData Central, or the Israeli Ministry of Health food database for local dishes) and name it in referenceFood.
- Items that are mixed dishes (a sandwich, pasta with sauce, a salad with dressing) can be split into components when the parts are clearly visible; otherwise treat the dish as one item with values for the whole dish.
Respond with ONLY the JSON object matching the schema.`;

let cachedModels: { key: string; models: string[] } | null = null;
let lastModelUsed: string | null = null;

/** The model that produced the most recent successful answer (shown for transparency). */
export function getLastModelUsed(): string | null {
  return lastModelUsed;
}

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new GeminiError('network', 'Gemini took too long to answer — try again.', `Timed out after ${timeoutMs / 1000}s`);
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
- Give per-100g calories/protein/carbs/fat for the food as typically prepared/eaten (cooked weight unless they said raw/dry). Base them on a real reference entry (USDA FoodData Central, or the Israeli Ministry of Health database for local foods) and name it in referenceFood. Check that calories ≈ 4×protein + 4×carbs + 9×fat.
- Israeli products and dishes are common (e.g. קוטג׳ 5%, במבה, שניצל, בורקס, לחמניה, פיתה, סלט ישראלי, שקשוקה): use typical Israeli recipes and package sizes.
- For pasta/rice/grains: if the user doesn't say raw/dry, assume the stated grams are cooked.
- Also give hebrewName (common Hebrew name), one emoji, and naturalnessScore.
- Do not include bounding boxes.
- If the text is not about food at all, set isFood false.
Respond with ONLY the JSON object matching the schema.`;

export interface RawLabelResponse {
  isLabel: boolean;
  unreadableReason?: string;
  productName?: string;
  hebrewName?: string;
  brand?: string;
  emoji?: string;
  isLiquid?: boolean;
  per100Calories?: number;
  per100ProteinG?: number;
  per100CarbsG?: number;
  per100SugarG?: number;
  per100FatG?: number;
  per100FiberG?: number;
  per100SodiumMg?: number;
  servingSizeG?: number;
  servingLabel?: string;
  packageSizeG?: number;
  convertedFromServing?: boolean;
  naturalnessScore?: number;
}

const LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isLabel: { type: 'BOOLEAN', description: 'True only if a nutrition facts table is visible and readable.' },
    unreadableReason: { type: 'STRING', description: 'Why the label could not be read, when isLabel is false.' },
    productName: { type: 'STRING', description: 'Product name in English (translate if needed), e.g. "Cottage cheese 5%".' },
    hebrewName: { type: 'STRING', description: 'Product name in Hebrew if shown on the package or commonly used.' },
    brand: { type: 'STRING', description: 'Brand, if visible.' },
    emoji: { type: 'STRING', description: 'One emoji representing the product.' },
    isLiquid: { type: 'BOOLEAN', description: 'True when values are per 100 ml.' },
    per100Calories: { type: 'NUMBER', description: 'Energy in kcal per 100 g/ml, exactly as printed (use kcal, not kJ).' },
    per100ProteinG: { type: 'NUMBER', description: 'Protein grams per 100 g/ml.' },
    per100CarbsG: { type: 'NUMBER', description: 'Total carbohydrate grams per 100 g/ml.' },
    per100SugarG: { type: 'NUMBER', description: 'Sugars grams per 100 g/ml, if printed.' },
    per100FatG: { type: 'NUMBER', description: 'Total fat grams per 100 g/ml.' },
    per100FiberG: { type: 'NUMBER', description: 'Dietary fiber grams per 100 g/ml, if printed.' },
    per100SodiumMg: { type: 'NUMBER', description: 'Sodium mg per 100 g/ml, if printed.' },
    servingSizeG: { type: 'NUMBER', description: 'Serving size in grams/ml, if printed.' },
    servingLabel: { type: 'STRING', description: 'Serving description in English, e.g. "1 cup (200g)", if printed.' },
    packageSizeG: { type: 'NUMBER', description: 'Net weight of the whole package in g/ml, if visible.' },
    convertedFromServing: { type: 'BOOLEAN', description: 'True if the label only gave per-serving values and you converted them to per-100.' },
    naturalnessScore: { type: 'INTEGER', description: 'How close to whole/unprocessed, 1-100, judged from the product and its ingredient list if visible.' },
  },
  required: ['isLabel'],
};

const LABEL_SYSTEM_PROMPT = `You read nutrition facts tables from photos of food packaging for a nutrition tracking app. Labels may be in Hebrew, English, Arabic or other languages. Israeli labels show "ערכים תזונתיים" with a column "ל-100 גרם" / "ל-100 מ\"ל".

Rules:
- Copy the numbers EXACTLY as printed. Never estimate or "correct" a printed value.
- Always report values per 100 g (or per 100 ml for drinks). If the label only shows per-serving values, convert using the printed serving size and set convertedFromServing true.
- Energy: use kcal (קלוריות / אנרגיה בקלוריות). If only kJ is printed, divide by 4.184.
- Carbohydrates = total carbohydrates (פחמימות), fat = total fat (שומנים), sodium in mg (נתרן).
- Leave a field out if it is not printed. Do not invent it.
- If no nutrition table is visible or it's too blurry to read the numbers, set isLabel false and explain briefly in unreadableReason (e.g. "The numbers are blurry — move closer").
Respond with ONLY the JSON object.`;

/** Reads a nutrition facts label from a package photo — exact printed values, per 100 g/ml. */
export function analyzeNutritionLabel(apiKey: string, mediaType: string, base64Data: string): Promise<RawLabelResponse> {
  return runWithModels<RawLabelResponse>(
    apiKey,
    {
      system_instruction: { parts: [{ text: LABEL_SYSTEM_PROMPT }] },
      contents: [
        { role: 'user', parts: [{ inline_data: { mime_type: mediaType, data: base64Data } }, { text: 'Read this nutrition label.' }] },
      ],
      generationConfig: { responseMimeType: 'application/json', responseSchema: LABEL_SCHEMA, temperature: 0 },
    },
    'Gemini declined to read this photo — try a different shot.',
    (text) => {
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as RawLabelResponse;
      } catch {
        return null;
      }
    },
    { accuracyCritical: true },
  );
}

/** Appends the app's verified food list so the model can point at a real entry instead of estimating. */
function withDatabase(prompt: string, database: string): string {
  return database
    ? `${prompt}\n\nApp food database (id: name). When an item is exactly one of these foods in the same preparation, set databaseId to its id — its verified values will be used:\n${database}`
    : prompt;
}

/** Analyzes a food photo. */
export function analyzeFoodPhoto(apiKey: string, mediaType: string, base64Data: string, database = ''): Promise<RawAnalysisResponse> {
  return generateAnalysis(
    apiKey,
    withDatabase(SYSTEM_PROMPT, database),
    [{ inline_data: { mime_type: mediaType, data: base64Data } }, { text: 'Analyze this food photo following your protocol.' }],
    'Gemini declined to analyze this photo — try a different shot.',
  );
}

/** Looks up foods the user typed (e.g. "150g chicken breast and 200g rice") — any food, with the exact amounts they gave. */
export function analyzeFoodText(apiKey: string, description: string, database = ''): Promise<RawAnalysisResponse> {
  return generateAnalysis(
    apiKey,
    withDatabase(TEXT_SYSTEM_PROMPT, database),
    [{ text: `What I ate: ${description}` }],
    'Gemini declined to analyze that text — try rephrasing.',
  );
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
    { accuracyCritical: true },
  );
}

export interface WebSource {
  title: string;
  url: string;
}

export interface GroundedAnswer {
  text: string;
  /** Pages Google Search actually returned for this answer (from grounding metadata — not model-written). */
  sources: WebSource[];
  searchQueries: string[];
  /** True when a live Google Search actually ran. */
  grounded: boolean;
}

/**
 * Asks Gemini with Google Search grounding: the model runs real web searches
 * and its answer comes with the pages it used. If search grounding isn't
 * available on any model for this key, falls back to an answer without web
 * access, flagged grounded: false so callers can mark everything as estimated.
 */
export async function askWithWebSearch(apiKey: string, systemPrompt: string, userText: string): Promise<GroundedAnswer> {
  const request = (withSearch: boolean) => ({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
  });
  const parse = (text: string, raw: any): GroundedAnswer | null => {
    if (!text.trim()) return null;
    const meta = raw?.candidates?.[0]?.groundingMetadata;
    const chunks: any[] = meta?.groundingChunks ?? [];
    const sources = chunks
      .map((c) => c?.web)
      .filter((w) => w?.uri)
      .map((w) => ({ title: String(w.title ?? w.uri), url: String(w.uri) }))
      .filter((w, i, arr) => arr.findIndex((x) => x.url === w.url) === i);
    return { text, sources, searchQueries: meta?.webSearchQueries ?? [], grounded: sources.length > 0 };
  };
  try {
    return await runWithModels<GroundedAnswer>(apiKey, request(true), 'Gemini declined this research request.', parse, {
      accuracyCritical: true,
      timeoutMs: 150_000,
    });
  } catch (err) {
    if (err instanceof GeminiError && (err.kind === 'invalid_key' || err.kind === 'quota' || err.kind === 'network')) throw err;
    // Search tool unavailable for this key/model — answer from the model's own knowledge, clearly flagged.
    const ans = await runWithModels<GroundedAnswer>(apiKey, request(false), 'Gemini declined this research request.', parse, {
      accuracyCritical: true,
      timeoutMs: 150_000,
    });
    return { ...ans, grounded: false, sources: [] };
  }
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
  parse: (text: string, raw: any) => T | null,
  options: { accuracyCritical?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  let models: string[];
  try {
    models = await listUsableModels(apiKey);
  } catch (err) {
    if (err instanceof GeminiError && err.kind === 'invalid_key') throw err;
    models = FALLBACK_MODELS;
  }
  // Nutrition lookups in "best accuracy" mode try the strongest (Pro) model
  // first; if it's busy or over its free quota, the loop below falls back to Flash.
  if (options.accuracyCritical && getAiQuality() === 'best') {
    models = [...models.filter((m) => /pro/.test(m)), ...models.filter((m) => !/pro/.test(m))];
  }

  const body = JSON.stringify(requestBody);
  const failures: string[] = [];
  let sawQuota = false;

  for (const model of models) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${API_BASE}/models/${model}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body },
        options.timeoutMs ?? (/pro/.test(model) ? PRO_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
      );
    } catch (err) {
      // A timeout on one model shouldn't sink the request — try the next one.
      if (err instanceof GeminiError && err.kind === 'network' && /Timed out/.test(err.detail ?? '')) {
        failures.push(`${model}: ${err.detail}`);
        continue;
      }
      throw err;
    }

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
      const parsed = parse(text, data);
      if (parsed === null) {
        failures.push(`${model}: response was not in the expected format`);
        continue;
      }
      lastModelUsed = model;
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
