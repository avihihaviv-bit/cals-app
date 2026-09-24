import { proteinDensity } from '@/utils/nutritionCalculator';
import type { Goal, MacroTargets, NutritionFacts } from '@/types';

/**
 * A documented, weighted restaurant/dish match score — replaces any ad-hoc
 * "make up a percentage" scoring. Every component is computed from real
 * numbers (the dish's actual nutrition vs. the user's actual remaining
 * targets); nothing here is a random or invented score.
 *
 * Components (weights sum to 100, and shift with the user's stated priority
 * or goal so the score actually reflects what they said matters to them):
 *   - Protein Fit    — how well the dish's protein density fits what's needed
 *   - Calorie Fit     — how well the dish's calories fit what's remaining
 *   - Macro Balance   — how close carbs/fat land to a sensible remaining split
 *   - Distance        — closer city-level distance scores higher (when known)
 *   - User Preference — cuisine match / explicit priority match
 */

export type MatchPriority = 'protein' | 'calories' | 'balance' | 'cheap' | 'tasty' | 'closest';

export interface MatchWeights {
  proteinFit: number;
  calorieFit: number;
  macroBalance: number;
  distance: number;
  preference: number;
}

const DEFAULT_WEIGHTS: MatchWeights = { proteinFit: 35, calorieFit: 30, macroBalance: 15, distance: 10, preference: 10 };

/** Weights adapt to what the user says they care about, or their goal when no explicit priority is given. */
export function weightsFor(priority: MatchPriority | null, goal?: Goal): MatchWeights {
  if (priority === 'protein') return { proteinFit: 50, calorieFit: 20, macroBalance: 10, distance: 10, preference: 10 };
  if (priority === 'calories') return { proteinFit: 20, calorieFit: 50, macroBalance: 10, distance: 10, preference: 10 };
  if (priority === 'balance') return { proteinFit: 25, calorieFit: 25, macroBalance: 30, distance: 10, preference: 10 };
  if (priority === 'closest') return { proteinFit: 20, calorieFit: 20, macroBalance: 10, distance: 40, preference: 10 };
  if (priority === 'cheap' || priority === 'tasty') return { proteinFit: 25, calorieFit: 25, macroBalance: 10, distance: 10, preference: 30 };
  if (goal === 'gain' || goal === 'recomposition' || goal === 'performance') {
    return { proteinFit: 45, calorieFit: 25, macroBalance: 15, distance: 10, preference: 5 };
  }
  if (goal === 'lose') return { proteinFit: 35, calorieFit: 40, macroBalance: 10, distance: 10, preference: 5 };
  return DEFAULT_WEIGHTS;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** 0-1: how well the dish's protein-per-calorie ratio fits the user's remaining protein need relative to what's left in their calorie budget. */
function proteinFitScore(dish: NutritionFacts, remaining: MacroTargets): number {
  if (remaining.calories <= 0) return dish.proteinG > 0 ? 0.5 : 0;
  const idealDensity = remaining.proteinG > 0 ? (remaining.proteinG / remaining.calories) * 100 : 0;
  const dishDensity = proteinDensity(dish);
  if (idealDensity <= 0) return clamp01(dishDensity / 15); // no specific protein need — just reward any density, capped
  const ratio = dishDensity / idealDensity;
  // 1.0 at or above the ideal ratio, tapering down the further under it falls.
  return clamp01(ratio >= 1 ? 1 : ratio);
}

function calorieFitScore(dish: NutritionFacts, remaining: MacroTargets): number {
  const ref = Math.max(remaining.calories, 150);
  const diffPct = Math.abs(dish.calories - remaining.calories) / ref;
  const overPenalty = dish.calories > remaining.calories * 1.15 ? 0.25 : 0;
  return clamp01(1 - diffPct - overPenalty);
}

function macroBalanceScore(dish: NutritionFacts, remaining: MacroTargets): number {
  const carbRef = Math.max(remaining.carbsG, 20);
  const fatRef = Math.max(remaining.fatG, 10);
  const carbDiff = Math.abs(dish.carbsG - remaining.carbsG) / carbRef;
  const fatDiff = Math.abs(dish.fatG - remaining.fatG) / fatRef;
  return clamp01(1 - (carbDiff + fatDiff) / 2);
}

export interface MatchScoreInput {
  dish: NutritionFacts;
  remaining: MacroTargets;
  distanceKm?: number | null;
  maxDistanceKm?: number; // for normalizing the distance score; defaults to 15km
  cuisineMatchesPreference?: boolean;
  priorityMatched?: boolean; // e.g. dish genuinely is high-protein when priority === 'protein'
}

export interface MatchScoreBreakdown {
  score: number; // 0-100
  proteinFit: number; // 0-100 each, for the "why it fits" UI
  calorieFit: number;
  macroBalance: number;
  distance: number;
  preference: number;
  weights: MatchWeights;
}

export function computeMatchScore(input: MatchScoreInput, priority: MatchPriority | null, goal?: Goal): MatchScoreBreakdown {
  const weights = weightsFor(priority, goal);

  const proteinFit = proteinFitScore(input.dish, input.remaining);
  const calorieFit = calorieFitScore(input.dish, input.remaining);
  const macroBalance = macroBalanceScore(input.dish, input.remaining);

  let distanceScore = 0.5; // neutral when distance is unknown, rather than penalizing
  if (input.distanceKm != null) {
    const maxD = input.maxDistanceKm ?? 15;
    distanceScore = clamp01(1 - input.distanceKm / maxD);
  }

  let preferenceScore = 0.5;
  if (input.cuisineMatchesPreference !== undefined || input.priorityMatched !== undefined) {
    const hits = [input.cuisineMatchesPreference, input.priorityMatched].filter((v) => v !== undefined);
    const trueCount = hits.filter(Boolean).length;
    preferenceScore = hits.length > 0 ? trueCount / hits.length : 0.5;
  }

  const score =
    proteinFit * weights.proteinFit +
    calorieFit * weights.calorieFit +
    macroBalance * weights.macroBalance +
    distanceScore * weights.distance +
    preferenceScore * weights.preference;

  return {
    score: Math.round(score),
    proteinFit: Math.round(proteinFit * 100),
    calorieFit: Math.round(calorieFit * 100),
    macroBalance: Math.round(macroBalance * 100),
    distance: Math.round(distanceScore * 100),
    preference: Math.round(preferenceScore * 100),
    weights,
  };
}

/** Plain-language "why it fits" bullets built directly from the score components — never invented copy. */
export function matchReasons(breakdown: MatchScoreBreakdown, dish: NutritionFacts, remaining: MacroTargets): string[] {
  const reasons: string[] = [];
  if (breakdown.proteinFit >= 70) reasons.push('High protein relative to its calories');
  if (breakdown.calorieFit >= 70) reasons.push('Fits your remaining calories');
  if (breakdown.macroBalance >= 70) reasons.push('Good balance of carbs and fat for what you have left');
  if (dish.calories > 0 && remaining.calories > 0 && proteinDensity(dish) > 0) {
    reasons.push('Good protein-to-calorie ratio');
  }
  if (breakdown.distance >= 80) reasons.push('Close by');
  return reasons.slice(0, 4);
}
