import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { nutritionService } from '@/services/NutritionService';
import type { MacroTargets } from '@/types';

export interface TargetsResult {
  hasProfile: boolean;
  targets: MacroTargets;
  bmr: number;
  tdee: number;
  wasCapped: boolean;
  minorGuardrail: boolean;
}

/**
 * Deliberately all-zero, never a plausible-looking guess (e.g. "2000 kcal").
 * `hasProfile: false` is the real signal callers must check — this exists
 * only so the type stays a non-nullable MacroTargets; it should never be
 * displayed to a user as if it were their computed target. In practice this
 * branch is unreachable in the running app (App.tsx never renders a screen
 * that calls useTargets() before onboarding sets a profile), but it must
 * never fabricate numbers if that invariant is ever broken.
 */
const NO_PROFILE_TARGETS: MacroTargets = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function useTargets(): TargetsResult {
  const profile = useAppStore((s) => s.profile);

  return useMemo(() => {
    if (!profile) {
      return { hasProfile: false, targets: NO_PROFILE_TARGETS, bmr: 0, tdee: 0, wasCapped: false, minorGuardrail: false };
    }
    const { calorieResult, macros } = nutritionService.computeTargets(profile);
    return {
      hasProfile: true,
      targets: macros,
      bmr: calorieResult.bmr,
      tdee: calorieResult.tdee,
      wasCapped: calorieResult.wasCapped,
      minorGuardrail: calorieResult.minorGuardrail,
    };
  }, [profile]);
}
