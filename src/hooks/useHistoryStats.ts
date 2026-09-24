import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { sumNutrition } from '@/utils/nutritionCalculator';
import { weightedNaturalness } from '@/utils/naturalness';
import { lastNDays } from '@/utils/date';
import type { NutritionFacts } from '@/types';

export interface DayStat {
  date: string;
  totals: NutritionFacts;
  hasEntries: boolean;
  naturalness: number | null;
}

export function useDayStats(days: string[]): DayStat[] {
  const entries = useAppStore((s) => s.diaryEntries);

  return useMemo(
    () =>
      days.map((date) => {
        const dayEntries = entries.filter((e) => e.date === date);
        return {
          date,
          totals: dayEntries.length ? sumNutrition(dayEntries.map((e) => e.nutrition)) : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
          hasEntries: dayEntries.length > 0,
          naturalness: weightedNaturalness(dayEntries.map((e) => ({ naturalness: e.naturalness, grams: e.quantityGrams }))),
        };
      }),
    [entries, days.join(',')],
  );
}

export function useLastNDaysStats(n: number): DayStat[] {
  const days = useMemo(() => lastNDays(n), [n]);
  return useDayStats(days);
}
