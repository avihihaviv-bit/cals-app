import { findFoodById } from '@/data/foods';
import { calculateNutrition, sumNutrition } from '@/utils/nutritionCalculator';
import { weightedNaturalness } from '@/utils/naturalness';
import type { MacroTargets, NutritionFacts } from '@/types';

/**
 * Abstraction over "what should I eat" meal recommendations. The mock
 * implementation scores a small curated set of meal combinations from the
 * local food database against the user's remaining macros for the day. A
 * real implementation could call a recommendation/LLM service behind this
 * same interface — callers only depend on RecommendedMeal[].
 */
export interface RecommendedMealItem {
  foodId: string;
  grams: number;
}

export interface RecommendedMeal {
  id: string;
  name: string;
  emoji: string;
  items: RecommendedMealItem[];
  totals: NutritionFacts;
  matchScore: number; // 0-100
  reason: string;
  naturalness: number | null; // weighted 1-100, null if unavailable
}

interface MealTemplate {
  id: string;
  name: string;
  emoji: string;
  items: RecommendedMealItem[];
}

const MEAL_TEMPLATES: MealTemplate[] = [
  { id: 'chicken-rice', name: 'Chicken + Rice', emoji: '🍗', items: [{ foodId: 'chicken-breast', grams: 150 }, { foodId: 'white-rice', grams: 150 }] },
  { id: 'salmon-potato', name: 'Salmon & Sweet Potato Bowl', emoji: '🐟', items: [{ foodId: 'salmon', grams: 150 }, { foodId: 'sweet-potato', grams: 150 }] },
  { id: 'yogurt-fruit', name: 'Greek Yogurt + Fruit', emoji: '🍦', items: [{ foodId: 'greek-yogurt', grams: 200 }, { foodId: 'banana', grams: 100 }] },
  { id: 'eggs-toast', name: 'Eggs, Toast & Avocado', emoji: '🍳', items: [{ foodId: 'eggs', grams: 100 }, { foodId: 'whole-wheat-bread', grams: 64 }, { foodId: 'avocado', grams: 70 }] },
  { id: 'protein-almonds', name: 'Protein Yogurt + Almonds', emoji: '🥤', items: [{ foodId: 'protein-yogurt', grams: 200 }, { foodId: 'almonds', grams: 20 }] },
  { id: 'lentil-quinoa', name: 'Lentil & Quinoa Bowl', emoji: '🍲', items: [{ foodId: 'lentils', grams: 180 }, { foodId: 'quinoa', grams: 150 }] },
  { id: 'cottage-fruit', name: 'Cottage Cheese + Fruit', emoji: '🧀', items: [{ foodId: 'cottage-cheese', grams: 200 }, { foodId: 'apple', grams: 150 }] },
  { id: 'tofu-rice', name: 'Tofu Stir-fry Bowl', emoji: '🧊', items: [{ foodId: 'tofu', grams: 150 }, { foodId: 'white-rice', grams: 150 }, { foodId: 'broccoli', grams: 100 }] },
  { id: 'beef-rice', name: 'Beef & Rice Bowl', emoji: '🥩', items: [{ foodId: 'ground-beef', grams: 130 }, { foodId: 'white-rice', grams: 130 }] },
  { id: 'oats-banana', name: 'Oatmeal + Banana', emoji: '🥣', items: [{ foodId: 'oatmeal', grams: 220 }, { foodId: 'banana', grams: 110 }] },
];

function computeTotals(items: RecommendedMealItem[]): NutritionFacts {
  const parts = items
    .map((i) => {
      const food = findFoodById(i.foodId);
      return food ? calculateNutrition(food.per100g, i.grams) : null;
    })
    .filter((n): n is NutritionFacts => !!n);
  return sumNutrition(parts);
}

export function scoreNutritionAgainstRemaining(totals: NutritionFacts, remaining: MacroTargets): number {
  return scoreAgainst(totals, remaining);
}

function scoreAgainst(totals: NutritionFacts, remaining: MacroTargets): number {
  const calRef = Math.max(remaining.calories, 150);
  const proteinRef = Math.max(remaining.proteinG, 10);

  const calDiffPct = Math.abs(totals.calories - remaining.calories) / calRef;
  const proteinDiffPct = Math.abs(totals.proteinG - remaining.proteinG) / proteinRef;

  const overCaloriesPenalty = totals.calories > remaining.calories * 1.15 ? 15 : 0;

  const raw = 100 - (calDiffPct * 55 + proteinDiffPct * 45) - overCaloriesPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function reasonFor(totals: NutritionFacts, remaining: MacroTargets, score: number): string {
  const fitsCalories = totals.calories <= remaining.calories * 1.1;
  const highProtein = remaining.proteinG > 0 && totals.proteinG >= remaining.proteinG * 0.6;

  if (score >= 80 && highProtein && fitsCalories) return 'High protein and fits your remaining calories.';
  if (fitsCalories) return 'Fits comfortably within what you have left today.';
  if (highProtein) return 'Strong protein source, though a bit higher in calories than what remains.';
  return 'A reasonable option based on your remaining macros.';
}

export interface RecommendationServiceInterface {
  recommendMeals(remaining: MacroTargets, limit?: number): RecommendedMeal[];
}

class LocalRecommendationService implements RecommendationServiceInterface {
  recommendMeals(remaining: MacroTargets, limit = 3): RecommendedMeal[] {
    const scored = MEAL_TEMPLATES.map((template) => {
      const totals = computeTotals(template.items);
      const matchScore = scoreAgainst(totals, remaining);
      const naturalness = weightedNaturalness(
        template.items.map((i) => ({ naturalness: findFoodById(i.foodId)?.naturalness, grams: i.grams })),
      );
      return {
        id: template.id,
        name: template.name,
        emoji: template.emoji,
        items: template.items,
        totals,
        matchScore,
        reason: reasonFor(totals, remaining, matchScore),
        naturalness,
      };
    });

    return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
  }
}

export const recommendationService: RecommendationServiceInterface = new LocalRecommendationService();
