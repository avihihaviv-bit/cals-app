import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useTargets } from './useTargets';
import { useDiaryForDate } from './useDiary';
import { todayISO } from '@/utils/date';
import type { MacroTargets } from '@/types';

/** Shared data surface for every AI Coach sub-view — the profile, today's totals, and today's remaining macros. */
export function useAICoachData() {
  const profile = useAppStore((s) => s.profile);
  const { targets } = useTargets();
  const today = useDiaryForDate(todayISO());

  const remaining = useMemo<MacroTargets>(
    () => ({
      calories: Math.max(targets.calories - today.totals.calories, 0),
      proteinG: Math.max(targets.proteinG - today.totals.proteinG, 0),
      carbsG: Math.max(targets.carbsG - today.totals.carbsG, 0),
      fatG: Math.max(targets.fatG - today.totals.fatG, 0),
    }),
    [targets, today.totals],
  );

  return { profile, targets, totals: today.totals, entries: today.entries, remaining };
}
