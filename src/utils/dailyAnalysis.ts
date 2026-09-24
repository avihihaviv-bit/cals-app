import { findFoodById } from '@/data/foods';
import type { DiaryEntry, MacroTargets, NutritionFacts } from '@/types';

/**
 * Non-judgmental daily nutrition analysis — the engine behind the AI
 * Nutrition Coach's "How did I eat today?" button. Everything here is
 * computed locally from the user's own logged diary entries against their
 * own targets; nothing is invented, and nothing is framed as a medical
 * verdict, a pass/fail grade, or a reason to feel guilty about food.
 */

export interface FoodSuggestion {
  foodId: string;
  name: string;
  emoji?: string;
  calories: number;
  proteinG: number;
}

export type BalanceLabel = 'good' | 'improve' | 'incomplete';

export interface DailyAnalysis {
  hasEnoughData: boolean;
  overallScore: number; // 0-10
  balance: BalanceLabel;
  balanceText: string;
  caloriesText: string;
  proteinText: string;
  proteinSuggestions: FoodSuggestion[];
  carbsText: string;
  fatText: string;
  varietyText: string;
  /** A direct comparison across macros, e.g. "you're close to fat, still have protein remaining". */
  crossMacroText: string | null;
}

function closenessScore(actual: number, target: number): number {
  if (target <= 0) return 1;
  const ratio = actual / target;
  // A day isn't over until it's over — being at 40-110% of target scores well;
  // far under (still early / light day) or well over both taper the score.
  if (ratio >= 0.4 && ratio <= 1.1) return 1;
  if (ratio < 0.4) return Math.max(0, ratio / 0.4);
  return Math.max(0, 1 - (ratio - 1.1) * 1.3);
}

function pctLabel(actual: number, target: number): 'low' | 'high' | 'on-track' {
  if (target <= 0) return 'on-track';
  const ratio = actual / target;
  if (ratio < 0.55) return 'low';
  if (ratio > 1.3) return 'high';
  return 'on-track';
}

export function analyzeDailyNutrition(
  totals: NutritionFacts,
  targets: MacroTargets,
  entries: DiaryEntry[],
): DailyAnalysis {
  if (entries.length === 0) {
    return {
      hasEnoughData: false,
      overallScore: 0,
      balance: 'incomplete',
      balanceText: "You haven't logged anything yet today — this analysis fills in as you add meals.",
      caloriesText: `Your target for today is around ${targets.calories.toLocaleString()} kcal.`,
      proteinText: `Your protein target for today is ${targets.proteinG}g.`,
      proteinSuggestions: [],
      carbsText: '',
      fatText: '',
      varietyText: '',
      crossMacroText: null,
    };
  }

  const calRatio = targets.calories > 0 ? totals.calories / targets.calories : 0;

  const scores = [
    closenessScore(totals.calories, targets.calories),
    closenessScore(totals.proteinG, targets.proteinG) * 1.15,
    closenessScore(totals.carbsG, targets.carbsG),
    closenessScore(totals.fatG, targets.fatG),
  ];
  const weightSum = 1 + 1.15 + 1 + 1;
  const rawScore = (scores.reduce((a, b) => a + b, 0) / weightSum) * 10;
  const overallScore = Math.round(Math.max(0, Math.min(10, rawScore)) * 10) / 10;

  let balance: BalanceLabel;
  let balanceText: string;
  if (entries.length < 2 || calRatio < 0.25) {
    balance = 'incomplete';
    balanceText = "Still early in the day — this picture will get more complete as you log more meals.";
  } else if (overallScore >= 7) {
    balance = 'good';
    balanceText = 'Your day is well balanced against your targets so far.';
  } else {
    balance = 'improve';
    balanceText = "There's room to get closer to your targets today — nothing to fix urgently, just something to notice.";
  }

  const remainingCal = Math.max(targets.calories - totals.calories, 0);
  const caloriesText =
    calRatio > 1.1
      ? `You've eaten ${Math.round(totals.calories).toLocaleString()} kcal, a bit above your ${targets.calories.toLocaleString()} kcal target today.`
      : `You've eaten ${Math.round(totals.calories).toLocaleString()} of your ${targets.calories.toLocaleString()} kcal target — about ${Math.round(remainingCal).toLocaleString()} kcal left based on your current plan.`;

  const proteinRemaining = Math.max(targets.proteinG - totals.proteinG, 0);
  const proteinLabel = pctLabel(totals.proteinG, targets.proteinG);
  const proteinText =
    proteinLabel === 'low'
      ? `You're still below your protein target today — about ${Math.round(proteinRemaining)}g left to reach ${targets.proteinG}g.`
      : proteinLabel === 'high'
        ? `You're well above your usual protein target today (${Math.round(totals.proteinG)}g of ${targets.proteinG}g) — nothing wrong with that.`
        : `You're on track with protein today (${Math.round(totals.proteinG)}g of ${targets.proteinG}g).`;

  const eatenFoodIds = new Set(entries.map((e) => e.foodId));
  const proteinSuggestions: FoodSuggestion[] = proteinLabel === 'low' ? topProteinSuggestions(eatenFoodIds) : [];

  const carbsLabel = pctLabel(totals.carbsG, targets.carbsG);
  const carbsText =
    carbsLabel === 'low'
      ? `Your carbs are on the lower side today (${Math.round(totals.carbsG)}g of ${targets.carbsG}g) — worth noting if you have training coming up.`
      : carbsLabel === 'high'
        ? `You're a bit above your usual carb target today (${Math.round(totals.carbsG)}g of ${targets.carbsG}g).`
        : `Your carbs are close to target today (${Math.round(totals.carbsG)}g of ${targets.carbsG}g).`;

  const fatLabel = pctLabel(totals.fatG, targets.fatG);
  const fatText =
    fatLabel === 'low'
      ? `Fat intake is on the lower side today (${Math.round(totals.fatG)}g of ${targets.fatG}g).`
      : fatLabel === 'high'
        ? `You're already close to (or past) your fat target today (${Math.round(totals.fatG)}g of ${targets.fatG}g).`
        : `Fat is close to target today (${Math.round(totals.fatG)}g of ${targets.fatG}g).`;

  const categories = new Set(
    entries.map((e) => findFoodById(e.foodId)?.category).filter((c): c is string => !!c),
  );
  const proteinFoodCount = new Set(
    entries.filter((e) => findFoodById(e.foodId)?.category === 'Protein').map((e) => e.foodId),
  ).size;

  let varietyText: string;
  if (categories.size >= 4) {
    varietyText = 'Today you logged a nice variety of food groups.';
  } else if (proteinFoodCount >= 2) {
    varietyText = 'Today you logged several different protein sources.';
  } else if (categories.size >= 2) {
    varietyText = "You've had a mix of a few food groups today.";
  } else {
    varietyText = 'You may want to add more variety today, such as fruits or vegetables, if you have room left.';
  }

  // Cross-macro comparison, e.g. "close to fat, still have protein remaining"
  let crossMacroText: string | null = null;
  if (fatLabel !== 'low' && proteinLabel === 'low') {
    crossMacroText = "You're already close to your fat target, while you still have protein remaining — a lean protein option would fit well.";
  } else if (carbsLabel !== 'low' && proteinLabel === 'low') {
    crossMacroText = "Carbs are in good shape today, while protein still has room — worth prioritizing on your next meal.";
  }

  return {
    hasEnoughData: true,
    overallScore,
    balance,
    balanceText,
    caloriesText,
    proteinText,
    proteinSuggestions,
    carbsText,
    fatText,
    varietyText,
    crossMacroText,
  };
}

function topProteinSuggestions(alreadyEatenIds: Set<string>): FoodSuggestion[] {
  const candidates = ['chicken-breast', 'greek-yogurt', 'eggs', 'salmon', 'cottage-cheese', 'tofu', 'lentils', 'protein-yogurt'];
  const suggestions: FoodSuggestion[] = [];
  for (const id of candidates) {
    const food = findFoodById(id);
    if (!food) continue;
    suggestions.push({
      foodId: food.id,
      name: food.name,
      emoji: food.imageEmoji,
      calories: Math.round(food.per100g.calories * (food.defaultServing.grams / 100)),
      proteinG: Math.round(food.per100g.proteinG * (food.defaultServing.grams / 100)),
    });
    if (suggestions.length >= 4) break;
  }
  // Prefer options not already eaten today, but don't drop below 4 total.
  const fresh = suggestions.filter((s) => !alreadyEatenIds.has(s.foodId));
  return (fresh.length >= 3 ? fresh : suggestions).slice(0, 4);
}
