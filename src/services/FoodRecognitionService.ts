import { FOODS, findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { generateId } from '@/utils/id';
import { getAiQuality, getAiAccessKey } from '@/utils/geminiKey';
import { cacheGet, cacheSet, fingerprint } from '@/utils/resultCache';
import { lookupLocally, type LocalTextMatch } from '@/utils/localTextLookup';
import { pluralizeUnit } from '@/utils/units';
import { downscaleImage } from '@/utils/resizeImage';
import { correctionFor, correctionsForPrompt } from '@/utils/scanCorrections';
import {
  EGG_FOOD_IDS,
  gramsPerMeasure,
  isEggUnit,
  MEASURE_LABEL,
  measureClassOf,
  measureFromWord,
  plainEggDishId,
  type MeasureUnit,
} from '@/data/portions';
import {
  analyzeFoodPhoto,
  analyzeFoodText,
  analyzeNutritionLabel,
  GeminiError,
  getLastModelUsed,
  type RawAlternative,
  type RawAnalysisItem,
  type RawAnalysisResponse,
  type RawLabelResponse,
} from '@/services/geminiVision';
import { useAppStore } from '@/store/useAppStore';
import type { FoodAlternative, FoodItem, NaturalnessInfo, NutritionFacts, ScanResult, ScannedFoodCandidate, ServingOption, SuggestedDetail } from '@/types';

export interface RecognizeOptions {
  /** Skip remembered answers and ask the AI again. */
  fresh?: boolean;
  /** Photos: what the user told us about the meal (counts, hidden oil, what it really is). */
  note?: string;
}

export interface FoodRecognitionServiceInterface {
  recognize(imageDataUrl: string, opts?: RecognizeOptions): Promise<ScanResult>;
  recognizeText(description: string, opts?: RecognizeOptions): Promise<ScanResult>;
  recognizeLabel(imageDataUrl: string, opts?: RecognizeOptions): Promise<ScanResult>;
}

/** Bump when prompts change, so remembered answers from older prompts aren't reused. */
const PROMPT_VERSION = 6;
const cacheKey = (kind: string, content: string) => `${kind}:v${PROMPT_VERSION}:${getAiQuality()}:${fingerprint(content)}`;

/** Rounds an estimated weight so tiny model-to-model wobble (183 g vs 187 g) doesn't show up as a different answer. */
function roundGrams(g: number): number {
  if (g < 50) return Math.max(1, Math.round(g / 5) * 5);
  return Math.round(g / 10) * 10;
}

/** A photo with any item below this confidence gets a second opinion from the strongest available model. */
const SECOND_OPINION_BELOW = 60;
const meanConfidence = (d: RawAnalysisResponse) => {
  const items = d.items ?? [];
  return items.length ? items.reduce((sum, i) => sum + (i.identificationConfidence ?? 0), 0) / items.length : 0;
};

/** Below this identification confidence, the UI must show alternatives instead of asserting the name as fact. */
export const IDENTIFICATION_CONFIDENCE_THRESHOLD = 70;

// Fallback path when the user hasn't added their own Gemini key: the
// Cloudflare Worker in backend/food-recognition-worker/, which holds a key
// server-side. VITE_FOOD_RECOGNITION_API_URL overrides it.
const WORKER_URL = (import.meta.env.VITE_FOOD_RECOGNITION_API_URL as string | undefined) || 'https://callapp.avihihaviv.workers.dev';

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Match against our own verified database — we always prefer real reference
 * data over the model's own per-100g guess. The model points at an entry by
 * id (it sees the list), which is far more reliable than fuzzy name matching:
 * substring matching used to map e.g. "fried egg" onto boiled eggs.
 */
function matchLocalFood(name: string, databaseId?: string): FoodItem | undefined {
  if (databaseId) {
    // Built-in foods first, then the user's own saved foods (a product they scanned, a food they logged before).
    const byId = findFoodById(databaseId);
    if (byId) return byId;
  }
  const q = normalize(name);
  if (!q) return undefined;
  const exact = FOODS.find((f) => normalize(f.name) === q || (f.nameHe && f.nameHe === name.trim()));
  if (exact) return exact;
  // "1-egg omelette", "Fried eggs": plain egg dishes map to the verified entry (mixed ones like "omelette with cheese" don't).
  const eggId = plainEggDishId(name);
  if (eggId) return FOODS.find((f) => f.id === eggId);
  // A food the user already logged before (exact name) keeps the same values every time.
  return useAppStore.getState().customFoods.find((f) => normalize(f.name) === q);
}

/** "id: name" lines for the model, so it can point at verified entries. */
const BUILT_IN_FOR_AI = FOODS.map((f) => `${f.id}: ${f.name}`).join('\n');
const MAX_USER_FOODS_FOR_AI = 60;

/** Built-in foods plus the user's own most recent saved foods, so a product they scanned once is recognized with its exact values. */
function databaseForAI(): string {
  const mine = useAppStore.getState().customFoods.slice(-MAX_USER_FOODS_FOR_AI).reverse();
  if (mine.length === 0) return BUILT_IN_FOR_AI;
  const lines = mine.map((f) => `${f.id}: ${f.name}${f.nameHe ? ` / ${f.nameHe}` : ''} (user's own)`);
  return `${BUILT_IN_FOR_AI}\n${lines.join('\n')}`;
}

/** Calories implied by the macros (Atwater factors 4/4/9). */
function atwater(p: NutritionFacts): number {
  return 4 * p.proteinG + 4 * p.carbsG + 9 * p.fatG;
}

/** Fixes per-100g values whose calories clearly don't match their own macros (a model slip), trusting the macro breakdown. */
function reconcileCalories(p: NutritionFacts): NutritionFacts {
  const implied = atwater(p);
  if (implied <= 0) return p;
  if (p.calories <= 0 || Math.abs(p.calories - implied) / implied > 0.35) {
    return { ...p, calories: Math.round(implied) };
  }
  return p;
}

function slug(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function naturalnessFrom(score: number | undefined, why: string): NaturalnessInfo {
  if (typeof score === 'number' && score >= 1 && score <= 100) return { score: Math.round(score), reasons: [why] };
  return { score: 50, reasons: ['Not rated — no ingredient data'] };
}

const SAFE_NUM = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0);

/** The record saved into "My foods" when an AI-identified food is logged, so it's searchable and re-loggable later. */
function customFoodFromItem(item: RawAnalysisItem, id: string, per100g: NutritionFacts, grams: number, amount: AmountResolution): FoodItem {
  const isMeasure = !!amount.measure;
  const unitGrams = !isMeasure && amount.unitGrams ? Math.round(amount.unitGrams) : null;
  const servings: ServingOption[] = [{ label: '100g', unit: 'g', grams: 100 }];
  const portion: ServingOption = unitGrams
    ? { label: `1 piece (${unitGrams}g)`, unit: 'piece', grams: unitGrams }
    : { label: `1 portion (${grams}g)`, unit: 'serving', grams };
  servings.push(portion);
  return {
    id,
    name: item.bestGuessName,
    nameHe: item.hebrewName || undefined,
    category: 'My foods',
    imageEmoji: item.emoji || '🍽️',
    per100g,
    servingOptions: servings,
    defaultServing: portion,
    dataQuality: 'ai_estimate',
    source: item.referenceFood ? `AI estimate · based on ${item.referenceFood}` : 'AI estimate (Gemini)',
    naturalness: naturalnessFrom(item.naturalnessScore, 'AI estimate of how processed this food is'),
    measureClass: measureClassOf(undefined, item.measureClass),
  };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

interface AmountResolution {
  grams: number;
  range?: [number, number];
  unitCount?: number;
  unitLabel?: string;
  unitGrams?: number;
  measure?: MeasureUnit;
  note?: string;
}

/** Can the AI's unit ("slices") use this food's verified piece weight ("1 slice (32g)")? */
function pieceFits(unitLabel: string | undefined, pieceLabel: string, food: FoodItem): boolean {
  if (!unitLabel) return false;
  const u = unitLabel.toLowerCase().replace(/(es|s)$/, '').trim();
  const p = pieceLabel.toLowerCase();
  if (u && p.includes(u)) return true;
  // Whole fruit/veg pieces are labelled "1 medium (123g)": accept "tomatoes", "pieces", "whole"…
  if (/^1 (medium|small|large)/.test(p)) {
    return /^(piece|unit|whole|fruit|item|pc)$/.test(u) || food.name.toLowerCase().startsWith(u.slice(0, 4));
  }
  return false;
}

/**
 * Works out how much was eaten. The AI identifies and counts; grams come from
 * fixed tables wherever possible (eggs, spoons, cups, verified piece weights),
 * so "a 1-egg omelette" is always 60 g and "a tablespoon of hummus" 20 g —
 * never a different guess each time. Only a true visual estimate uses the
 * AI's weight, rounded.
 */
function resolveAmount(item: RawAnalysisItem, localFood: FoodItem | undefined, kind: 'photo' | 'text'): AmountResolution {
  const rawMin = item.estimatedGramsMin ?? item.estimatedGramsMax ?? 100;
  const rawMax = item.estimatedGramsMax ?? item.estimatedGramsMin ?? 100;
  const mid = (rawMin + rawMax) / 2;

  // 1. Grams the user typed are never changed.
  if (item.amountBasis === 'stated_weight' && rawMin > 0) {
    return { grams: Math.round(mid) };
  }

  // 2. Plain egg dishes: number of eggs × verified weight per egg.
  const eggs = item.wholeEggs && item.wholeEggs > 0 ? item.wholeEggs : item.isCountable && isEggUnit(item.unitLabel) ? item.unitCount : undefined;
  if (eggs && eggs > 0 && eggs <= 12 && localFood && EGG_FOOD_IDS.has(localFood.id)) {
    const per = localFood.servingOptions.find((o) => o.unit === 'piece')?.grams;
    if (per) {
      const unit = eggs === 1 ? 'egg' : 'eggs';
      return { grams: Math.round(per * eggs), unitCount: eggs, unitLabel: unit, unitGrams: per, note: `${fmt(eggs)} ${unit} × ${per} g per egg (standard)` };
    }
  }

  // 3. Household measures (כף, כפית, כוס, חופן): a fixed table, not a guess.
  const measure: MeasureUnit | undefined =
    item.measureUnit && item.measureUnit !== 'none' ? item.measureUnit : item.isCountable ? measureFromWord(item.unitLabel) : undefined;
  const measureCount = item.measureUnit && item.measureUnit !== 'none' ? item.measureCount : item.unitCount;
  if (measure && measureCount && measureCount > 0 && measureCount <= 20) {
    const per = gramsPerMeasure(localFood, measure, item.measureClass);
    if (per) {
      const [one, many] = MEASURE_LABEL[measure];
      const label = measureCount <= 1 ? one : many;
      return {
        grams: Math.round(per * measureCount),
        unitCount: measureCount,
        unitLabel: label,
        unitGrams: per,
        measure,
        note: `${fmt(measureCount)} ${label} × ${per} g (standard household measure)`,
      };
    }
  }

  // 4. Counted units: the verified piece weight when the unit matches, else the AI's own weight per unit.
  if (item.isCountable && item.unitCount && item.unitCount > 0) {
    const count = item.unitCount;
    const piece = localFood?.servingOptions.find((o) => o.unit === 'piece');
    if (localFood && piece && pieceFits(item.unitLabel, piece.label, localFood)) {
      return { grams: Math.round(piece.grams * count), unitCount: count, unitLabel: pluralizeUnit(item.unitLabel, count), unitGrams: piece.grams, note: `${fmt(count)} × ${piece.label}` };
    }
    return { grams: Math.round(mid), unitCount: count, unitLabel: pluralizeUnit(item.unitLabel, count), unitGrams: mid / count };
  }

  // 5. A real estimate: an exact typed amount stays as is, an estimated range is rounded.
  if (rawMin === rawMax) return { grams: Math.round(mid) };
  const min = roundGrams(rawMin);
  const max = roundGrams(rawMax);
  return { grams: roundGrams(mid), range: min !== max ? [min, max] : undefined };
}

function confidenceBand(pct: number): ScannedFoodCandidate['confidence'] {
  if (pct >= 85) return 'high';
  if (pct >= IDENTIFICATION_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
}

/** Gemini's native [ymin, xmin, ymax, xmax] box (0-1000) → percentages for the overlay; older % boxes still work. */
function boxFrom(item: RawAnalysisItem): ScannedFoodCandidate['boundingBox'] {
  const b = item.box2d;
  if (Array.isArray(b)) {
    if (b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
    const [y0, x0, y1, x1] = b.map((n) => Math.max(0, Math.min(1000, n)));
    if (x1 - x0 < 10 || y1 - y0 < 10) return undefined;
    return { xPct: x0 / 10, yPct: y0 / 10, wPct: (x1 - x0) / 10, hPct: (y1 - y0) / 10 };
  }
  const { boxXPct: x, boxYPct: y, boxWPct: w, boxHPct: h } = item;
  if ([x, y, w, h].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return undefined;
  if (x! < 0 || y! < 0 || w! <= 0 || h! <= 0 || x! + w! > 101 || y! + h! > 101) return undefined;
  return { xPct: x!, yPct: y!, wPct: w!, hPct: h! };
}

function per100gFromAlternative(a: RawAlternative): NutritionFacts | undefined {
  const p = {
    calories: SAFE_NUM(a.per100gCalories),
    proteinG: SAFE_NUM(a.per100gProteinG),
    carbsG: SAFE_NUM(a.per100gCarbsG),
    fatG: SAFE_NUM(a.per100gFatG),
  };
  return p.calories + p.proteinG + p.carbsG + p.fatG > 0 ? reconcileCalories(p) : undefined;
}

/**
 * Other things this item could be, so a wrong guess is a one-tap fix: what
 * the user chose the last time the AI said the same name comes first, then
 * the AI's runner-ups (with their own values, or the verified entry when one
 * matches).
 */
function alternativesFor(item: RawAnalysisItem, chosen: FoodItem | undefined): FoodAlternative[] | undefined {
  const out: FoodAlternative[] = [];
  const seen = new Set([normalize(chosen?.name ?? item.bestGuessName)]);
  const push = (alt: FoodAlternative) => {
    const k = normalize(alt.label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(alt);
  };
  const past = correctionFor(item.bestGuessName);
  if (past) {
    const food = past.toId ? findFoodById(past.toId) : matchLocalFood(past.to);
    push({ label: food?.name ?? past.to, foodId: food?.id, fromCorrection: true });
  }
  for (const a of item.alternativeOptions ?? []) {
    if (!a || typeof a.name !== 'string' || !a.name.trim()) continue;
    const food = matchLocalFood(a.name, a.databaseId);
    push(food ? { label: food.name, foodId: food.id } : { label: a.name.trim(), per100g: per100gFromAlternative(a) });
  }
  for (const label of item.alternatives ?? []) {
    if (typeof label === 'string') push({ label, foodId: matchLocalFood(label)?.id });
  }
  return out.length > 0 ? out.slice(0, 4) : undefined;
}

const ADDITION_TYPES = new Set<SuggestedDetail['type']>(['oil', 'butter', 'sauce', 'dressing', 'sugar', 'cheese']);
const ADDITION_UNITS = new Set<SuggestedDetail['unit']>(['g', 'tbsp', 'tsp']);

/** The AI's "probably cooked in oil"-style hints, sanity-limited. Only offered — the user decides. */
function suggestionsFrom(item: RawAnalysisItem): SuggestedDetail[] | undefined {
  const list: SuggestedDetail[] = [];
  for (const a of item.suggestedAdditions ?? []) {
    const type = a?.type as SuggestedDetail['type'];
    const unit = a?.unit as SuggestedDetail['unit'];
    if (!ADDITION_TYPES.has(type) || !ADDITION_UNITS.has(unit) || !(a.amount > 0)) continue;
    const amount = unit === 'g' ? Math.min(60, Math.max(1, Math.round(a.amount))) : Math.min(4, Math.max(0.5, Math.round(a.amount * 2) / 2));
    if (list.some((x) => x.type === type)) continue;
    list.push({ type, amount, unit, reason: typeof a.reason === 'string' ? a.reason.slice(0, 80) : '' });
  }
  return list.length > 0 ? list.slice(0, 2) : undefined;
}

/** A food record for an alternative the user picked that isn't in the database (values: the AI's per-100g estimate). */
export function foodFromAlternative(alt: FoodAlternative, grams: number): FoodItem | undefined {
  if (!alt.per100g) return undefined;
  const portion: ServingOption = { label: `1 portion (${grams}g)`, unit: 'serving', grams };
  return {
    id: `ai-${slug(alt.label)}`,
    name: alt.label,
    category: 'My foods',
    imageEmoji: alt.emoji || '🍽️',
    per100g: alt.per100g,
    servingOptions: [{ label: '100g', unit: 'g', grams: 100 }, portion],
    defaultServing: portion,
    dataQuality: 'ai_estimate',
    source: 'AI estimate (Gemini)',
    naturalness: naturalnessFrom(undefined, ''),
  };
}

function buildCandidate(item: RawAnalysisItem, kind: 'photo' | 'text'): ScannedFoodCandidate {
  const localFood = matchLocalFood(item.bestGuessName, item.databaseId);
  const per100g: NutritionFacts = localFood
    ? localFood.per100g
    : reconcileCalories({
        calories: SAFE_NUM(item.per100gCalories),
        proteinG: SAFE_NUM(item.per100gProteinG),
        carbsG: SAFE_NUM(item.per100gCarbsG),
        fatG: SAFE_NUM(item.per100gFatG),
      });

  const amount = resolveAmount(item, localFood, kind);
  const grams = Math.max(1, Math.min(3000, amount.grams));

  const confidence = Math.max(0, Math.min(100, Math.round(item.identificationConfidence ?? 0)));
  const identificationCertain = confidence >= IDENTIFICATION_CONFIDENCE_THRESHOLD;
  const foodId = localFood?.id ?? `ai-${slug(item.bestGuessName)}`;

  return {
    id: generateId('cand'),
    foodId,
    name: localFood?.name ?? item.bestGuessName,
    imageEmoji: localFood?.imageEmoji ?? item.emoji,
    customFood: localFood ? undefined : customFoodFromItem(item, foodId, per100g, grams, amount),
    seenDescription: item.seenDescription,
    visibleExtras: item.visibleExtras && item.visibleExtras.length > 0 ? item.visibleExtras : undefined,
    unitCount: amount.unitCount,
    unitLabel: amount.unitCount ? amount.unitLabel : undefined,
    unitGrams: amount.unitGrams,
    amountNote: amount.note,
    estimatedGrams: grams,
    estimatedGramsRange: amount.range,
    per100gUsed: per100g,
    nutrition: calculateNutrition(per100g, grams),
    identificationConfidence: confidence,
    confidence: confidenceBand(confidence),
    // Photos always offer runner-ups (a confident wrong guess is the common failure); typed text only when unsure.
    alternatives: kind === 'photo' || !identificationCertain ? alternativesFor(item, localFood) : undefined,
    suggestedDetails: kind === 'photo' ? suggestionsFrom(item) : undefined,
    aiName: item.bestGuessName,
    matchedLocalFood: !!localFood,
    nutritionSource: localFood?.source ?? (item.referenceFood ? `AI estimate · based on ${item.referenceFood}` : 'AI estimate'),
    boundingBox: kind === 'photo' ? boxFrom(item) : undefined,
  };
}

function unavailable(
  imageDataUrl: string,
  reason: string,
  extra: { detail?: string; needsApiKey?: boolean } = {},
): ScanResult {
  return {
    id: generateId('scan'),
    imageDataUrl,
    candidates: [],
    createdAt: new Date().toISOString(),
    recognitionAvailable: false,
    unavailableReason: reason,
    unavailableDetail: extra.detail,
    needsApiKey: extra.needsApiKey,
  };
}

/** The no-key fallback: our Cloudflare Worker proxy. */
async function analyzeViaWorker(imageDataUrl: string): Promise<RawAnalysisResponse | ScanResult> {
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return unavailable(imageDataUrl, 'Photo scanning needs your own free Gemini key — add it in Settings (takes a minute).', {
        detail: `Shared service returned ${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
        needsApiKey: true,
      });
    }
    return (await res.json()) as RawAnalysisResponse;
  } catch (err) {
    return unavailable(imageDataUrl, 'Photo scanning needs your own free Gemini key — add it in Settings (takes a minute).', {
      detail: String(err),
      needsApiKey: true,
    });
  }
}

/**
 * Real photo recognition. With the user's own Gemini key it calls Gemini
 * directly from this device; without one it falls back to the shared Worker.
 * Deliberately has NO fabricated fallback: any failure returns
 * recognitionAvailable: false with the real reason, never invented foods.
 */
class RealFoodRecognitionService implements FoodRecognitionServiceInterface {
  async recognize(originalDataUrl: string, opts: RecognizeOptions = {}): Promise<ScanResult> {
    const imageDataUrl = await downscaleImage(originalDataUrl);
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return unavailable(imageDataUrl, 'Couldn’t read that photo — try taking it again.');
    }
    const [, mediaType, base64Data] = match;

    let data: RawAnalysisResponse;
    const apiKey = getAiAccessKey();
    const note = opts.note?.trim() ?? '';
    const key = cacheKey('photo', note ? `${base64Data}|${note}` : base64Data);
    const remembered = opts.fresh ? undefined : cacheGet<RawAnalysisResponse>(key);
    let resultSource: ScanResult['resultSource'] = 'ai';
    let firstModel: string | undefined;
    let secondOpinion: ScanResult['secondOpinion'];
    if (remembered) {
      data = remembered;
      resultSource = 'cache';
    } else if (apiKey) {
      try {
        const started = Date.now();
        data = await analyzeFoodPhoto(apiKey, mediaType, base64Data, databaseForAI(), { note, corrections: correctionsForPrompt() });
        firstModel = getLastModelUsed() ?? undefined;
        // Hard photo (the AI isn't sure what something is): ask the strongest available model for a second opinion and keep the surer answer.
        const unsure = (data.items ?? []).some((i) => (i.identificationConfidence ?? 100) < SECOND_OPINION_BELOW);
        if (unsure && data.isFood !== false && !data.unusable && Date.now() - started < 25_000) {
          try {
            const second = await analyzeFoodPhoto(apiKey, mediaType, base64Data, databaseForAI(), { note, corrections: correctionsForPrompt(), secondOpinion: true });
            const secondModel = getLastModelUsed() ?? undefined;
            if (second.isFood !== false && second.items?.length && meanConfidence(second) > meanConfidence(data)) {
              data = second;
              secondOpinion = { from: firstModel, by: secondModel };
            } else {
              secondOpinion = { from: firstModel, by: secondModel, kept: true };
            }
          } catch {
            /* the first answer stands */
          }
        }
        if (data.isFood !== false && !data.unusable && data.items?.length) cacheSet(key, data);
      } catch (err) {
        if (err instanceof GeminiError) {
          return unavailable(imageDataUrl, err.message, { detail: err.detail, needsApiKey: err.kind === 'invalid_key' });
        }
        return unavailable(imageDataUrl, 'Something went wrong analyzing this photo — try again.', { detail: String(err) });
      }
    } else {
      const viaWorker = await analyzeViaWorker(imageDataUrl);
      if ('recognitionAvailable' in viaWorker) return viaWorker;
      data = viaWorker;
      if (data.error) {
        return unavailable(imageDataUrl, 'Photo scanning needs your own free Gemini key — add it in Settings (takes a minute).', {
          detail: data.error,
          needsApiKey: true,
        });
      }
    }

    if (data.isFood === false) {
      return unavailable(imageDataUrl, 'That doesn’t look like food — try a clearer photo of your meal.');
    }
    if (data.unusable || !data.items || data.items.length === 0) {
      return unavailable(imageDataUrl, data.unusableReason || 'Couldn’t identify anything in this photo — try a clearer, well-lit shot.');
    }

    const candidates = data.items.map((item) => buildCandidate(item, 'photo'));
    return {
      id: generateId('scan'),
      imageDataUrl,
      candidates,
      createdAt: new Date().toISOString(),
      recognitionAvailable: true,
      modelUsed: apiKey && resultSource === 'ai' ? (secondOpinion && !secondOpinion.kept ? secondOpinion.by : firstModel) : undefined,
      resultSource,
      secondOpinion,
    };
  }

  /** Reads a nutrition facts label from a package photo: exact printed values instead of an estimate. */
  async recognizeLabel(originalDataUrl: string, opts: RecognizeOptions = {}): Promise<ScanResult> {
    // Labels need legible small print, so keep more resolution than meal photos.
    const imageDataUrl = await downscaleImage(originalDataUrl, 2000, 0.9);
    const base = { inputKind: 'label' as const };
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return { ...unavailable(imageDataUrl, 'Couldn’t read that photo — try taking it again.'), ...base };
    const apiKey = getAiAccessKey();
    if (!apiKey) {
      return { ...unavailable(imageDataUrl, 'Label scanning needs your free Gemini key — add it in Settings (takes a minute).', { needsApiKey: true }), ...base };
    }
    let label: RawLabelResponse;
    const key = cacheKey('label', match[2]);
    const remembered = opts.fresh ? undefined : cacheGet<RawLabelResponse>(key);
    try {
      label = remembered ?? (await analyzeNutritionLabel(apiKey, match[1], match[2]));
      if (!remembered && label.isLabel && label.per100Calories != null) cacheSet(key, label);
    } catch (err) {
      if (err instanceof GeminiError) {
        return { ...unavailable(imageDataUrl, err.message, { detail: err.detail, needsApiKey: err.kind === 'invalid_key' }), ...base };
      }
      return { ...unavailable(imageDataUrl, 'Something went wrong reading this label — try again.', { detail: String(err) }), ...base };
    }
    if (!label.isLabel || label.per100Calories == null) {
      return {
        ...unavailable(imageDataUrl, label.unreadableReason || 'Couldn’t find a readable nutrition table — photograph the "nutrition facts" box up close and flat.'),
        ...base,
      };
    }
    return {
      id: generateId('scan'),
      imageDataUrl,
      candidates: [candidateFromLabel(label)],
      createdAt: new Date().toISOString(),
      recognitionAvailable: true,
      inputKind: 'label',
      modelUsed: remembered ? undefined : (getLastModelUsed() ?? undefined),
      resultSource: remembered ? 'cache' : 'ai',
    };
  }

  /** Looks up typed foods ("150g chicken breast, 200g rice") with the user's own gram amounts. Needs the user's Gemini key. */
  async recognizeText(description: string, opts: RecognizeOptions = {}): Promise<ScanResult> {
    const text = description.trim();
    const apiKey = getAiAccessKey();
    const base = { inputKind: 'text' as const };
    if (!text) return { ...unavailable('', 'Type what you ate first.'), ...base };

    // Foods clearly in the built-in list are answered instantly, on the device.
    const local = opts.fresh ? null : lookupLocally(text);
    if (local) {
      return {
        id: generateId('scan'),
        candidates: local.map((m) => localCandidate(m)),
        createdAt: new Date().toISOString(),
        recognitionAvailable: true,
        inputKind: 'text',
        resultSource: 'local',
      };
    }
    if (!apiKey) {
      return {
        ...unavailable('', 'Typing foods needs your free Gemini key — add it in Settings (takes a minute).', { needsApiKey: true }),
        ...base,
      };
    }

    let data: RawAnalysisResponse;
    const key = cacheKey('text', normalize(text));
    const remembered = opts.fresh ? undefined : cacheGet<RawAnalysisResponse>(key);
    try {
      data = remembered ?? (await analyzeFoodText(apiKey, text, databaseForAI()));
      if (!remembered && data.isFood !== false && data.items?.length) cacheSet(key, data);
    } catch (err) {
      if (err instanceof GeminiError) {
        return { ...unavailable('', err.message, { detail: err.detail, needsApiKey: err.kind === 'invalid_key' }), ...base };
      }
      return { ...unavailable('', 'Something went wrong — try again.', { detail: String(err) }), ...base };
    }

    if (data.isFood === false || !data.items || data.items.length === 0) {
      return { ...unavailable('', 'I couldn’t find a food in that — try something like “150g chicken breast, 200g rice”.'), ...base };
    }
    return {
      id: generateId('scan'),
      candidates: data.items.map((item) => buildCandidate(item, 'text')),
      createdAt: new Date().toISOString(),
      recognitionAvailable: true,
      inputKind: 'text',
      modelUsed: remembered ? undefined : (getLastModelUsed() ?? undefined),
      resultSource: remembered ? 'cache' : 'ai',
    };
  }
}

/** A typed food matched exactly in the built-in list — verified values, no AI. */
function localCandidate(m: LocalTextMatch): ScannedFoodCandidate {
  const { raw, food, grams, count, portionAssumed } = m;
  return {
    id: generateId('cand'),
    foodId: food.id,
    name: food.name,
    imageEmoji: food.imageEmoji,
    seenDescription: portionAssumed ? `You wrote: "${raw}" — no amount given, so a typical portion is used. Adjust below.` : `You wrote: "${raw}"`,
    unitCount: count,
    unitLabel: count ? m.unitLabel || 'pcs' : undefined,
    unitGrams: count ? m.unitGrams : undefined,
    amountNote: portionAssumed ? `No amount given — typical portion: ${food.defaultServing.label}` : m.note,
    estimatedGrams: grams,
    per100gUsed: food.per100g,
    nutrition: calculateNutrition(food.per100g, grams),
    identificationConfidence: 100,
    confidence: 'high',
    matchedLocalFood: true,
    nutritionSource: food.source,
  };
}

function candidateFromLabel(label: RawLabelResponse): ScannedFoodCandidate {
  const name = [label.brand, label.productName].filter(Boolean).join(' ') || 'Packaged product';
  const id = `label-${slug(name)}`;
  const per100g: NutritionFacts = {
    calories: SAFE_NUM(label.per100Calories),
    proteinG: SAFE_NUM(label.per100ProteinG),
    carbsG: SAFE_NUM(label.per100CarbsG),
    fatG: SAFE_NUM(label.per100FatG),
    ...(label.per100FiberG != null ? { fiberG: SAFE_NUM(label.per100FiberG) } : {}),
    ...(label.per100SugarG != null ? { sugarG: SAFE_NUM(label.per100SugarG) } : {}),
    ...(label.per100SodiumMg != null ? { sodiumMg: SAFE_NUM(label.per100SodiumMg) } : {}),
  };
  const unit: ServingOption['unit'] = label.isLiquid ? 'ml' : 'g';
  const per = label.isLiquid ? '100ml' : '100g';
  const servingGrams = label.servingSizeG && label.servingSizeG > 0 ? Math.round(label.servingSizeG) : null;
  const servings: ServingOption[] = [{ label: per, unit, grams: 100 }];
  if (servingGrams) servings.push({ label: label.servingLabel || `1 serving (${servingGrams}${unit})`, unit: 'serving', grams: servingGrams });
  if (label.packageSizeG && label.packageSizeG > 0) {
    servings.push({ label: `Whole package (${Math.round(label.packageSizeG)}${unit})`, unit: 'serving', grams: Math.round(label.packageSizeG) });
  }
  const grams = servingGrams ?? 100;
  const food: FoodItem = {
    id,
    name,
    nameHe: label.hebrewName || undefined,
    category: 'My foods',
    imageEmoji: label.emoji || '🏷️',
    per100g,
    servingOptions: servings,
    defaultServing: servings.find((s) => s.grams === grams) ?? servings[0],
    dataQuality: 'estimated',
    source: 'Nutrition label (your photo)',
    naturalness: naturalnessFrom(label.naturalnessScore, 'AI estimate from the product and its ingredients'),
  };
  const facts = [`${Math.round(per100g.calories)} kcal`, `${per100g.proteinG}g protein`, `${per100g.carbsG}g carbs`, `${per100g.fatG}g fat`].join(' · ');
  return {
    id: generateId('cand'),
    foodId: id,
    name,
    imageEmoji: food.imageEmoji,
    seenDescription: `Read from the label, per ${per}: ${facts}${label.convertedFromServing ? ' (converted from per-serving values)' : ''}. Check these match the package.`,
    estimatedGrams: grams,
    per100gUsed: per100g,
    nutrition: calculateNutrition(per100g, grams),
    identificationConfidence: 100,
    confidence: 'high',
    matchedLocalFood: false,
    nutritionSource: 'Nutrition label (your photo)',
    customFood: food,
  };
}

export const foodRecognitionService: FoodRecognitionServiceInterface = new RealFoodRecognitionService();

// Re-exported so callers (e.g. the scan review UI) can resolve a swapped-in
// alternative's local food without importing data/foods directly.
export { findFoodById };
