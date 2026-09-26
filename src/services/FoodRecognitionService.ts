import { FOODS, findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { generateId } from '@/utils/id';
import type { FoodItem, NutritionFacts, ScanResult, ScannedFoodCandidate } from '@/types';

export interface FoodRecognitionServiceInterface {
  recognize(imageDataUrl: string): Promise<ScanResult>;
}

/** Below this identification confidence, the UI must show alternatives instead of asserting the name as fact. */
export const IDENTIFICATION_CONFIDENCE_THRESHOLD = 70;

// The backend Worker URL (see backend/food-recognition-worker/) — unset until
// the user deploys it and configures this build-time env var. Never an API
// key: this only ever points at our own small proxy, which is what actually
// holds the secret.
const API_URL = import.meta.env.VITE_FOOD_RECOGNITION_API_URL as string | undefined;

interface RawAnalysisItem {
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
  per100gEstimate: { calories: number; proteinG: number; carbsG: number; fatG: number };
  boundingBox?: { xPct: number; yPct: number; wPct: number; hPct: number };
}

interface RawAnalysisResponse {
  isFood?: boolean;
  unusable?: boolean;
  unusableReason?: string;
  items?: RawAnalysisItem[];
  error?: string;
}

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
        calories: item.per100gEstimate?.calories ?? 0,
        proteinG: item.per100gEstimate?.proteinG ?? 0,
        carbsG: item.per100gEstimate?.carbsG ?? 0,
        fatG: item.per100gEstimate?.fatG ?? 0,
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
    boundingBox: item.boundingBox,
  };
}

function unavailable(imageDataUrl: string, reason: string): ScanResult {
  return {
    id: generateId('scan'),
    imageDataUrl,
    candidates: [],
    createdAt: new Date().toISOString(),
    recognitionAvailable: false,
    unavailableReason: reason,
  };
}

/**
 * Calls the real vision-analysis backend (see backend/food-recognition-worker/).
 * Deliberately has NO fabricated fallback: if the backend isn't configured or
 * the call fails, this returns recognitionAvailable: false rather than ever
 * inventing candidates — the UI routes the user to manual search instead.
 */
class RealFoodRecognitionService implements FoodRecognitionServiceInterface {
  async recognize(imageDataUrl: string): Promise<ScanResult> {
    if (!API_URL) {
      return unavailable(imageDataUrl, 'Photo recognition isn’t set up yet — search for your food instead.');
    }

    let data: RawAnalysisResponse;
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
      });
      if (!res.ok) {
        return unavailable(imageDataUrl, 'The recognition service is temporarily unavailable.');
      }
      data = await res.json();
    } catch {
      return unavailable(imageDataUrl, 'Couldn’t reach the recognition service — check your connection and try again.');
    }

    if (data.error) {
      return unavailable(imageDataUrl, 'The recognition service is temporarily unavailable.');
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
}

export const foodRecognitionService: FoodRecognitionServiceInterface = new RealFoodRecognitionService();

// Re-exported so callers (e.g. the scan review UI) can resolve a swapped-in
// alternative's local food without importing data/foods directly.
export { findFoodById };
