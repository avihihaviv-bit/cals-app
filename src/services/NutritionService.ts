import { calculateFullTargets, calculateNutrition } from '@/utils/nutritionCalculator';
import type { CalorieTargetResult } from '@/utils/nutritionCalculator';
import type { MacroTargets, NutritionFacts, UserProfile } from '@/types';

/**
 * Central nutrition math service — the single place that turns a profile
 * into daily targets, and a per-100g food baseline into an actual logged
 * quantity's nutrition. Kept as a thin wrapper around utils/nutritionCalculator
 * so the calculation logic stays pure/testable while call sites depend on a
 * stable service interface.
 */
export interface NutritionServiceInterface {
  computeTargets(profile: UserProfile): { calorieResult: CalorieTargetResult; macros: MacroTargets };
  nutritionForQuantity(per100g: NutritionFacts, grams: number): NutritionFacts;
}

class NutritionServiceImpl implements NutritionServiceInterface {
  computeTargets(profile: UserProfile) {
    return calculateFullTargets(profile);
  }

  nutritionForQuantity(per100g: NutritionFacts, grams: number): NutritionFacts {
    return calculateNutrition(per100g, grams);
  }
}

export const nutritionService: NutritionServiceInterface = new NutritionServiceImpl();
