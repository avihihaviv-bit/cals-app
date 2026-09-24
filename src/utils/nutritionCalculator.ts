import type {
  ActivityLevel,
  Goal,
  GoalPace,
  MacroTargets,
  NutritionFacts,
  ServingUnit,
  UserProfile,
} from '@/types';

// ---------------------------------------------------------------------------
// NUTRITION CALCULATION ENGINE
//
// BMR: Harris-Benedict, revised (Roza & Shizgal, 1984).
//   Male:   BMR = 88.362 + (13.397*kg) + (4.799*cm) - (5.677*age)
//   Female: BMR = 447.593 + (9.247*kg) + (3.098*cm) - (4.330*age)
//
// TDEE = BMR * activity multiplier.
//
// All results are ESTIMATES. Individual metabolism varies +/-10-15% from
// these formulas, which is why the UI always labels them as such and never
// presents them as exact figures.
// ---------------------------------------------------------------------------

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // little or no exercise
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  high: 1.725, // hard exercise 6-7 days/week
  very_high: 1.9, // very hard exercise & physical job
};

export function calculateBMR(profile: Pick<UserProfile, 'sex' | 'weightKg' | 'heightCm' | 'age'>): number {
  const { sex, weightKg, heightCm, age } = profile;
  const bmr =
    sex === 'male'
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  return Math.round(bmr);
}

export function calculateTDEE(profile: Pick<UserProfile, 'sex' | 'weightKg' | 'heightCm' | 'age' | 'activityLevel'>): number {
  const bmr = calculateBMR(profile);
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel]);
}

/** Safe, bounded calorie adjustments for adults — never a dangerous deficit/surplus. */
const GOAL_ADJUSTMENT: Record<Goal, Record<GoalPace, number>> = {
  maintain: { moderate: 0, fast: 0 },
  lose: { moderate: -0.15, fast: -0.22 }, // capped well inside safe range
  gain: { moderate: 0.1, fast: 0.18 },
  recomposition: { moderate: -0.05, fast: -0.05 },
  performance: { moderate: 0.05, fast: 0.08 },
};

/**
 * Teen (under-18) adjustments — deliberately much gentler than the adult
 * table, and there is no "fast" pace option at all for minors (the app
 * never offers an aggressive setting to a growing body). Every goal stays
 * selectable — see calculateCalorieTarget — but the resulting swing from
 * TDEE is small on purpose, because growth and development need a
 * consistent energy supply regardless of which goal was picked.
 */
const TEEN_GOAL_ADJUSTMENT: Record<Goal, number> = {
  maintain: 0,
  lose: -0.1,
  gain: 0.1,
  recomposition: -0.03,
  performance: 0.05,
};

/**
 * Absolute floor calories that we will never go under, regardless of the
 * formula's output — protects against dangerously low targets for people
 * with a low BMR (short stature, older age, low body weight).
 */
const SAFE_CALORIE_FLOOR: Record<'male' | 'female', number> = {
  male: 1500,
  female: 1200,
};

export interface CalorieTargetResult {
  tdee: number;
  bmr: number;
  targetCalories: number;
  wasCapped: boolean;
  /** True for any user under 18 — the UI should show the teen-guardrail message, not necessarily "goal was overridden". */
  minorGuardrail: boolean;
}

/**
 * Computes the daily calorie target with safety guardrails:
 *  - adults: deficits/surpluses are capped to a moderate, sustainable range,
 *    never below the sex-specific safe floor, never above 1.25x TDEE
 *  - under 18: EVERY goal (maintain/lose/gain/recomposition/performance)
 *    stays selectable — the app never locks a goal behind an age check —
 *    but the math always uses the much gentler TEEN_GOAL_ADJUSTMENT table,
 *    a higher effective floor (never under 90% of TDEE), and a lower
 *    ceiling (never over 1.15x TDEE). The UI must still show a message
 *    recommending involving a parent/dietitian/doctor for any
 *    weight-related goal — this is informational, not a block.
 */
export function calculateCalorieTarget(profile: UserProfile): CalorieTargetResult {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(profile);

  const pct = profile.isMinor ? TEEN_GOAL_ADJUSTMENT[profile.goal] : GOAL_ADJUSTMENT[profile.goal][profile.goalPace ?? 'moderate'];
  let target = Math.round(tdee * (1 + pct));

  let wasCapped = false;
  const floor = profile.isMinor ? Math.max(SAFE_CALORIE_FLOOR[profile.sex], Math.round(tdee * 0.9)) : SAFE_CALORIE_FLOOR[profile.sex];
  if (target < floor) {
    target = floor;
    wasCapped = true;
  }
  const ceiling = Math.round(tdee * (profile.isMinor ? 1.15 : 1.25));
  if (target > ceiling) {
    target = ceiling;
    wasCapped = true;
  }

  return { tdee, bmr, targetCalories: target, wasCapped, minorGuardrail: profile.isMinor };
}

/**
 * Macro split. Protein is anchored to bodyweight (supports muscle
 * maintenance/growth regardless of goal), fat gets a healthy minimum
 * percentage of calories, and carbs fill the remainder — never a flat
 * weight-only formula.
 *
 * If `customProteinTargetG` is provided (a user-entered override), it's
 * used directly instead of the computed value — carbs/fat are still
 * derived around whatever protein figure is actually in effect, so the
 * three macros always reconcile back to targetCalories. Validate a custom
 * target against `recommendedProteinRange` before accepting it — this
 * function does not judge the input itself, it just uses it.
 */
/** Rounds to the nearest multiple of `step` (e.g. roundToNearest(87, 5) === 85). */
export function roundToNearest(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/**
 * Computes the three macro targets, then runs a validation/reconciliation
 * pass: protein and fat are rounded to a clean 5g step for a friendlier
 * display, which can drift the reconstructed calorie total
 * (protein*4 + fat*9 + carbs*4) a few kcal away from targetCalories. Carbs —
 * the macro explicitly defined as "whatever calories remain" — absorbs that
 * rounding drift so the three macros always add back up to the calorie
 * target, never silently diverging from it.
 */
export function calculateMacroTargets(profile: UserProfile, targetCalories: number): MacroTargets {
  const proteinRange = recommendedProteinRange(profile);
  const computedProteinG = roundToNearest((proteinRange.minG + proteinRange.maxG) / 2, 5);
  // weightKg * 2.0 is treated as an absolute adult ceiling regardless of
  // which goal-based factor produced the computed value (and regardless of
  // a manual override) — protein is never recommended, nor accepted from a
  // custom target, above that per-kg maximum for an adult. Minors already
  // sit well under this via their own lower factor table.
  const proteinCeilingG = profile.isMinor ? proteinRange.maxG : roundToNearest(profile.weightKg * 2.0, 5);
  const requestedProteinG = profile.customProteinTargetG ?? computedProteinG;
  const proteinG = Math.min(requestedProteinG, proteinCeilingG);
  const proteinCals = proteinG * 4;

  const fatG = roundToNearest(recommendedFatPerKg(profile) * profile.weightKg, 5);
  const fatCals = fatG * 9;

  let carbsG = roundToNearest(Math.max(targetCalories - proteinCals - fatCals, 0) / 4, 5);

  // Validation: does protein*4 + fat*9 + carbs*4 reconcile back to the
  // calorie target? If rounding pushed it off by more than a few kcal,
  // absorb the difference into carbs (never into protein or fat, which are
  // the macros the user actually sees as a fixed recommendation).
  const reconstructed = proteinCals + fatCals + carbsG * 4;
  const delta = targetCalories - reconstructed;
  if (Math.abs(delta) >= 5) {
    carbsG = Math.max(0, carbsG + roundToNearest(delta / 4, 5));
  }

  return { calories: targetCalories, proteinG, carbsG, fatG };
}

/**
 * Grams of protein per kg bodyweight, by goal — lower, general-guidance
 * ranges for under-18 users (adolescent protein needs are less
 * well-established than adult sports-nutrition ranges, so these are
 * intentionally conservative estimates, not clinical DRI figures).
 */
function recommendedProteinPerKg(profile: Pick<UserProfile, 'goal' | 'isMinor'>): number {
  if (profile.isMinor) {
    if (profile.goal === 'recomposition' || profile.goal === 'gain') return 1.6;
    if (profile.goal === 'performance') return 1.5;
    return 1.3;
  }
  if (profile.goal === 'recomposition' || profile.goal === 'gain') return 2.0;
  if (profile.goal === 'performance') return 1.8;
  return 1.6;
}

export interface ProteinRange {
  minG: number;
  maxG: number;
}

/** The recommended protein range (±15% around the computed factor), rounded to a clean 5g step — used both to validate a manual override and to display "80-100g" style ranges instead of one rigid number. */
export function recommendedProteinRange(profile: Pick<UserProfile, 'goal' | 'isMinor' | 'weightKg'>): ProteinRange {
  const perKg = recommendedProteinPerKg(profile);
  const mid = profile.weightKg * perKg;
  return { minG: roundToNearest(mid * 0.85, 5), maxG: roundToNearest(mid * 1.15, 5) };
}

/**
 * Fat, anchored to bodyweight like protein rather than a fixed slice of
 * total calories — 1.2g/kg for adults (important for hormonal health),
 * 1.0g/kg for minors (a gentler, still growth-appropriate amount; the app
 * never applies the adult formula directly to a under-18 profile).
 */
function recommendedFatPerKg(profile: Pick<UserProfile, 'isMinor'>): number {
  return profile.isMinor ? 1.0 : 1.2;
}

export interface RangeValue {
  min: number;
  max: number;
  recommended: number;
}

export interface TargetRanges {
  calories: RangeValue;
  protein: RangeValue;
  fat: RangeValue;
  /** Carbs stay a single derived number — "whatever calories remain" isn't naturally a range. */
  carbsG: number;
}

/**
 * The range-based view of daily targets ("2,300-2,500 kcal, recommended
 * 2,400") used by the Onboarding review step and Profile page's target
 * summary, so the plan reads as a flexible estimate rather than one number
 * the user must hit exactly. The single-number MacroTargets from
 * calculateFullTargets remain the source of truth used everywhere else
 * (Dashboard progress bars, diary, AI recommendations) — this is an
 * additional display layer, not a replacement.
 */
export function calculateTargetRanges(profile: UserProfile): TargetRanges {
  const { targetCalories } = calculateCalorieTarget(profile);
  const protein = recommendedProteinRange(profile);
  const fatMid = recommendedFatPerKg(profile) * profile.weightKg;
  const macros = calculateMacroTargets(profile, targetCalories);

  return {
    calories: {
      min: roundToNearest(targetCalories * 0.96, 25),
      max: roundToNearest(targetCalories * 1.04, 25),
      recommended: targetCalories,
    },
    protein: {
      min: protein.minG,
      max: protein.maxG,
      recommended: roundToNearest((protein.minG + protein.maxG) / 2, 5),
    },
    fat: {
      min: roundToNearest(fatMid * 0.85, 5),
      max: roundToNearest(fatMid * 1.15, 5),
      recommended: roundToNearest(fatMid, 5),
    },
    carbsG: macros.carbsG,
  };
}

export function calculateFullTargets(profile: UserProfile): { calorieResult: CalorieTargetResult; macros: MacroTargets } {
  const calorieResult = calculateCalorieTarget(profile);
  const macros = calculateMacroTargets(profile, calorieResult.targetCalories);
  return { calorieResult, macros };
}

// ---------------------------------------------------------------------------
// HYDRATION
//
// A simple, transparent estimate: ~33ml per kg bodyweight (a commonly cited
// general guideline), with a modest bump for higher activity levels and
// training days. This is explicitly an estimate, never shown as a medical
// number — see components/dashboard/WaterTracker.tsx.
// ---------------------------------------------------------------------------

export function calculateHydrationTargetMl(profile: Pick<UserProfile, 'weightKg' | 'activityLevel' | 'trainingDaysPerWeek'>): number {
  const base = profile.weightKg * 33;
  const activityBumpPct: Record<ActivityLevel, number> = {
    sedentary: 0,
    light: 0.05,
    moderate: 0.1,
    high: 0.15,
    very_high: 0.2,
  };
  const trainingBump = profile.trainingDaysPerWeek >= 3 ? 0.05 : 0;
  const total = base * (1 + activityBumpPct[profile.activityLevel] + trainingBump);
  // Round to the nearest 50ml for a clean display number.
  return Math.round(total / 50) * 50;
}

// ---------------------------------------------------------------------------
// PER-FOOD NUTRITION CALCULATION
//
// calculateNutrition scales a food's per-100g baseline nutrition to any
// requested quantity. It never hard-codes values for specific serving
// sizes — every serving option is just a gram-equivalent, so changing the
// quantity always recomputes from the same per-100g source of truth.
// ---------------------------------------------------------------------------

export function calculateNutrition(per100g: NutritionFacts, quantityGrams: number): NutritionFacts {
  const factor = quantityGrams / 100;
  const round = (n: number | undefined, digits = 1) =>
    n === undefined ? undefined : Math.round(n * factor * 10 ** digits) / 10 ** digits;

  return {
    calories: Math.round(per100g.calories * factor),
    proteinG: round(per100g.proteinG) ?? 0,
    carbsG: round(per100g.carbsG) ?? 0,
    fatG: round(per100g.fatG) ?? 0,
    fiberG: round(per100g.fiberG),
    sugarG: round(per100g.sugarG),
    sodiumMg: per100g.sodiumMg === undefined ? undefined : Math.round(per100g.sodiumMg * factor),
  };
}

export function gramsForUnit(unit: ServingUnit, grams: number, quantity: number): number {
  if (unit === 'g' || unit === 'ml') return quantity;
  return grams * quantity;
}

export function sumNutrition(items: NutritionFacts[]): NutritionFacts {
  return items.reduce<NutritionFacts>(
    (acc, cur) => ({
      calories: acc.calories + cur.calories,
      proteinG: acc.proteinG + cur.proteinG,
      carbsG: acc.carbsG + cur.carbsG,
      fatG: acc.fatG + cur.fatG,
      fiberG: (acc.fiberG ?? 0) + (cur.fiberG ?? 0),
      sugarG: (acc.sugarG ?? 0) + (cur.sugarG ?? 0),
      sodiumMg: (acc.sodiumMg ?? 0) + (cur.sodiumMg ?? 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 },
  );
}

export function calculateAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear;
}

/**
 * Protein grams per 100 kcal — a higher value means a better protein-to-
 * calorie ratio than raw protein grams alone would show (e.g. a 600kcal
 * dish with 40g protein is a worse ratio than a 300kcal dish with 30g).
 * Used to rank foods/dishes for high-protein recommendations.
 */
export function proteinDensity(nutrition: Pick<NutritionFacts, 'proteinG' | 'calories'>): number {
  if (nutrition.calories <= 0) return 0;
  return (nutrition.proteinG / nutrition.calories) * 100;
}
