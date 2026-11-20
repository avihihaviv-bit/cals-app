import { FOODS, findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { generateId } from '@/utils/id';
import { getGeminiKey } from '@/utils/geminiKey';
import { downscaleImage } from '@/utils/resizeImage';
import { analyzeFoodPhoto, analyzeFoodText, GeminiError, type RawAnalysisItem, type RawAnalysisResponse } from '@/services/geminiVision';
import type { FoodItem, NutritionFacts, ScanResult, ScannedFoodCandidate } from '@/types';

export interface FoodRecognitionServiceInterface {
  recognize(imageDataUrl: string): Promise<ScanResult>;
  recognizeText(description: string): Promise<ScanResult>;
}

/** Below this identification confidence, the UI must show alternatives instead of asserting the name as fact. */
export const IDENTIFICATION_CONFIDENCE_THRESHOLD = 70;

// Fallback path when the user hasn't added their own Gemini key: the
// Cloudflare Worker in backend/food-recognition-worker/, which holds a key
// server-side. VITE_FOOD_RECOGNITION_API_URL overrides it.
const WORKER_URL = (import.meta.env.VITE_FOOD_RECOGNITION_API_URL as string | undefined) || 'https://callapp.avihihaviv.workers.dev';

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Best-effort match against our own verified/estimated database — we always prefer real data over the vision model's own guess. */
function matchLocalFood(name: string): FoodItem | undefined {
  const q = normalize(name);
  if (!q) return undefined;
  const exact = FOODS.find((f) => normalize(f.name) === q || (f.nameHe && f.nameHe === name.trim()));
  if (exact) return exact;
  return FOODS.find((f) => {
    const fn = normalize(f.name);
    return fn.includes(q) || q.includes(fn) || (!!f.nameHe && (q.includes(f.nameHe) || name.includes(f.nameHe)));
  });
}

function slug(text: string): string {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function confidenceBand(pct: number): ScannedFoodCandidate['confidence'] {
  if (pct >= 85) return 'high';
  if (pct >= IDENTIFICATION_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
}

function buildCandidate(item: RawAnalysisItem, index: number): ScannedFoodCandidate {
  const localFood = matchLocalFood(item.bestGuessName);
  const per100g: NutritionFacts = localFood
    ? localFood.per100g
    : {
        calories: item.per100gCalories ?? 0,
        proteinG: item.per100gProteinG ?? 0,
        carbsG: item.per100gCarbsG ?? 0,
        fatG: item.per100gFatG ?? 0,
      };

  const min = item.estimatedGramsMin ?? item.estimatedGramsMax ?? 100;
  const max = item.estimatedGramsMax ?? item.estimatedGramsMin ?? 100;
  const grams = Math.round((min + max) / 2);

  const confidence = Math.max(0, Math.min(100, Math.round(item.identificationConfidence ?? 0)));
  const identificationCertain = confidence >= IDENTIFICATION_CONFIDENCE_THRESHOLD;

  return {
    id: generateId('cand'),
    foodId: localFood?.id ?? `ai-${slug(item.bestGuessName)}-${index}`,
    name: localFood?.name ?? item.bestGuessName,
    imageEmoji: localFood?.imageEmoji,
    seenDescription: item.seenDescription,
    visibleExtras: item.visibleExtras && item.visibleExtras.length > 0 ? item.visibleExtras : undefined,
    unitCount: item.isCountable ? item.unitCount : undefined,
    unitLabel: item.isCountable ? item.unitLabel : undefined,
    estimatedGrams: grams,
    estimatedGramsRange: min !== max ? [Math.round(min), Math.round(max)] : undefined,
    per100gUsed: per100g,
    nutrition: calculateNutrition(per100g, grams),
    identificationConfidence: confidence,
    confidence: confidenceBand(confidence),
    alternatives:
      !identificationCertain && item.alternatives && item.alternatives.length > 0
        ? item.alternatives.map((label) => ({ label, foodId: matchLocalFood(label)?.id }))
        : undefined,
    matchedLocalFood: !!localFood,
    nutritionSource: localFood?.source ?? 'AI Vision Estimate',
    boundingBox:
      item.boxXPct !== undefined && item.boxYPct !== undefined && item.boxWPct !== undefined && item.boxHPct !== undefined
        ? { xPct: item.boxXPct, yPct: item.boxYPct, wPct: item.boxWPct, hPct: item.boxHPct }
        : undefined,
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
  async recognize(originalDataUrl: string): Promise<ScanResult> {
    const imageDataUrl = await downscaleImage(originalDataUrl);
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return unavailable(imageDataUrl, 'Couldn’t read that photo — try taking it again.');
    }
    const [, mediaType, base64Data] = match;

    let data: RawAnalysisResponse;
    const apiKey = getGeminiKey();
    if (apiKey) {
      try {
        data = await analyzeFoodPhoto(apiKey, mediaType, base64Data);
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

    const candidates = data.items.map((item, i) => buildCandidate(item, i));
    return {
      id: generateId('scan'),
      imageDataUrl,
      candidates,
      createdAt: new Date().toISOString(),
      recognitionAvailable: true,
    };
  }

  /** Looks up typed foods ("150g chicken breast, 200g rice") with the user's own gram amounts. Needs the user's Gemini key. */
  async recognizeText(description: string): Promise<ScanResult> {
    const text = description.trim();
    const apiKey = getGeminiKey();
    const base = { inputKind: 'text' as const };
    if (!text) return { ...unavailable('', 'Type what you ate first.'), ...base };
    if (!apiKey) {
      return {
        ...unavailable('', 'Typing foods needs your free Gemini key — add it in Settings (takes a minute).', { needsApiKey: true }),
        ...base,
      };
    }

    let data: RawAnalysisResponse;
    try {
      data = await analyzeFoodText(apiKey, text);
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
      candidates: data.items.map((item, i) => buildCandidate(item, i)),
      createdAt: new Date().toISOString(),
      recognitionAvailable: true,
      inputKind: 'text',
    };
  }
}

export const foodRecognitionService: FoodRecognitionServiceInterface = new RealFoodRecognitionService();

// Re-exported so callers (e.g. the scan review UI) can resolve a swapped-in
// alternative's local food without importing data/foods directly.
export { findFoodById };
