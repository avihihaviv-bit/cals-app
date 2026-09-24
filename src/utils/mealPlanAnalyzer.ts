import { findFoodById } from '@/data/foods';
import { calculateNutrition, sumNutrition } from '@/utils/nutritionCalculator';
import { parseFoodPhrase, type ParsedFoodMention } from '@/utils/nlFoodParser';
import type { MacroTargets, MealType, NutritionFacts } from '@/types';

/**
 * Parses a free-text meal plan the user pastes in (e.g. "Breakfast: two eggs
 * and toast\nLunch: chicken and rice") and produces totals plus a supportive,
 * non-judgmental AI opinion — never "you failed" language, never "forbidden
 * foods". Reuses the same local food-matching heuristics as the chat
 * assistant's natural-language logging, since it's the same underlying
 * problem (turning loose text into recognized foods).
 */

const MEAL_HEADER = /^(breakfast|lunch|dinner|snacks?)\s*:?\s*(.*)$/i;

function normalizeMealType(word: string): MealType {
  const w = word.toLowerCase();
  if (w.startsWith('break')) return 'breakfast';
  if (w.startsWith('lunch')) return 'lunch';
  if (w.startsWith('dinner')) return 'dinner';
  return 'snacks';
}

export interface ParsedPlanMeal {
  mealType: MealType;
  mentions: ParsedFoodMention[];
  totals: NutritionFacts;
}

function totalsFor(mentions: ParsedFoodMention[]): NutritionFacts {
  const parts = mentions.map((m) => calculateNutrition(m.food.per100g, m.grams));
  return sumNutrition(parts);
}

function parseIntoMeals(text: string): ParsedPlanMeal[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const buckets = new Map<MealType, ParsedFoodMention[]>();
  let currentMeal: MealType = 'snacks';
  let sawHeader = false;

  for (const line of lines) {
    const headerMatch = line.match(MEAL_HEADER);
    if (headerMatch) {
      currentMeal = normalizeMealType(headerMatch[1]);
      sawHeader = true;
      const rest = headerMatch[2]?.trim();
      if (rest) {
        const mentions = parseFoodPhrase(rest);
        if (mentions.length) buckets.set(currentMeal, [...(buckets.get(currentMeal) ?? []), ...mentions]);
      }
      continue;
    }
    const mentions = parseFoodPhrase(line);
    if (mentions.length === 0) continue;
    buckets.set(currentMeal, [...(buckets.get(currentMeal) ?? []), ...mentions]);
  }

  if (!sawHeader && buckets.size === 0) return [];

  const order: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
  return order
    .filter((mt) => buckets.has(mt))
    .map((mealType) => {
      const mentions = buckets.get(mealType)!;
      return { mealType, mentions, totals: totalsFor(mentions) };
    });
}

export interface MealPlanOpinion {
  goodPoints: string[];
  improvePoints: string[];
}

function deriveOpinion(meals: ParsedPlanMeal[], totals: NutritionFacts, targets: MacroTargets): MealPlanOpinion {
  const goodPoints: string[] = [];
  const improvePoints: string[] = [];

  const calDiffPct = targets.calories > 0 ? (totals.calories - targets.calories) / targets.calories : 0;
  if (Math.abs(calDiffPct) <= 0.1) goodPoints.push('Fits your calorie target well.');
  else if (calDiffPct < -0.15) improvePoints.push('This plan is noticeably under your calorie target — you may want to add a bit more.');
  else if (calDiffPct > 0.15) improvePoints.push('This plan is above your calorie target — consider trimming a portion or two.');

  if (targets.proteinG > 0 && totals.proteinG >= targets.proteinG * 0.9) {
    goodPoints.push('Good protein coverage across the day.');
  } else if (targets.proteinG > 0 && totals.proteinG < targets.proteinG * 0.7) {
    improvePoints.push('Protein is a bit light for the day overall — an extra serving somewhere would help.');
  }

  const categories = new Set(
    meals.flatMap((m) => m.mentions.map((mm) => ('category' in mm.food ? mm.food.category : undefined)).filter((c): c is string => !!c)),
  );
  if (categories.size >= 4) goodPoints.push('Good variety across your meals.');
  else if (categories.size < 2 && meals.length > 0) improvePoints.push('Consider adding more variety, such as fruits or vegetables.');

  if (totals.proteinG > 0 && meals.length >= 2) {
    const maxMealProtein = Math.max(...meals.map((m) => m.totals.proteinG));
    if (maxMealProtein / totals.proteinG > 0.6) {
      improvePoints.push('Protein is concentrated mostly in one meal — spreading it across the day can be easier on appetite and recovery.');
    }
  }

  for (const meal of meals) {
    if (meal.mentions.length > 6) {
      improvePoints.push(`${capitalize(meal.mealType)} has quite a few items — that could be harder to prepare in practice.`);
    }
  }

  if (goodPoints.length === 0) goodPoints.push('You have a starting plan logged — that alone makes it easier to review and adjust.');

  return { goodPoints, improvePoints };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SuggestedSwap {
  mealType: MealType;
  from: { label: string; totals: NutritionFacts; mentionIndex: number };
  to: { foodId: string; name: string; grams: number; totals: NutritionFacts };
}

function findSuggestedSwap(meals: ParsedPlanMeal[]): SuggestedSwap | null {
  // Look for the lowest-protein mention across the plan and see whether a
  // similar-calorie, meaningfully higher-protein food would improve things.
  const candidates = ['cottage-cheese', 'greek-yogurt', 'chicken-breast', 'eggs'];
  let best: SuggestedSwap | null = null;

  for (const meal of meals) {
    meal.mentions.forEach((mention, idx) => {
      const fromTotals = calculateNutrition(mention.food.per100g, mention.grams);
      if (fromTotals.calories < 40) return; // skip trivial items (a spice, a slice of lemon, etc.)

      for (const candidateId of candidates) {
        const food = findFoodById(candidateId);
        if (!food || food.id === mention.food.id) continue;
        const grams = fromTotals.calories > 0 ? Math.round((fromTotals.calories / food.per100g.calories) * 100) : food.defaultServing.grams;
        const toTotals = calculateNutrition(food.per100g, Math.max(20, grams));
        const proteinGain = toTotals.proteinG - fromTotals.proteinG;
        const calDelta = Math.abs(toTotals.calories - fromTotals.calories);
        if (proteinGain >= 10 && calDelta <= fromTotals.calories * 0.35 + 30) {
          const swap: SuggestedSwap = {
            mealType: meal.mealType,
            from: { label: mention.raw.trim() || mention.food.name, totals: fromTotals, mentionIndex: idx },
            to: { foodId: food.id, name: food.name, grams: Math.max(20, grams), totals: toTotals },
          };
          if (!best || proteinGain > best.to.totals.proteinG - best.from.totals.proteinG) best = swap;
        }
      }
    });
  }

  return best;
}

export interface MealPlanAnalysis {
  meals: ParsedPlanMeal[];
  totals: NutritionFacts;
  targets: MacroTargets;
  opinion: MealPlanOpinion;
  suggestedSwap: SuggestedSwap | null;
}

export function analyzeMealPlanText(text: string, targets: MacroTargets): MealPlanAnalysis | null {
  const meals = parseIntoMeals(text);
  if (meals.length === 0) return null;
  const totals = totalsFor(meals.flatMap((m) => m.mentions));
  return {
    meals,
    totals,
    targets,
    opinion: deriveOpinion(meals, totals, targets),
    suggestedSwap: findSuggestedSwap(meals),
  };
}

/** Applies a suggested swap and recomputes totals + opinion from the resulting meal list. */
export function applySwap(analysis: MealPlanAnalysis, swap: SuggestedSwap): MealPlanAnalysis {
  const food = findFoodById(swap.to.foodId);
  if (!food) return analysis;

  const nextMeals = analysis.meals.map((meal) => {
    if (meal.mealType !== swap.mealType) return meal;
    const nextMentions = [...meal.mentions];
    const original = nextMentions[swap.from.mentionIndex];
    if (!original) return meal;
    nextMentions[swap.from.mentionIndex] = {
      raw: `${swap.to.grams}g ${food.name}`,
      food,
      quantity: 1,
      grams: swap.to.grams,
    };
    return { ...meal, mentions: nextMentions, totals: totalsFor(nextMentions) };
  });

  const totals = totalsFor(nextMeals.flatMap((m) => m.mentions));
  return {
    meals: nextMeals,
    totals,
    targets: analysis.targets,
    opinion: deriveOpinion(nextMeals, totals, analysis.targets),
    suggestedSwap: null,
  };
}
