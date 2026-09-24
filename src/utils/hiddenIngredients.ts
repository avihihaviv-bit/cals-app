import type { NutritionFacts } from '@/types';

export type HiddenIngredientType = 'oil' | 'butter' | 'sauce' | 'dressing' | 'sugar' | 'cheese' | 'other';

export type HiddenIngredientUnit = 'g' | 'tbsp' | 'tsp';

/**
 * Typical, publicly-known per-100g nutrition for common hidden-ingredient
 * categories (standard nutrition-label reference values — the same kind of
 * figures used throughout data/foods.ts). These are generic category
 * averages, not a measurement of what the user actually used, so the UI
 * must always present the result with "~" / "estimated" framing, never as
 * an exact number.
 */
export const HIDDEN_INGREDIENT_DEFS: Record<Exclude<HiddenIngredientType, 'other'>, { label: string; emoji: string; per100g: NutritionFacts }> = {
  oil: { label: 'Oil', emoji: '🫒', per100g: { calories: 884, proteinG: 0, carbsG: 0, fatG: 100 } },
  butter: { label: 'Butter', emoji: '🧈', per100g: { calories: 717, proteinG: 0.9, carbsG: 0.1, fatG: 81 } },
  sauce: { label: 'Sauce', emoji: '🥫', per100g: { calories: 150, proteinG: 1.5, carbsG: 10, fatG: 11 } },
  dressing: { label: 'Dressing', emoji: '🥗', per100g: { calories: 350, proteinG: 0.5, carbsG: 5, fatG: 35 } },
  sugar: { label: 'Sugar', emoji: '🍬', per100g: { calories: 387, proteinG: 0, carbsG: 100, fatG: 0, sugarG: 100 } },
  cheese: { label: 'Cheese', emoji: '🧀', per100g: { calories: 402, proteinG: 25, carbsG: 1.3, fatG: 33 } },
};

/** Rough, disclosed-as-approximate spoon-to-gram conversions shared across every hidden-ingredient type. */
export const UNIT_TO_GRAMS: Record<HiddenIngredientUnit, number> = { g: 1, tbsp: 15, tsp: 5 };

export function hiddenIngredientNutrition(type: Exclude<HiddenIngredientType, 'other'>, amount: number, unit: HiddenIngredientUnit): NutritionFacts {
  const grams = amount * UNIT_TO_GRAMS[unit];
  const per100g = HIDDEN_INGREDIENT_DEFS[type].per100g;
  const factor = grams / 100;
  return {
    calories: Math.round(per100g.calories * factor),
    proteinG: Math.round(per100g.proteinG * factor * 10) / 10,
    carbsG: Math.round(per100g.carbsG * factor * 10) / 10,
    fatG: Math.round(per100g.fatG * factor * 10) / 10,
    sugarG: per100g.sugarG != null ? Math.round(per100g.sugarG * factor * 10) / 10 : undefined,
  };
}
