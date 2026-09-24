import { findFoodById } from '@/data/foods';
import { calculateNutrition, proteinDensity, sumNutrition } from '@/utils/nutritionCalculator';
import { weightedNaturalness } from '@/utils/naturalness';
import { reasonFor, scoreNutritionAgainstRemaining } from '@/services/RecommendationService';
import { templateMatchesRestrictions, likedFoodBonus } from '@/utils/dietaryTags';
import type { MacroTargets, MealType, NutritionFacts, UserProfile } from '@/types';

/**
 * The "What should I eat next?" engine behind the AI Nutrition Coach —
 * distinct from the simpler Dashboard widget (services/RecommendationService),
 * this one tags each option Quick/Balanced/Treat and always tries to surface
 * one of each so the user gets a real choice, not just a single "best" pick.
 */

export type MealOptionCategory = 'quick' | 'balanced' | 'treat';

export interface MealOption {
  id: string;
  name: string;
  emoji: string;
  items: { foodId: string; grams: number }[];
  totals: NutritionFacts;
  category: MealOptionCategory;
  matchScore: number;
  prepMinutes: number;
  naturalness: number | null;
  whyItFits: string;
}

interface MealOptionTemplate {
  id: string;
  name: string;
  emoji: string;
  items: { foodId: string; grams: number }[];
  category: MealOptionCategory;
  prepMinutes: number;
  vegetarian: boolean;
}

const TEMPLATES: MealOptionTemplate[] = [
  { id: 'yogurt-fruit', name: 'Greek Yogurt + Fruit', emoji: '🍦', items: [{ foodId: 'greek-yogurt', grams: 200 }, { foodId: 'banana', grams: 100 }], category: 'quick', prepMinutes: 2, vegetarian: true },
  { id: 'eggs-quick', name: 'Quick Scrambled Eggs', emoji: '🍳', items: [{ foodId: 'eggs', grams: 120 }], category: 'quick', prepMinutes: 5, vegetarian: true },
  { id: 'protein-almonds', name: 'Protein Yogurt + Almonds', emoji: '🥤', items: [{ foodId: 'protein-yogurt', grams: 200 }, { foodId: 'almonds', grams: 20 }], category: 'quick', prepMinutes: 2, vegetarian: true },
  { id: 'cottage-fruit', name: 'Cottage Cheese + Fruit', emoji: '🧀', items: [{ foodId: 'cottage-cheese', grams: 200 }, { foodId: 'apple', grams: 150 }], category: 'quick', prepMinutes: 2, vegetarian: true },
  { id: 'pita-hummus', name: 'Pita + Hummus', emoji: '🥙', items: [{ foodId: 'pita', grams: 60 }, { foodId: 'hummus', grams: 60 }], category: 'quick', prepMinutes: 3, vegetarian: true },

  { id: 'chicken-rice-salad', name: 'Chicken, Rice & Salad', emoji: '🍗', items: [{ foodId: 'chicken-breast', grams: 150 }, { foodId: 'white-rice', grams: 150 }, { foodId: 'mixed-salad', grams: 100 }], category: 'balanced', prepMinutes: 20, vegetarian: false },
  { id: 'salmon-potato-broccoli', name: 'Salmon, Sweet Potato & Broccoli', emoji: '🐟', items: [{ foodId: 'salmon', grams: 150 }, { foodId: 'sweet-potato', grams: 150 }, { foodId: 'broccoli', grams: 100 }], category: 'balanced', prepMinutes: 25, vegetarian: false },
  { id: 'lentil-quinoa', name: 'Lentil & Quinoa Bowl', emoji: '🍲', items: [{ foodId: 'lentils', grams: 180 }, { foodId: 'quinoa', grams: 150 }], category: 'balanced', prepMinutes: 20, vegetarian: true },
  { id: 'tofu-rice-broccoli', name: 'Tofu Stir-fry Bowl', emoji: '🧊', items: [{ foodId: 'tofu', grams: 150 }, { foodId: 'white-rice', grams: 150 }, { foodId: 'broccoli', grams: 100 }], category: 'balanced', prepMinutes: 20, vegetarian: true },
  { id: 'beef-rice', name: 'Beef & Rice Bowl', emoji: '🥩', items: [{ foodId: 'ground-beef', grams: 130 }, { foodId: 'white-rice', grams: 130 }], category: 'balanced', prepMinutes: 20, vegetarian: false },
  { id: 'eggs-toast-avocado', name: 'Eggs, Toast & Avocado', emoji: '🥑', items: [{ foodId: 'eggs', grams: 100 }, { foodId: 'whole-wheat-bread', grams: 64 }, { foodId: 'avocado', grams: 70 }], category: 'balanced', prepMinutes: 12, vegetarian: true },

  { id: 'oats-banana-pb', name: 'Oatmeal, Banana & Peanut Butter', emoji: '🥣', items: [{ foodId: 'oatmeal', grams: 220 }, { foodId: 'banana', grams: 110 }, { foodId: 'peanut-butter', grams: 16 }], category: 'treat', prepMinutes: 8, vegetarian: true },
  { id: 'toast-pb-banana', name: 'Toast, Peanut Butter & Banana', emoji: '🍞', items: [{ foodId: 'whole-wheat-bread', grams: 64 }, { foodId: 'peanut-butter', grams: 32 }, { foodId: 'banana', grams: 100 }], category: 'treat', prepMinutes: 4, vegetarian: true },
  { id: 'chocolate-almonds', name: 'Dark Chocolate & Almonds', emoji: '🍫', items: [{ foodId: 'chocolate', grams: 28 }, { foodId: 'almonds', grams: 20 }], category: 'treat', prepMinutes: 1, vegetarian: true },
];

function computeTotals(items: { foodId: string; grams: number }[]): NutritionFacts | null {
  const parts = items
    .map((i) => {
      const food = findFoodById(i.foodId);
      return food ? calculateNutrition(food.per100g, i.grams) : null;
    })
    .filter((n): n is NutritionFacts => !!n);
  if (parts.length !== items.length) return null; // some foodId didn't resolve — skip the template rather than show wrong nutrition
  return sumNutrition(parts);
}

function scoreTemplate(template: MealOptionTemplate, remaining: MacroTargets): MealOption | null {
  const totals = computeTotals(template.items);
  if (!totals) return null;
  const matchScore = scoreNutritionAgainstRemaining(totals, remaining);
  const naturalness = weightedNaturalness(
    template.items.map((i) => ({ naturalness: findFoodById(i.foodId)?.naturalness, grams: i.grams })),
  );
  const baseReason = reasonFor(totals, remaining, matchScore);
  const whyItFits =
    template.category === 'quick'
      ? `${baseReason} Ready in about ${template.prepMinutes} minutes.`
      : template.category === 'treat'
        ? `${baseReason} A flexible option that still fits what you have left today.`
        : baseReason;

  return {
    id: template.id,
    name: template.name,
    emoji: template.emoji,
    items: template.items,
    totals,
    category: template.category,
    matchScore,
    prepMinutes: template.prepMinutes,
    naturalness,
    whyItFits,
  };
}

export interface MealSuggestionResult {
  best: MealOption | null;
  options: MealOption[]; // one per category, when available: quick, balanced, treat
}

function eligibleScoredTemplates(remaining: MacroTargets, profile?: UserProfile | null): MealOption[] {
  const dislikedIds = new Set(profile?.dislikedFoodIds ?? []);

  const eligible = TEMPLATES.filter((t) => {
    if (!templateMatchesRestrictions(t.items, t.vegetarian, profile?.dietaryRestrictions)) return false;
    return !t.items.some((i) => dislikedIds.has(i.foodId));
  });

  return eligible
    .map((t) => scoreTemplate(t, remaining))
    .filter((o): o is MealOption => !!o)
    .map((o) => ({ ...o, matchScore: o.matchScore + likedFoodBonus(o.items, profile?.likedFoodIds) }));
}

export function suggestMealOptions(
  remaining: MacroTargets,
  _mealType: MealType,
  profile?: UserProfile | null,
): MealSuggestionResult {
  const scored = eligibleScoredTemplates(remaining, profile);
  if (scored.length === 0) return { best: null, options: [] };

  const best = [...scored].sort((a, b) => b.matchScore - a.matchScore)[0];

  const options: MealOption[] = [];
  for (const category of ['quick', 'balanced', 'treat'] as MealOptionCategory[]) {
    const topOfCategory = scored.filter((o) => o.category === category).sort((a, b) => b.matchScore - a.matchScore)[0];
    if (topOfCategory) options.push(topOfCategory);
  }

  return { best, options };
}

export type MealBias = 'protein' | 'calories';

/**
 * "Find high protein" / "Low-calorie meal" quick actions — re-ranks the
 * same template pool by protein density (protein per calorie) or by
 * lowest-calorie fit against what's remaining, instead of the
 * Quick/Balanced/Treat categorization.
 */
export function suggestMealOptionsByBias(
  remaining: MacroTargets,
  profile: UserProfile | null | undefined,
  bias: MealBias,
  limit = 3,
): MealOption[] {
  const scored = eligibleScoredTemplates(remaining, profile);
  if (bias === 'protein') {
    return [...scored].sort((a, b) => proteinDensity(b.totals) - proteinDensity(a.totals)).slice(0, limit);
  }
  return [...scored]
    .filter((o) => o.totals.calories <= Math.max(remaining.calories, 150) * 1.15)
    .sort((a, b) => a.totals.calories - b.totals.calories)
    .slice(0, limit);
}
