import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { sumNutrition } from '@/utils/nutritionCalculator';
import type { DiaryEntry, MealType, NutritionFacts } from '@/types';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export interface DiaryForDate {
  date: string;
  entries: DiaryEntry[];
  byMeal: Record<MealType, DiaryEntry[]>;
  totals: NutritionFacts;
  mealTotals: Record<MealType, NutritionFacts>;
}

const EMPTY: NutritionFacts = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 };

export function useDiaryForDate(date: string): DiaryForDate {
  const allEntries = useAppStore((s) => s.diaryEntries);

  return useMemo(() => {
    const entries = allEntries.filter((e) => e.date === date);
    const byMeal = {} as Record<MealType, DiaryEntry[]>;
    const mealTotals = {} as Record<MealType, NutritionFacts>;
    for (const mt of MEAL_TYPES) {
      const mealEntries = entries.filter((e) => e.mealType === mt);
      byMeal[mt] = mealEntries;
      mealTotals[mt] = mealEntries.length ? sumNutrition(mealEntries.map((e) => e.nutrition)) : EMPTY;
    }
    const totals = entries.length ? sumNutrition(entries.map((e) => e.nutrition)) : EMPTY;
    return { date, entries, byMeal, totals, mealTotals };
  }, [allEntries, date]);
}

export { MEAL_TYPES };
