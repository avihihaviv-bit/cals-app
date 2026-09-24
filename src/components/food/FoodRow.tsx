import { DataQualityBadge } from '@/components/ui/DataQualityBadge';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { nutritionService } from '@/services/NutritionService';
import type { ResolvedFood } from '@/utils/resolveFoodRef';

interface FoodRowProps {
  food: ResolvedFood;
  onClick: () => void;
}

export function FoodRow({ food, onClick }: FoodRowProps) {
  const nutrition = nutritionService.nutritionForQuantity(food.per100g, food.defaultServing.grams);

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-3 text-left shadow-card transition hover:shadow-elevated active:scale-[0.99]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xl">{food.emoji}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{food.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {food.subtitle && <span className="truncate">{food.subtitle}</span>}
          <span>{food.defaultServing.label}</span>
          <DataQualityBadge quality={food.dataQuality} compact />
          <NaturalnessBadge score={food.naturalness.score} compact />
        </div>
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-fg">{Math.round(nutrition.calories)} kcal</span>
    </button>
  );
}
