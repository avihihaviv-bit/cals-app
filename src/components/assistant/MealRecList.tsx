import { findFoodById } from '@/data/foods';
import { useAppStore } from '@/store/useAppStore';
import { todayISO } from '@/utils/date';
import type { RecommendedMeal } from '@/services/RecommendationService';

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

export function MealRecList({ recs, onAdded }: { recs: RecommendedMeal[]; onAdded?: (rec: RecommendedMeal) => void }) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);

  function handleAdd(rec: RecommendedMeal) {
    for (const item of rec.items) {
      const food = findFoodById(item.foodId);
      if (!food) continue;
      const factor = item.grams / 100;
      addDiaryEntry({
        date: todayISO(),
        mealType: 'snacks',
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
    onAdded?.(rec);
  }

  return (
    <div className="space-y-2">
      {recs.map((rec, i) => (
        <div key={rec.id} className="rounded-xl bg-surface-alt p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg">
              {RANK_EMOJI[i] ?? rec.emoji} {rec.name}
            </span>
            <span className="text-[10px] font-bold text-primary-600">{rec.matchScore}% match</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            {Math.round(rec.totals.calories)} kcal · {Math.round(rec.totals.proteinG)}g protein
            {rec.naturalness !== null && ` · 🌿 ${rec.naturalness}% natural`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{rec.reason}</p>
          <button
            onClick={() => handleAdd(rec)}
            className="mt-1.5 w-full rounded-lg bg-primary-500 py-1.5 text-[11px] font-semibold text-white transition hover:bg-primary-600"
          >
            Add to diary
          </button>
        </div>
      ))}
    </div>
  );
}
