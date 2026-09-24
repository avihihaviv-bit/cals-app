import { useMemo } from 'react';
import { recommendationService } from '@/services/RecommendationService';
import { findFoodById } from '@/data/foods';
import { useAppStore } from '@/store/useAppStore';
import { suggestMealType } from '@/utils/mealTime';
import { clamp } from '@/utils/format';
import type { MacroTargets, NutritionFacts } from '@/types';

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

interface MealRecommendationsProps {
  totals: NutritionFacts;
  targets: MacroTargets;
  date: string;
}

export function MealRecommendations({ totals, targets, date }: MealRecommendationsProps) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);

  const remaining: MacroTargets = useMemo(
    () => ({
      calories: clamp(targets.calories - totals.calories, 0, 100000),
      proteinG: clamp(targets.proteinG - totals.proteinG, 0, 10000),
      carbsG: clamp(targets.carbsG - totals.carbsG, 0, 10000),
      fatG: clamp(targets.fatG - totals.fatG, 0, 10000),
    }),
    [totals, targets],
  );

  const recommendations = useMemo(() => recommendationService.recommendMeals(remaining, 3), [remaining]);

  if (remaining.calories < 100) return null;

  function handleAdd(rec: (typeof recommendations)[number]) {
    const mealType = suggestMealType();
    for (const item of rec.items) {
      const food = findFoodById(item.foodId);
      if (!food) continue;
      const factor = item.grams / 100;
      addDiaryEntry({
        date,
        mealType,
        foodId: food.id,
        foodName: food.name,
        foodImageEmoji: food.imageEmoji,
        quantityGrams: item.grams,
        servingLabel: `${item.grams}g`,
        nutrition: {
          calories: Math.round(food.per100g.calories * factor),
          proteinG: Math.round(food.per100g.proteinG * factor * 10) / 10,
          carbsG: Math.round(food.per100g.carbsG * factor * 10) / 10,
          fatG: Math.round(food.per100g.fatG * factor * 10) / 10,
        },
        dataQuality: food.dataQuality,
        source: 'search',
        naturalness: food.naturalness,
      });
      touchRecent({ refId: food.id, refType: 'food' });
    }
  }

  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-sm font-bold text-fg">What should I eat?</h2>
        <p className="text-xs text-muted">
          Based on ~{Math.round(remaining.calories)} kcal and {Math.round(remaining.proteinG)}g protein remaining today.
        </p>
      </div>
      <div className="space-y-2.5">
        {recommendations.map((rec, i) => (
          <div key={rec.id} className="rounded-xl2 bg-surface p-3.5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xl leading-none">{RANK_EMOJI[i] ?? rec.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-fg">{rec.name}</p>
                  <p className="text-xs text-muted">
                    {Math.round(rec.totals.calories)} kcal · {Math.round(rec.totals.proteinG)}g protein
                    {rec.naturalness !== null && ` · 🌿 ${rec.naturalness}% natural`}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                {rec.matchScore}% match
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{rec.reason}</p>
            <button
              onClick={() => handleAdd(rec)}
              className="mt-2.5 w-full rounded-lg bg-primary-50 py-2 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 active:scale-[0.98]"
            >
              Add to diary
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
