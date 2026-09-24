import { findFoodById } from '@/data/foods';
import { calculateNutrition, sumNutrition } from '@/utils/nutritionCalculator';
import { scoreNutritionAgainstRemaining } from '@/services/RecommendationService';
import { generateId } from '@/utils/id';
import { addDays, todayISO } from '@/utils/date';
import { templateMatchesRestrictions, likedFoodBonus } from '@/utils/dietaryTags';
import type { MacroTargets, MealPlanDay, MealPlanSlot, MealType, NutritionFacts, UserProfile } from '@/types';

/**
 * AI Meal Plan Builder — generates a multi-day plan from a small template
 * pool, sized against a per-meal share of the day's targets. Deterministic,
 * rule-based, on-device (no LLM), consistent with every other "AI" feature
 * in this app. The plan is explicitly flexible: every slot can be replaced,
 * regenerated, or edited — nothing here is meant to be rigid.
 */

interface PlanTemplate {
  id: string;
  name: string;
  emoji: string;
  items: { foodId: string; grams: number }[];
  suitableMealTypes: MealType[];
  vegetarian: boolean;
  cheap: boolean;
}

const PLAN_TEMPLATES: PlanTemplate[] = [
  { id: 'oats-banana', name: 'Oatmeal + Banana', emoji: '🥣', items: [{ foodId: 'oatmeal', grams: 220 }, { foodId: 'banana', grams: 110 }], suitableMealTypes: ['breakfast'], vegetarian: true, cheap: true },
  { id: 'eggs-toast-avocado', name: 'Eggs, Toast & Avocado', emoji: '🍳', items: [{ foodId: 'eggs', grams: 100 }, { foodId: 'whole-wheat-bread', grams: 64 }, { foodId: 'avocado', grams: 70 }], suitableMealTypes: ['breakfast'], vegetarian: true, cheap: false },
  { id: 'yogurt-fruit-almonds', name: 'Greek Yogurt, Fruit & Almonds', emoji: '🍦', items: [{ foodId: 'greek-yogurt', grams: 200 }, { foodId: 'banana', grams: 100 }, { foodId: 'almonds', grams: 15 }], suitableMealTypes: ['breakfast', 'snacks'], vegetarian: true, cheap: true },
  { id: 'toast-pb', name: 'Toast & Peanut Butter', emoji: '🍞', items: [{ foodId: 'whole-wheat-bread', grams: 64 }, { foodId: 'peanut-butter', grams: 24 }], suitableMealTypes: ['breakfast', 'snacks'], vegetarian: true, cheap: true },

  { id: 'chicken-rice-salad', name: 'Chicken, Rice & Salad', emoji: '🍗', items: [{ foodId: 'chicken-breast', grams: 150 }, { foodId: 'white-rice', grams: 150 }, { foodId: 'mixed-salad', grams: 100 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: false, cheap: true },
  { id: 'salmon-potato-broccoli', name: 'Salmon, Sweet Potato & Broccoli', emoji: '🐟', items: [{ foodId: 'salmon', grams: 150 }, { foodId: 'sweet-potato', grams: 150 }, { foodId: 'broccoli', grams: 100 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: false, cheap: false },
  { id: 'lentil-quinoa', name: 'Lentil & Quinoa Bowl', emoji: '🍲', items: [{ foodId: 'lentils', grams: 180 }, { foodId: 'quinoa', grams: 150 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: true, cheap: true },
  { id: 'tofu-rice-broccoli', name: 'Tofu Stir-fry Bowl', emoji: '🧊', items: [{ foodId: 'tofu', grams: 150 }, { foodId: 'white-rice', grams: 150 }, { foodId: 'broccoli', grams: 100 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: true, cheap: true },
  { id: 'beef-rice', name: 'Beef & Rice Bowl', emoji: '🥩', items: [{ foodId: 'ground-beef', grams: 130 }, { foodId: 'white-rice', grams: 130 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: false, cheap: true },
  { id: 'pasta-salad', name: 'Pasta & Salad', emoji: '🍝', items: [{ foodId: 'pasta', grams: 200 }, { foodId: 'mixed-salad', grams: 100 }, { foodId: 'olive-oil', grams: 10 }], suitableMealTypes: ['lunch', 'dinner'], vegetarian: true, cheap: true },

  { id: 'cottage-fruit', name: 'Cottage Cheese + Fruit', emoji: '🧀', items: [{ foodId: 'cottage-cheese', grams: 200 }, { foodId: 'apple', grams: 150 }], suitableMealTypes: ['snacks'], vegetarian: true, cheap: true },
  { id: 'pita-hummus', name: 'Pita + Hummus', emoji: '🥙', items: [{ foodId: 'pita', grams: 60 }, { foodId: 'hummus', grams: 60 }], suitableMealTypes: ['snacks'], vegetarian: true, cheap: true },
  { id: 'protein-shake', name: 'Protein Shake', emoji: '🥤', items: [{ foodId: 'protein-powder', grams: 30 }, { foodId: 'milk', grams: 200 }], suitableMealTypes: ['snacks'], vegetarian: true, cheap: false },
];

const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snacks: 0.1,
};

function slotsForMealsPerDay(mealsPerDay: 3 | 4 | 5): MealType[] {
  if (mealsPerDay === 3) return ['breakfast', 'lunch', 'dinner'];
  if (mealsPerDay === 4) return ['breakfast', 'lunch', 'dinner', 'snacks'];
  return ['breakfast', 'snacks', 'lunch', 'snacks', 'dinner'];
}

function shareTargetsFor(mealType: MealType, dayTargets: MacroTargets, slotCountOfType: number): MacroTargets {
  const share = MEAL_SHARE[mealType] / Math.max(1, slotCountOfType);
  return {
    calories: Math.round(dayTargets.calories * share),
    proteinG: Math.round(dayTargets.proteinG * share),
    carbsG: Math.round(dayTargets.carbsG * share),
    fatG: Math.round(dayTargets.fatG * share),
  };
}

function computeTotals(items: { foodId: string; grams: number }[]): NutritionFacts | null {
  const parts = items
    .map((i) => {
      const food = findFoodById(i.foodId);
      return food ? calculateNutrition(food.per100g, i.grams) : null;
    })
    .filter((n): n is NutritionFacts => !!n);
  if (parts.length !== items.length) return null;
  return sumNutrition(parts);
}

function eligibleTemplates(mealType: MealType, profile?: UserProfile | null): PlanTemplate[] {
  const dislikedIds = new Set(profile?.dislikedFoodIds ?? []);
  return PLAN_TEMPLATES.filter((t) => {
    if (!t.suitableMealTypes.includes(mealType)) return false;
    if (!templateMatchesRestrictions(t.items, t.vegetarian, profile?.dietaryRestrictions)) return false;
    return !t.items.some((i) => dislikedIds.has(i.foodId));
  });
}

function pickTemplate(
  mealType: MealType,
  remaining: MacroTargets,
  profile: UserProfile | null | undefined,
  excludeIds: Set<string>,
  bias?: 'protein' | 'cheaper' | 'faster' | 'different',
): PlanTemplate | null {
  let pool = eligibleTemplates(mealType, profile).filter((t) => !excludeIds.has(t.id));
  if (pool.length === 0) pool = eligibleTemplates(mealType, profile); // allow repeats rather than fail

  const scored = pool
    .map((t) => {
      const totals = computeTotals(t.items);
      if (!totals) return null;
      let score = scoreNutritionAgainstRemaining(totals, remaining);
      score += likedFoodBonus(t.items, profile?.likedFoodIds);
      if (bias === 'protein') score += (totals.proteinG >= remaining.proteinG ? 10 : 0);
      if (bias === 'cheaper' && t.cheap) score += 15;
      if (bias === 'faster' && t.items.length <= 2) score += 10;
      return { template: t, score };
    })
    .filter((s): s is { template: PlanTemplate; score: number } => !!s)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (bias === 'different') {
    // Surprise-me / different: pick something other than the current top match.
    const candidates = scored.slice(1, 4);
    return (candidates.length ? candidates : scored)[Math.floor(Math.random() * (candidates.length || scored.length))].template;
  }
  const top = scored.slice(0, 3);
  return top[Math.floor(Math.random() * top.length)].template;
}

function slotFromTemplate(mealType: MealType, template: PlanTemplate): MealPlanSlot {
  return { id: generateId('slot'), mealType, name: template.name, emoji: template.emoji, items: template.items };
}

export interface BuildPlanOptions {
  days: 1 | 3 | 7;
  mealsPerDay: 3 | 4 | 5;
  dayTargets: MacroTargets;
  profile?: UserProfile | null;
  startDate?: string;
}

export function buildMealPlan(opts: BuildPlanOptions): MealPlanDay[] {
  const start = opts.startDate ?? todayISO();
  const mealTypes = slotsForMealsPerDay(opts.mealsPerDay);
  const countByType = mealTypes.reduce<Partial<Record<MealType, number>>>((acc, mt) => {
    acc[mt] = (acc[mt] ?? 0) + 1;
    return acc;
  }, {});

  const days: MealPlanDay[] = [];
  for (let d = 0; d < opts.days; d++) {
    const usedThisDay = new Set<string>();
    const slots: MealPlanSlot[] = mealTypes.map((mealType) => {
      const remaining = shareTargetsFor(mealType, opts.dayTargets, countByType[mealType] ?? 1);
      const template = pickTemplate(mealType, remaining, opts.profile, usedThisDay);
      if (!template) {
        // Should not normally happen (templates cover every meal type), but never leave a slot empty.
        return { id: generateId('slot'), mealType, name: 'Flexible meal', emoji: '🍽️', items: [{ foodId: 'greek-yogurt', grams: 200 }] };
      }
      usedThisDay.add(template.id);
      return slotFromTemplate(mealType, template);
    });
    days.push({ dayIndex: d, date: addDays(start, d), slots });
  }
  return days;
}

export function regenerateSlot(
  mealType: MealType,
  dayTargets: MacroTargets,
  slotCountOfType: number,
  profile: UserProfile | null | undefined,
  bias?: 'protein' | 'cheaper' | 'faster' | 'different',
): MealPlanSlot | null {
  const remaining = shareTargetsFor(mealType, dayTargets, slotCountOfType);
  const template = pickTemplate(mealType, remaining, profile, new Set(), bias);
  return template ? slotFromTemplate(mealType, template) : null;
}

export function slotTotals(slot: MealPlanSlot): NutritionFacts {
  return computeTotals(slot.items) ?? { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}

export function dayTotals(day: MealPlanDay): NutritionFacts {
  return sumNutrition(day.slots.map(slotTotals));
}

export interface PlanCheckRow {
  label: string;
  ok: boolean;
}

/** A lightweight sanity pass over a generated (or edited) plan — informational, never blocking. */
export function checkPlan(days: MealPlanDay[], dayTargets: MacroTargets): PlanCheckRow[] {
  if (days.length === 0) return [];

  const totalsPerDay = days.map(dayTotals);
  const avgCalories = totalsPerDay.reduce((a, t) => a + t.calories, 0) / days.length;
  const caloriesOk = dayTargets.calories > 0 && Math.abs(avgCalories - dayTargets.calories) <= dayTargets.calories * 0.15;

  const proteinDistributedOk = days.every((day) => {
    const total = dayTotals(day).proteinG;
    if (total <= 0) return true;
    const maxSlot = Math.max(...day.slots.map((s) => slotTotals(s).proteinG));
    return maxSlot / total <= 0.6;
  });

  const realisticOk = days.every((day) => day.slots.every((s) => s.items.length <= 5));
  const heavyCookIds = new Set(['chicken-breast', 'salmon', 'ground-beef', 'white-rice', 'quinoa', 'sweet-potato', 'lentils']);
  const cookingReasonableOk = days.every((day) => {
    const heavyCount = day.slots.filter((s) => s.items.some((i) => heavyCookIds.has(i.foodId))).length;
    return heavyCount <= Math.max(1, day.slots.length - 1);
  });
  const notComplicatedOk = days.every((day) => {
    const avgItems = day.slots.reduce((a, s) => a + s.items.length, 0) / Math.max(1, day.slots.length);
    return avgItems <= 3.2;
  });

  return [
    { label: 'Calories approximately match target', ok: caloriesOk },
    { label: 'Protein distributed across the day', ok: proteinDistributedOk },
    { label: 'Meals are realistic', ok: realisticOk },
    { label: 'Cooking time is reasonable', ok: cookingReasonableOk },
    { label: 'Ingredients are not unnecessarily complicated', ok: notComplicatedOk },
  ];
}
