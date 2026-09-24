import { useMemo, useState } from 'react';
import { useAICoachData } from '@/hooks/useAICoachData';
import { useAppStore } from '@/store/useAppStore';
import { suggestMealOptionsByBias } from '@/utils/mealSuggestions';
import type { MealBias } from '@/utils/mealSuggestions';
import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { todayISO } from '@/utils/date';
import { suggestMealType } from '@/utils/mealTime';
import { OptionCard } from './WhatToEatView';
import type { MealOption } from '@/utils/mealSuggestions';

/** Shared implementation for the "Find high protein" and "Low-calorie meal" quick actions — same UI, different ranking. */
export function BiasedMealView({ bias }: { bias: MealBias }) {
  const { remaining, profile } = useAICoachData();
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [addedId, setAddedId] = useState<string | null>(null);

  const mealType = suggestMealType();
  const options = useMemo(() => suggestMealOptionsByBias(remaining, profile, bias, 4), [remaining, profile, bias]);

  function addOption(option: MealOption) {
    for (const item of option.items) {
      const food = findFoodById(item.foodId);
      if (!food) continue;
      addDiaryEntry({
        date: todayISO(),
        mealType,
        foodId: food.id,
        foodName: food.name,
        foodImageEmoji: food.imageEmoji,
        quantityGrams: item.grams,
        servingLabel: `${item.grams}g`,
        nutrition: calculateNutrition(food.per100g, item.grams),
        dataQuality: food.dataQuality,
        source: 'ai_coach',
        naturalness: food.naturalness,
      });
      touchRecent({ refId: food.id, refType: 'food' });
    }
    setAddedId(option.id);
  }

  if (options.length === 0) {
    return (
      <p className="rounded-xl2 bg-surface p-6 text-center text-sm text-muted shadow-card">
        Nothing fits well right now — you may already be close to today's targets.
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <p className="text-sm text-muted">
        {bias === 'protein'
          ? 'Sorted by protein-to-calorie ratio — the best protein density for your remaining budget.'
          : "Sorted lowest-calorie first, while still fitting what's left today."}
      </p>
      {options.map((opt) => (
        <OptionCard key={opt.id} option={opt} onAdd={addOption} added={addedId === opt.id} />
      ))}
    </div>
  );
}
