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
import { MEASURE_CLASSES, PORTION_REFERENCE } from '@/data/portions';

import { isRouterConfigured, routerGenerate, RouterFailure, type RouterRequest, type RouterTier } from '@/services/aiRouter';
import { ROUTER_ONLY } from '@/utils/geminiKey';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 35_000;
// Pro models think longer before answering — give them more room.
const PRO_TIMEOUT_MS = 100_000;
// Each Gemini model has its OWN free daily quota, so keeping several different
// models (2.5 Flash, Flash-Lite, 2.0 Flash…) means one used-up model just hands over to the next.
const MAX_MODELS_TO_TRY = 8;
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
  /** How the amount is known: typed by the user, counted, or estimated. */
  amountBasis?: 'stated_weight' | 'stated_count' | 'stated_measure' | 'counted' | 'estimated';
  measureUnit?: 'tablespoon' | 'teaspoon' | 'cup' | 'handful' | 'none';
  measureCount?: number;
  measureClass?: string;
  /** Whole eggs the item is made from (omelette, fried/boiled/scrambled eggs). */
  wholeEggs?: number;
  /** Item location as Gemini's native [ymin, xmin, ymax, xmax] on a 0-1000 scale. */
  box2d?: number[];
  /** Realistic runner-up identifications, each with its own per-100g values (one-tap fix in the UI). */
  alternativeOptions?: RawAlternative[];
  /** Likely additions that are neither visible nor included in the per-100g values (oil it was fried in…). */
  suggestedAdditions?: RawAddition[];
  /** Legacy percentage boxes (older cached answers and the shared Worker). */
  boxXPct?: number;
  boxYPct?: number;
  boxWPct?: number;
  boxHPct?: number;
}

export interface RawAlternative {
  name: string;
  databaseId?: string;
  per100gCalories?: number;
  per100gProteinG?: number;
  per100gCarbsG?: number;
  per100gFatG?: number;
}

export interface RawAddition {
  type: string;
  amount: number;
  unit: string;
  reason?: string;
}

export interface RawAnalysisResponse {
  isFood?: boolean;
  unusable?: boolean;
  unusableReason?: string;
  items?: RawAnalysisItem[];
  error?: string;
}

export type GeminiErrorKind = 'invalid_key' | 'quota' | 'quota_daily' | 'overloaded' | 'blocked' | 'network' | 'bad_response' | 'unknown';

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
            description: 'FACTS ONLY, one short sentence (max ~15 words): color, shape, texture, visible components — no assumed identity, weight, or preparation.',
          },
          bestGuessName: { type: 'STRING', description: 'Most likely specific identification in English, e.g. "Grilled chicken breast", "White rice".' },
          identificationConfidence: { type: 'INTEGER', description: 'Confidence in bestGuessName specifically, 0-100.' },
          alternativeOptions: {
            type: 'ARRAY',
            description:
              'Realistic runner-up identifications, most likely first, each with its own per-100g values. Photos: always 1-2 (up to 3 when identificationConfidence is below 70). Typed text: only when genuinely ambiguous.',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Specific English name, e.g. "Tofu (firm)".' },
                databaseId: { type: 'STRING', description: 'id from the app food database when it is exactly that food; otherwise omit.' },
                per100gCalories: { type: 'NUMBER' },
                per100gProteinG: { type: 'NUMBER' },
                per100gCarbsG: { type: 'NUMBER' },
                per100gFatG: { type: 'NUMBER' },
              },
              required: ['name', 'per100gCalories', 'per100gProteinG', 'per100gCarbsG', 'per100gFatG'],
              propertyOrdering: ['name', 'databaseId', 'per100gCalories', 'per100gProteinG', 'per100gCarbsG', 'per100gFatG'],
            },
          },
          amountBasis: {
            type: 'STRING',
            format: 'enum',
            enum: ['stated_weight', 'stated_count', 'stated_measure', 'counted', 'estimated'],
            description: 'How the amount is known: user gave grams/ml, user gave a number of units, user used a spoon/cup/handful, you counted units in the photo, or an estimate.',
          },
          isCountable: { type: 'BOOLEAN', description: 'True when naturally counted (eggs, slices, pieces, whole fruit).' },
          unitCount: { type: 'NUMBER', description: 'Number of units, only when isCountable.' },
          unitLabel: { type: 'STRING', description: 'Unit name, e.g. "eggs", "slices". Only when isCountable.' },
          wholeEggs: { type: 'NUMBER', description: 'Number of whole eggs this item is made from (omelette, fried, boiled, scrambled eggs). 0 if none.' },
          measureUnit: {
            type: 'STRING',
            format: 'enum',
            enum: ['tablespoon', 'teaspoon', 'cup', 'handful', 'none'],
            description: 'Household measure the user stated (כף=tablespoon, כפית=teaspoon, כוס=cup, חופן=handful), else "none".',
          },
          measureCount: { type: 'NUMBER', description: 'How many of measureUnit, e.g. 2 for "2 כפות", 0.5 for "חצי כוס".' },
          measureClass: {
            type: 'STRING',
            format: 'enum',
            enum: [...MEASURE_CLASSES],
            description: 'Density class used to convert spoons/cups to grams (see the instructions).',
          },
          estimatedGramsMin: { type: 'NUMBER', description: 'Low end of an honest weight estimate in grams (or ml).' },
          estimatedGramsMax: { type: 'NUMBER', description: 'High end of an honest weight estimate in grams (or ml).' },
          visibleExtras: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Sauces, oil sheen, cheese, dressing etc. actually VISIBLE on this item.',
          },
          suggestedAdditions: {
            type: 'ARRAY',
            description:
              'Fat or sugar this kind of dish almost always contains that is NOT visible and NOT already included in your per-100g values (e.g. oil an omelette or shakshuka was cooked in, dressing on a dressed salad). Empty when none or when already counted.',
            items: {
              type: 'OBJECT',
              properties: {
                type: { type: 'STRING', format: 'enum', enum: ['oil', 'butter', 'sauce', 'dressing', 'sugar', 'cheese'] },
                amount: { type: 'NUMBER', description: 'Typical amount for this portion.' },
                unit: { type: 'STRING', format: 'enum', enum: ['tsp', 'tbsp', 'g'] },
                reason: { type: 'STRING', description: 'Very short reason in English, e.g. "oil it was fried in".' },
              },
              required: ['type', 'amount', 'unit', 'reason'],
              propertyOrdering: ['type', 'amount', 'unit', 'reason'],
            },
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
          box2d: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
            description: 'Photos only: tight box around this item as [ymin, xmin, ymax, xmax], each 0-1000 relative to image height/width.',
          },
        },
        required: [
          'seenDescription',
          'bestGuessName',
          'identificationConfidence',
          'amountBasis',
          'estimatedGramsMin',
          'estimatedGramsMax',
          'per100gCalories',
          'per100gProteinG',
          'per100gCarbsG',
          'per100gFatG',
        ],
        // Identify → count → weigh → nutrition: the order the model writes fields is the order it reasons in.
        propertyOrdering: [
          'box2d',
          'seenDescription',
          'bestGuessName',
          'hebrewName',
          'emoji',
          'identificationConfidence',
          'databaseId',
          'alternativeOptions',
          'amountBasis',
          'isCountable',
          'unitCount',
          'unitLabel',
          'wholeEggs',
          'measureUnit',
          'measureCount',
          'measureClass',
          'estimatedGramsMin',
          'estimatedGramsMax',
          'visibleExtras',
          'referenceFood',
          'per100gCalories',
          'per100gProteinG',
          'per100gCarbsG',
          'per100gFatG',
          'suggestedAdditions',
          'naturalnessScore',
        ],
      },
    },
  },
  required: ['isFood', 'items'],
  propertyOrdering: ['isFood', 'unusable', 'unusableReason', 'items'],
};

/** Shared rules for amounts — the app converts counts and household measures to grams with its own table. */
const AMOUNT_RULES = `Amounts — the app converts counts and household measures to grams with its own standard table, so report WHAT and HOW MANY precisely:
- amountBasis: "stated_weight" when the user gave grams/ml; "stated_count" when they gave a number of units (2 eggs, 3 slices); "stated_measure" when they used a household measure (כף/tablespoon, כפית/teaspoon, כוס/cup, חופן/handful); "counted" when you counted units in a photo; otherwise "estimated".
- measureUnit + measureCount for household measures: "2 כפות חומוס" → tablespoon, 2; "כפית סוכר" → teaspoon, 1; "חצי כוס אורז" → cup, 0.5. Otherwise measureUnit "none".
- measureClass for every item: fat (oil, butter), sugar, syrup (honey, silan, jam), spread (peanut butter, raw tahini paste, chocolate spread), dip (hummus, prepared tahini, labneh, cream cheese, cottage, yogurt, matbucha, eggplant salad), cooked (rice, pasta, couscous, legumes, cooked vegetables, diced salad, mixed dishes), liquid (milk, juice, soup, thin sauce), powder (flour, cocoa, protein powder, grated cheese), nuts (nuts, seeds), cereal (oats, granola, cornflakes), fruitveg (berries, grapes, chopped raw vegetables), leafy (lettuce, spinach, herbs), other.
- wholeEggs: how many whole eggs the item is made from (omelette, fried, boiled, scrambled). "חביתה מביצה אחת" or "1-egg omelette" → 1. A plain omelette with no egg count → 2. 0 for non-egg foods.
- Plain egg dishes (omelette, fried, boiled, scrambled eggs with nothing else) are their own item with the matching databaseId; cheese, vegetables or sauce cooked into them make it a mixed dish.
- Always still fill estimatedGramsMin/Max, using the standard weights below.

${PORTION_REFERENCE}`;

/** Foods that are easy to mix up in photos — the model checks these deliberately instead of taking its first impression. */
const LOOK_ALIKES = `Look-alikes — decide deliberately, and put the realistic runner-ups in alternativeOptions:
- White cubes in a salad: Bulgarian/feta cheese (crumbly, matte, uneven) vs tofu (smooth, springy, even) vs halloumi/paneer (firm, often grill marks).
- Beige dips: hummus (thick, slightly grainy, often a well of oil, paprika, whole chickpeas) vs prepared tahini (thinner, smooth, paler, pourable) vs eggplant salad / baba ganoush (fibrous, darker flecks) vs mashed potato (fluffy) vs labneh (white, glossy, dense).
- Small white grains: white rice vs cauliflower rice (uneven, crumbly, vegetable sheen) vs ptitim / Israeli couscous (smooth glossy balls or rice-shaped pasta) vs couscous (very fine) vs bulgur (brownish) vs quinoa (tiny, with a visible curl) vs orzo.
- Rice dishes: majadra (rice or bulgur with brown lentils and fried onion) vs yellow rice (turmeric) vs plain rice.
- Light meat: chicken breast vs turkey vs pork vs fish (flaky layers) vs tofu; schnitzel (breaded, golden) vs breaded fish vs cordon bleu.
- Orange vegetables: sweet potato vs pumpkin / butternut squash vs carrot.
- Breads: pita vs laffa vs sliced bread (white vs whole-wheat: darker crumb, visible grains/seeds) vs challah (glossy, braided) vs bagel / ka'ak.
- Pastry: bourekas (puff pastry, sesame, triangles/rectangles) vs malawach (flat, layered, pan-fried) vs jachnun (dark rolled logs) vs croissant vs rugelach.
- Dairy: cottage cheese (visible curds) vs white cheese / gvina levana (smooth) vs yogurt vs labneh vs sour cream.
- Drinks: water vs diet vs regular soda (read the can/bottle), black coffee vs coffee with milk (color), juice vs smoothie.
- Cooking method: shiny, blistered, darker edges = fried; dry and matte = baked / air-fried / grilled.
- Israeli dishes to know: shakshuka, sabich, falafel, shawarma (pita / laffa / plate), schnitzel, Israeli salad (finely diced cucumber and tomato), tabbouleh, majadra, ptitim, kubbeh, jachnun, malawach, bourekas, sambusak, me'orav yerushalmi, chraime, hamin/cholent, memula'im (stuffed vegetables), Bamba, Bissli, krembo, halva, sufganiya.`;

const SYSTEM_PROMPT = `You are an expert dietitian analyzing a food photo for a nutrition tracking app used mostly in Israel. Work through this protocol internally before writing the JSON:
1. Scan the whole photo: plates, bowls, cups, packaging, cutlery, hands. Note the size of the plate or bowl — it is your ruler.
2. List every distinct food item. The same food in several pieces is ONE item with a count (3 falafel balls, 2 slices of bread). Skip garnish with no meaningful calories (a parsley sprig, a lemon wedge) and anything that isn't food.
3. Locate each item: box2d = [ymin, xmin, ymax, xmax] on a 0-1000 scale of the image height and width, tight around that item only.
4. Identify each item as specifically as the photo allows: the dish, its main ingredient and how it was prepared (raw / boiled / grilled / fried / baked). Read any visible text — brand, product name, flavor, "zero" / "light" / "diet", fat %, volume. A readable label beats a visual guess.
5. Check the look-alikes below before settling. Use texture, color, sheen and context; if two foods remain plausible, lower identificationConfidence and list the other in alternativeOptions.
6. How much: COUNT everything countable one by one (eggs, slices, pieces, balls, whole fruit) — never estimate a countable item's weight directly. For egg dishes judge how many eggs went in (a 1-egg omelette is thin and about 15 cm across; a 2-egg one is thicker or wider). For everything else estimate footprint × height against reference objects — a dinner plate is ~26-27 cm across, a side plate ~20 cm, a fork ~19 cm, a tablespoon bowl ~4 cm, a soda can 12 cm tall, an adult palm ~8-9 cm wide — and convert volume to weight with a realistic density (cooked rice ~0.8 g/ml, salad leaves ~0.1 g/ml, meat ~1.05 g/ml).
7. Sauces, oil sheen, dressing, cheese you can SEE → visibleExtras. Fat this kind of dish almost always has but you can't see (oil an omelette or shakshuka was cooked in, dressing on a dressed salad) → suggestedAdditions, but only if your per-100g values don't already include it.
8. Give per-100g nutrition for the food AS SERVED (cooked weight for cooked foods; fried foods include absorbed oil), based on a real reference entry. Check yourself: per-100g calories ≈ 4×protein + 4×carbs + 9×fat; fix the numbers if not.

Hard rules:
- Never state an assumption as observed fact. seenDescription contains only what is visually verifiable.
- Give an honest grams range; a wide range is more honest than a falsely narrow one.
- alternativeOptions: for every photo item give the 1-2 most realistic other foods it could be (up to 3 when identificationConfidence is below 70), each with its own per-100g values — they let the user fix a wrong guess with one tap.
- identificationConfidence must be honest: 90+ only when the item is unmistakable or its label is readable.
- Only set "unusable" if the photo truly cannot support even a rough estimate.
- Write bestGuessName and alternative names in English; also give hebrewName, one emoji and naturalnessScore per item.
- Base per-100g values on a real reference entry (USDA FoodData Central, or the Israeli Ministry of Health food database for local dishes) and name it in referenceFood.
- Mixed dishes (a sandwich, pasta with sauce, a salad with dressing) can be split into components when the parts are clearly visible; otherwise treat the dish as one item with values for the whole dish.
- Do not inflate portions: anchor every weight to the plate and utensils and to the standard weights below.

${LOOK_ALIKES}

${AMOUNT_RULES}
Respond with ONLY the JSON object matching the schema.`;

let cachedModels: { key: string; models: string[] } | null = null;
let lastModelUsed: string | null = null;
/** Fixed seed (+ temperature 0 on pre-Gemini-3 models): the same input gets the same answer as far as the API allows. */
const DETERMINISTIC_SEED = 7;

/** The model that produced the most recent successful answer (shown for transparency). */
export function getLastModelUsed(): string | null {
  return lastModelUsed;
}

// ---- What the app has learned about each model, remembered on the device ----
// v: alias → the real model version behind it (from responses), so Gemini 3
//    gets its own settings even when called through "gemini-flash-latest".
// t: which thinking-setting forms a model rejected ("level" = Gemini 3 style, "budget" = Gemini 2.5 style).
// c: models that hit their free quota → skip until this time, instead of wasting a round trip every scan.
interface Learned {
  v: Record<string, string>;
  t: Record<string, { level?: boolean; budget?: boolean }>;
  c: Record<string, number>;
  /** Models whose cooldown is a used-up DAILY quota. */
  d?: Record<string, boolean>;
}
const LEARNED_KEY = 'nutrition-ai-gemini-learned';
let learned: Learned = loadLearned();

function loadLearned(): Learned {
  try {
    const raw = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { v: raw.v ?? {}, t: raw.t ?? {}, c: raw.c ?? {}, d: raw.d ?? {} };
  } catch {
    /* ignore */
  }
  return { v: {}, t: {}, c: {} };
}

function saveLearned() {
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
  } catch {
    /* ignore */
  }
}

function learnVersion(model: string, modelVersion: unknown) {
  if (typeof modelVersion !== 'string' || !modelVersion || learned.v[model] === modelVersion) return;
  learned = { ...learned, v: { ...learned.v, [model]: modelVersion } };
  saveLearned();
}

function resolvedName(model: string): string {
  return learned.v[model] ?? model;
}

function generationOf(model: string): number | null {
  const m = resolvedName(model).match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function tierOf(model: string): 'lite' | 'flash' | 'pro' | 'other' {
  const r = resolvedName(model);
  return /flash-lite/.test(r) ? 'lite' : /flash/.test(r) ? 'flash' : /pro/.test(r) ? 'pro' : 'other';
}

/** Gemini 3+ is tuned for its default temperature (lower values can make it loop) and uses "thinking levels". */
function isModernModel(model: string): boolean {
  const g = generationOf(model);
  return g !== null && g >= 3;
}

type Effort = 'none' | 'low';

/** A small, fixed amount of "thinking": unlimited thinking was most of the wait, and made timing unpredictable. */
function thinkingConfigFor(model: string, effort: Effort): Record<string, unknown> | null {
  const rejected = learned.t[model] ?? {};
  const gen = generationOf(model);
  const tier = tierOf(model);
  if (gen !== null && gen < 2.5) return null; // older models don't think
  const level = { thinkingLevel: tier === 'pro' ? 'low' : effort === 'none' ? 'minimal' : 'low' };
  const budget = { thinkingBudget: tier === 'pro' ? (effort === 'none' ? 128 : 512) : effort === 'none' ? 0 : 512 };
  // Gemini 3: "thinking level"; Gemini 2.5 (or not yet known): the older "budget". Each falls back to the other if rejected.
  const order = isModernModel(model) ? [level, budget] : [budget, level];
  for (const form of order) {
    if ('thinkingLevel' in form ? !rejected.level : !rejected.budget) return form;
  }
  return null;
}

/** Milliseconds until Gemini's free daily quota resets (midnight Pacific time). */
function msUntilDailyReset(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const elapsed = ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) * 1000;
  return Math.max(60_000, 24 * 3600_000 - elapsed);
}

/** "10:00" — the local time the free daily quota comes back. */
export function dailyResetLocalTime(): string {
  const at = new Date(Date.now() + msUntilDailyReset());
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function coolDown(model: string, bodyText: string) {
  let ms = 60_000;
  // Daily limit: this model is out until the quota resets — don't keep asking it.
  if (/PerDay/i.test(bodyText)) ms = msUntilDailyReset();
  else {
    const delay = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (delay) ms = Math.min(10 * 60_000, Math.max(5_000, Number(delay[1]) * 1000));
  }
  learned = { ...learned, c: { ...learned.c, [model]: Date.now() + ms }, d: { ...(learned.d ?? {}), [model]: /PerDay/i.test(bodyText) } };
  saveLearned();
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

interface FetchedText {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * fetch + read the whole body under one timeout (a response can stall after
 * its headers, too). `signal` lets a request that lost the race be cancelled.
 */
async function fetchText(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<FetchedText> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    if (timedOut) {
      throw new GeminiError('network', 'Gemini took too long to answer — try again.', `Timed out after ${timeoutMs / 1000}s`);
    }
    if (signal?.aborted) throw new GeminiError('network', 'Cancelled.', 'aborted');
    throw new GeminiError('network', "Couldn't reach Gemini — check your internet connection.", String(err));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
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
const MODELS_STORAGE_KEY = 'nutrition-ai-gemini-models-v2';
const MODELS_TTL_MS = 24 * 60 * 60 * 1000;

function keyFingerprint(apiKey: string): string {
  let h = 5381;
  for (let i = 0; i < apiKey.length; i++) h = ((h << 5) + h + apiKey.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The model list is remembered on the device for a day, so a scan doesn't wait for an extra request on every app launch. */
function readStoredModels(apiKey: string): string[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(MODELS_STORAGE_KEY) ?? 'null');
    if (raw && raw.k === keyFingerprint(apiKey) && Date.now() - raw.t < MODELS_TTL_MS && Array.isArray(raw.m) && raw.m.length) return raw.m;
  } catch {
    /* ignore */
  }
  return null;
}

function storeModels(apiKey: string, models: string[]) {
  try {
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify({ k: keyFingerprint(apiKey), t: Date.now(), m: models }));
  } catch {
    /* ignore */
  }
}

export async function listUsableModels(apiKey: string, opts: { fresh?: boolean } = {}): Promise<string[]> {
  if (!opts.fresh) {
    if (cachedModels?.key === apiKey) return cachedModels.models;
    const stored = readStoredModels(apiKey);
    if (stored) {
      cachedModels = { key: apiKey, models: stored };
      return stored;
    }
  }

  const res = await fetchText(`${API_BASE}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  const bodyText = res.text;

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
  if (usable.length > 0) storeModels(apiKey, models);
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
- If the user states a count ("2 eggs", "3 slices of bread"), set isCountable true with unitCount/unitLabel and convert to grams with the standard weight per unit below.
- If the user uses a household measure (כף, כפית, כוס, חופן), fill measureUnit/measureCount and convert with the standard table below — a spoon is never a guess.
- If NO amount is given, use one typical portion from the standard weights and set a sensible min/max range around it (this is an estimate, not a fact).
- Hebrew food words: "טחינה" alone means prepared tahini sauce (raw paste mixed with water and lemon, roughly half the calories of the raw paste); "טחינה גולמית" is the raw paste. "גבינה לבנה" is Israeli soft white cheese (5% unless stated). "ביצת עין" is a fried egg, "ביצה קשה" a hard-boiled egg, "חביתה" an omelette.
- seenDescription must quote what the user wrote for that item (e.g. 'You wrote: "150g chicken breast"') — do not invent preparation details.
- identificationConfidence is how sure you are that bestGuessName matches what they meant; if below 70 give alternativeOptions (with per-100g values).
- Give per-100g calories/protein/carbs/fat for the food as typically prepared/eaten (cooked weight unless they said raw/dry). Base them on a real reference entry (USDA FoodData Central, or the Israeli Ministry of Health database for local foods) and name it in referenceFood. Check that calories ≈ 4×protein + 4×carbs + 9×fat.
- Israeli products and dishes are common (e.g. קוטג׳ 5%, במבה, שניצל, בורקס, לחמניה, פיתה, סלט ישראלי, שקשוקה): use typical Israeli recipes and package sizes.
- For pasta/rice/grains: if the user doesn't say raw/dry, assume the stated grams are cooked.
- Also give hebrewName (common Hebrew name), one emoji, and naturalnessScore.
- Do not include box2d or suggestedAdditions (an addition the user mentions is its own item).
- If the text is not about food at all, set isFood false.

${AMOUNT_RULES}
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
      generationConfig: { responseMimeType: 'application/json', responseSchema: LABEL_SCHEMA, maxOutputTokens: 4096 },
    },
    'Gemini declined to read this photo — try a different shot.',
    (text) => {
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as RawLabelResponse;
      } catch {
        return null;
      }
    },
    { accuracyCritical: true, deterministic: true, effort: 'low', hedgeAfterMs: 14_000 },
  );
}

/** Appends the app's verified food list so the model can point at a real entry instead of estimating. */
function withDatabase(prompt: string, database: string): string {
  return database
    ? `${prompt}\n\nApp food database (id: name). When an item is exactly one of these foods in the same preparation, set databaseId to its id — its verified values will be used. Entries marked "(user's own)" are foods this user saved, often a product they scanned: when the photo or text clearly matches one, prefer it.\n${database}`
    : prompt;
}

export interface PhotoContext {
  /** What the user told us about this meal ("2-egg omelette, fried in oil") — facts the photo can't show. */
  note?: string;
  /** This user's earlier corrections ("You said X → it was really Y"), one per line. */
  corrections?: string;
}

/** Analyzes a food photo, plus anything the user added about it. */
export function analyzeFoodPhoto(
  apiKey: string,
  mediaType: string,
  base64Data: string,
  database = '',
  context: PhotoContext = {},
): Promise<RawAnalysisResponse> {
  let systemPrompt = withDatabase(SYSTEM_PROMPT, database);
  if (context.corrections) {
    systemPrompt += `\n\nThis user corrected your identifications before. When a photo looks like one of these cases, weigh the correction (a strong hint, not a rule):\n${context.corrections}`;
  }
  const parts: unknown[] = [
    { inline_data: { mime_type: mediaType, data: base64Data } },
    { text: 'Analyze this food photo following your protocol.' },
  ];
  const note = context.note?.trim();
  if (note) {
    parts.push({
      text: `The user adds about this meal: «${note}». Treat it as true: it overrides what the photo suggests about identity, counts, amounts and preparation (stated amounts use amountBasis stated_weight / stated_count / stated_measure). Anything it mentions that isn't visible (e.g. "fried in 1 tbsp oil", "2 teaspoons of sugar in the coffee") is its own item with that amount — don't repeat it in suggestedAdditions.`,
    });
  }
  return generateAnalysis(apiKey, systemPrompt, parts, 'Gemini declined to analyze this photo — try a different shot.', {
    effort: 'low',
    hedgeAfterMs: 13_000,
  });
}

/** Looks up foods the user typed (e.g. "150g chicken breast and 200g rice") — any food, with the exact amounts they gave. */
export function analyzeFoodText(apiKey: string, description: string, database = ''): Promise<RawAnalysisResponse> {
  return generateAnalysis(
    apiKey,
    withDatabase(TEXT_SYSTEM_PROMPT, database),
    [{ text: `What I ate: ${description}` }],
    'Gemini declined to analyze that text — try rephrasing.',
    // Amounts are converted by the app's own table, so typed foods don't need the model to "think" — much faster.
    { effort: 'none', hedgeAfterMs: 7_000 },
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
  speed: { effort: Effort; hedgeAfterMs: number },
): Promise<RawAnalysisResponse> {
  return runWithModels<RawAnalysisResponse>(
    apiKey,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      // The cap stops a runaway answer from hanging the scan; a real answer is far shorter.
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 8192 },
    },
    blockedMessage,
    (text) => {
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as RawAnalysisResponse;
      } catch {
        return null;
      }
    },
    { accuracyCritical: true, deterministic: true, ...speed },
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
    generationConfig: { maxOutputTokens: 16384 },
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
      temperature: 0.2,
    });
  } catch (err) {
    if (err instanceof GeminiError && (err.kind === 'invalid_key' || err.kind === 'quota' || err.kind === 'quota_daily' || err.kind === 'network')) throw err;
    // Search tool unavailable for this key/model — answer from the model's own knowledge, clearly flagged.
    const ans = await runWithModels<GroundedAnswer>(apiKey, request(false), 'Gemini declined this research request.', parse, {
      accuracyCritical: true,
      timeoutMs: 150_000,
      temperature: 0.2,
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
      generationConfig: { maxOutputTokens: 4096 },
    },
    'Gemini declined to answer that — try asking differently.',
    (text) => (text.trim() ? text.trim() : null),
    { effort: 'low', temperature: 0.6, hedgeAfterMs: 12_000, stream: true },
  );
}

interface RunOptions {
  /** Put Pro first in "best accuracy" mode. */
  accuracyCritical?: boolean;
  timeoutMs?: number;
  /** How much the model may think before answering; omitted = no thinking setting sent. */
  effort?: Effort;
  /** If the first model hasn't answered by then, also ask the next one and take whichever answers first. */
  hedgeAfterMs?: number;
  /** Same input → same answer: fixed seed, and temperature 0 on models that support it well. */
  deterministic?: boolean;
  /** Temperature for pre-Gemini-3 models (Gemini 3 keeps its recommended default). */
  temperature?: number;
  /** Ask the AI server to stream the answer (when the provider supports it). */
  stream?: boolean;
}

type Outcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'fail'; detail: string; quota?: boolean; daily?: boolean }
  | { kind: 'fatal'; error: GeminiError }
  | { kind: 'aborted' };

/** The request body for one model, with that model's own settings. */
function bodyFor(model: string, requestBody: unknown, options: RunOptions): string {
  const rb = requestBody as { generationConfig?: Record<string, unknown> };
  const gc: Record<string, unknown> = { ...(rb.generationConfig ?? {}) };
  const modern = isModernModel(model);
  if (options.deterministic) {
    gc.seed = DETERMINISTIC_SEED;
    if (!modern) gc.temperature = 0;
  } else if (options.temperature !== undefined && !modern) {
    gc.temperature = options.temperature;
  }
  if (options.effort) {
    const tc = thinkingConfigFor(model, options.effort);
    if (tc) gc.thinkingConfig = tc;
  }
  return JSON.stringify({ ...rb, generationConfig: gc });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One model, start to finish (including a retry without an unsupported thinking setting, and one retry on a dropped connection). */
async function attemptModel<T>(
  apiKey: string,
  model: string,
  requestBody: unknown,
  blockedMessage: string,
  parse: (text: string, raw: any) => T | null,
  options: RunOptions,
  signal: AbortSignal,
): Promise<Outcome<T>> {
  let networkRetried = false;
  for (let tries = 0; tries < 4; tries++) {
    const body = bodyFor(model, requestBody, options);
    let res: FetchedText;
    try {
      res = await fetchText(
        `${API_BASE}/models/${model}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body },
        options.timeoutMs ?? (tierOf(model) === 'pro' ? PRO_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
        signal,
      );
    } catch (err) {
      if (signal.aborted) return { kind: 'aborted' };
      const ge = err instanceof GeminiError ? err : new GeminiError('network', "Couldn't reach Gemini — check your internet connection.", String(err));
      // A timeout on one model shouldn't sink the request — the next model gets a turn.
      if (/Timed out/.test(ge.detail ?? '')) return { kind: 'fail', detail: `${model}: ${ge.detail}` };
      // A dropped connection (switching networks, the phone briefly backgrounding the app) — try once more.
      if (!networkRetried) {
        networkRetried = true;
        await sleep(700);
        if (signal.aborted) return { kind: 'aborted' };
        continue;
      }
      return { kind: 'fatal', error: ge };
    }
    if (signal.aborted) return { kind: 'aborted' };

    if (res.ok) {
      let data: any;
      try {
        data = JSON.parse(res.text);
      } catch {
        return { kind: 'fail', detail: `${model}: unreadable response` };
      }
      if (data?.promptFeedback?.blockReason) {
        return { kind: 'fatal', error: new GeminiError('blocked', blockedMessage, `blockReason: ${data.promptFeedback.blockReason}`) };
      }
      learnVersion(model, data?.modelVersion);
      const finish = data?.candidates?.[0]?.finishReason ?? 'unknown';
      const text = extractText(data);
      if (!text) return { kind: 'fail', detail: `${model}: empty response (finishReason ${finish})` };
      const parsed = parse(text, data);
      if (parsed === null) return { kind: 'fail', detail: `${model}: response was not in the expected format (finishReason ${finish})` };
      lastModelUsed = typeof data?.modelVersion === 'string' && data.modelVersion ? data.modelVersion : model;
      return { kind: 'ok', value: parsed };
    }

    const bodyText = res.text;
    if (isInvalidKeyResponse(res.status, bodyText)) {
      return {
        kind: 'fatal',
        error: new GeminiError('invalid_key', 'Your Gemini API key was rejected — check that it was copied in full.', `${res.status}: ${errorMessageFrom(bodyText)}`),
      };
    }
    if (res.status === 400 && /thinking/i.test(bodyText) && body.includes('thinkingConfig')) {
      // This model doesn't accept that form of thinking setting — remember it and retry with the other form (or none).
      const form = body.includes('thinkingLevel') ? 'level' : 'budget';
      learned = { ...learned, t: { ...learned.t, [model]: { ...learned.t[model], [form]: true } } };
      saveLearned();
      continue;
    }
    if (res.status === 429) {
      coolDown(model, bodyText);
      return { kind: 'fail', detail: `${model}: 429 ${errorMessageFrom(bodyText).slice(0, 160)}`, quota: true, daily: /PerDay/i.test(bodyText) };
    }
    return { kind: 'fail', detail: `${model}: ${res.status} ${errorMessageFrom(bodyText).slice(0, 160)}` };
  }
  return { kind: 'fail', detail: `${model}: gave up after retries` };
}

/** Models to try, best first: Pro first in "best" mode, the same underlying model only once, quota-limited ones last. */
async function modelsToTry(apiKey: string, accuracyCritical?: boolean): Promise<string[]> {
  let models: string[];
  try {
    models = await listUsableModels(apiKey);
  } catch (err) {
    if (err instanceof GeminiError && err.kind === 'invalid_key') throw err;
    models = FALLBACK_MODELS;
  }
  if (accuracyCritical && getAiQuality() === 'best') {
    models = [...models.filter((m) => /pro/.test(m)), ...models.filter((m) => !/pro/.test(m))];
  }
  const seen = new Set<string>();
  models = models.filter((m) => {
    const r = resolvedName(m);
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });
  const now = Date.now();
  const cooling = (m: string) => (learned.c[m] ?? 0) > now;
  return [...models.filter((m) => !cooling(m)), ...models.filter(cooling)];
}

/**
 * Sends a request to the best available models. If the first one is slow,
 * a backup request goes to the next model and whichever answers first wins
 * (the other is cancelled) — so one overloaded model no longer means a long
 * wait. A model that fails (busy, over quota, unusable answer) hands over to
 * the next immediately.
 */
async function runWithModels<T>(
  apiKey: string,
  requestBody: unknown,
  blockedMessage: string,
  parse: (text: string, raw: any) => T | null,
  options: RunOptions = {},
): Promise<T> {
  // AI server set up: it holds the provider keys and switches providers itself.
  // The device's own Gemini key (if any) stays as a backup for when the server can't answer.
  if (isRouterConfigured()) {
    let failure: GeminiError;
    try {
      const out = await routerGenerate(toRouterRequest(requestBody, options), {
        onDelta: options.stream ? () => {} : undefined,
      });
      const raw = out.grounding
        ? { candidates: [{ groundingMetadata: { groundingChunks: out.grounding.sources.map((s) => ({ web: { uri: s.url, title: s.title } })), webSearchQueries: out.grounding.queries } }] }
        : {};
      const parsed = parse(out.text, raw);
      if (parsed !== null) {
        lastModelUsed = `${out.provider} · ${out.model}`;
        return parsed;
      }
      failure = new GeminiError('bad_response', "The AI answer wasn't in the expected format — try again.", `${out.provider}/${out.model}: unparseable`);
    } catch (err) {
      failure = routerError(err);
    }
    if (!apiKey || apiKey === ROUTER_ONLY || failure.kind === 'blocked') throw failure;
  }
  if (!apiKey || apiKey === ROUTER_ONLY) throw new GeminiError('invalid_key', 'AI is not set up — add the AI server or a Gemini key in Settings.');
  const models = await modelsToTry(apiKey, options.accuracyCritical);
  const failures: string[] = [];
  let sawQuota = false;
  let dailyFailures = 0;

  return new Promise<T>((resolve, reject) => {
    const queue = [...models];
    const live = new Set<AbortController>();
    let done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      live.forEach((c) => c.abort());
      live.clear();
      settle();
    };

    const launch = (): boolean => {
      const model = queue.shift();
      if (!model) return false;
      const ctrl = new AbortController();
      live.add(ctrl);
      attemptModel(apiKey, model, requestBody, blockedMessage, parse, options, ctrl.signal).then(
        (o) => {
          live.delete(ctrl);
          if (done || o.kind === 'aborted') return;
          if (o.kind === 'ok') return finish(() => resolve(o.value));
          if (o.kind === 'fatal') return finish(() => reject(o.error));
          failures.push(o.detail);
          if (o.quota) sawQuota = true;
          if (o.daily) dailyFailures++;
          if (!launch() && live.size === 0) finish(() => reject(finalError(failures, sawQuota, dailyFailures)));
        },
        (err) => {
          live.delete(ctrl);
          finish(() => reject(err instanceof GeminiError ? err : new GeminiError('unknown', "Gemini couldn't analyze that right now.", String(err))));
        },
      );
      return true;
    };

    launch();
    if (options.hedgeAfterMs && queue.length > 0) {
      hedgeTimer = setTimeout(() => {
        if (!done && live.size === 1) launch();
      }, options.hedgeAfterMs);
    }
  });
}

/** The app's Gemini-shaped request → the router's provider-neutral request. */
function toRouterRequest(requestBody: unknown, options: RunOptions): RouterRequest {
  const b = requestBody as {
    system_instruction?: { parts?: { text?: string }[] };
    contents?: { role?: string; parts?: { text?: string; inline_data?: { mime_type: string; data: string } }[] }[];
    generationConfig?: { responseSchema?: unknown; maxOutputTokens?: number };
    tools?: Record<string, unknown>[];
  };
  const search = (b.tools ?? []).some((t) => 'google_search' in t);
  const schema = b.generationConfig?.responseSchema;
  const tier: RouterTier = options.accuracyCritical && getAiQuality() === 'best' ? 'best' : options.effort === 'none' && !schema ? 'fast' : 'balanced';
  return {
    capability: search ? 'web_search' : undefined, // text vs image is worked out by the server from the parts
    tier,
    system: (b.system_instruction?.parts ?? []).map((p) => p.text ?? '').join('\n'),
    messages: (b.contents ?? []).map((c) => ({
      role: c.role === 'model' ? 'assistant' : 'user',
      parts: (c.parts ?? []).map((p) => (p.inline_data ? { image: { mimeType: p.inline_data.mime_type, data: p.inline_data.data } } : { text: p.text ?? '' })),
    })),
    json: schema ? { schema } : null,
    maxTokens: b.generationConfig?.maxOutputTokens,
    temperature: options.temperature,
    deterministic: options.deterministic,
    thinking: options.effort === 'none' ? 'none' : 'default',
    deadlineMs: options.timeoutMs ?? 55_000,
  };
}

function routerError(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;
  if (!(err instanceof RouterFailure)) return new GeminiError('unknown', "The AI server couldn't answer right now.", String(err));
  const detail = [err.code, err.detail].filter(Boolean).join(': ');
  switch (err.code) {
    case 'unauthorized':
      return new GeminiError('invalid_key', 'The AI server rejected the access code — check it in Settings.', detail);
    case 'daily_limit':
      return new GeminiError('quota_daily', 'Every AI provider on the server has used up its free daily limit — it comes back tomorrow. Meanwhile you can enter the values yourself.', detail);
    case 'rate_limited':
    case 'all_cooling':
      return new GeminiError('quota', 'All AI providers are at their limit right now — try again in a minute.', detail);
    case 'auth':
      return new GeminiError('unknown', 'The provider keys on the AI server were rejected — check them in the server settings.', detail);
    case 'network':
    case 'timeout':
      return new GeminiError('network', err.message, detail);
    case 'no_providers':
    case 'not_configured':
      return new GeminiError('unknown', 'The AI server has no provider keys set up yet.', detail);
    default:
      return new GeminiError('bad_response', "The AI server couldn't answer right now.", detail || err.message);
  }
}

function finalError(failures: string[], sawQuota: boolean, dailyFailures = 0): GeminiError {
  const detail = failures.join(' | ');
  // Every model is out of its free DAILY quota: waiting a minute won't help — say when it comes back.
  if (dailyFailures > 0 && dailyFailures === failures.filter((f) => /: 429 /.test(f)).length && failures.every((f) => /: 429 /.test(f) || /: 5\d\d /.test(f))) {
    return new GeminiError(
      'quota_daily',
      `Gemini's free daily limit on your key is used up for today — it comes back at about ${dailyResetLocalTime()}. Meanwhile you can enter the values yourself or search the food list.`,
      detail,
    );
  }
  if (sawQuota && failures.every((f) => /: 429 /.test(f) || /: 5\d\d /.test(f))) {
    return new GeminiError('quota', "You've hit Gemini's free usage limit for now — wait a minute (or until tomorrow for the daily limit) and try again.", detail);
  }
  if (failures.some((f) => /: 5\d\d /.test(f))) {
    return new GeminiError('overloaded', "Gemini's servers are busy right now — try again in a minute.", detail);
  }
  if (sawQuota) {
    return new GeminiError('quota', "You've hit Gemini's free usage limit for now — wait a minute (or until tomorrow for the daily limit) and try again.", detail);
  }
  if (failures.some((f) => /Timed out/.test(f))) {
    return new GeminiError('network', 'Gemini took too long to answer — try again.', detail);
  }
  return new GeminiError('bad_response', "Gemini couldn't analyze that right now.", detail);
}
