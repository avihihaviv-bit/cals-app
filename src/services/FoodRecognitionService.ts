import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { generateId } from '@/utils/id';
import type { ScanResult, ScannedFoodCandidate } from '@/types';

/**
 * Abstraction over "AI photo -> recognized foods". The mock implementation
 * simulates a vision model by returning a plausible, randomized combination
 * of foods from the demo database with a confidence score and an estimated
 * gram weight — exactly the shape a real AI Vision API (e.g. a food-specific
 * vision model) would return, so swapping in a real provider only means
 * replacing this class's recognize() implementation.
 */
export interface FoodRecognitionServiceInterface {
  recognize(imageDataUrl: string): Promise<ScanResult>;
}

const RECOGNITION_DELAY_MS = 1400;

/** Plausible "what's likely in one photo" combos, used to simulate a real vision model. */
const MEAL_PRESETS: { foodIds: string[]; grams: number[]; confidences: ScannedFoodCandidate['confidence'][] }[] = [
  { foodIds: ['chicken-breast', 'white-rice', 'mixed-salad'], grams: [140, 160, 90], confidences: ['high', 'medium', 'medium'] },
  { foodIds: ['salmon', 'sweet-potato', 'broccoli'], grams: [150, 120, 100], confidences: ['high', 'medium', 'high'] },
  { foodIds: ['pasta', 'mixed-salad'], grams: [220, 80], confidences: ['medium', 'low'] },
  { foodIds: ['eggs', 'whole-wheat-bread', 'avocado'], grams: [100, 64, 70], confidences: ['high', 'medium', 'medium'] },
  { foodIds: ['oatmeal', 'banana'], grams: [220, 110], confidences: ['high', 'high'] },
  { foodIds: ['ground-beef', 'white-rice'], grams: [160, 150], confidences: ['medium', 'medium'] },
  { foodIds: ['greek-yogurt', 'banana', 'almonds'], grams: [200, 100, 20], confidences: ['high', 'medium', 'low'] },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MockFoodRecognitionService implements FoodRecognitionServiceInterface {
  async recognize(imageDataUrl: string): Promise<ScanResult> {
    await delay(RECOGNITION_DELAY_MS);

    const preset = MEAL_PRESETS[Math.floor(Math.random() * MEAL_PRESETS.length)];

    const candidates: ScannedFoodCandidate[] = preset.foodIds
      .map((foodId, i) => {
        const food = findFoodById(foodId);
        if (!food) return null;
        const grams = preset.grams[i];
        const candidate: ScannedFoodCandidate = {
          id: generateId('cand'),
          foodId,
          name: food.name,
          estimatedGrams: grams,
          nutrition: calculateNutrition(food.per100g, grams),
          confidence: preset.confidences[i],
        };
        return candidate;
      })
      .filter((c): c is ScannedFoodCandidate => c !== null);

    return {
      id: generateId('scan'),
      imageDataUrl,
      candidates,
      createdAt: new Date().toISOString(),
    };
  }
}

export const foodRecognitionService: FoodRecognitionServiceInterface = new MockFoodRecognitionService();
