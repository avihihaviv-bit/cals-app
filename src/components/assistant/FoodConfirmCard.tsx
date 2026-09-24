import { useState } from 'react';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { MEAL_LABELS, suggestMealType } from '@/utils/mealTime';
import { useAppStore } from '@/store/useAppStore';
import { todayISO } from '@/utils/date';
import type { ParsedFoodMention } from '@/utils/nlFoodParser';
import type { MealType } from '@/types';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export function FoodConfirmCard({ mentions, onConfirmed }: { mentions: ParsedFoodMention[]; onConfirmed: () => void }) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);

  const [items, setItems] = useState(mentions.map((m) => ({ ...m })));
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [confirmed, setConfirmed] = useState(false);

  function updateGrams(index: number, grams: number) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, grams } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmAll() {
    const date = todayISO();
    for (const item of items) {
      const nutrition = calculateNutrition(item.food.per100g, item.grams);
      addDiaryEntry({
        date,
        mealType,
        foodId: item.food.id,
        foodName: item.food.name,
        foodImageEmoji: item.food.imageEmoji,
        quantityGrams: item.grams,
        servingLabel: `${item.grams}g`,
        nutrition,
        dataQuality: item.food.dataQuality,
        source: 'restaurantId' in item.food ? 'restaurant' : 'search',
        naturalness: item.food.naturalness,
      });
      touchRecent({ refId: item.food.id, refType: 'restaurantId' in item.food ? 'dish' : 'food' });
    }
    setConfirmed(true);
    onConfirmed();
  }

  if (items.length === 0) {
    return <p className="rounded-xl bg-surface-alt p-3 text-xs text-muted">Nothing left to add.</p>;
  }

  if (confirmed) {
    return (
      <p className="rounded-xl bg-primary-50 p-3 text-sm font-medium text-primary-700">
        Added {items.length} item{items.length > 1 ? 's' : ''} to {MEAL_LABELS[mealType].label} ✓
      </p>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl2 bg-surface-alt p-3">
      {items.map((item, i) => {
        const nutrition = calculateNutrition(item.food.per100g, item.grams);
        return (
          <div key={`${item.food.id}-${i}`} className="rounded-xl bg-surface p-2.5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span>{item.food.imageEmoji}</span>
                {item.food.name}
              </div>
              <button onClick={() => removeItem(i)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <QuantityStepper value={item.grams} onChange={(g) => updateGrams(i, g)} step={10} min={5} />
              <div className="flex items-center gap-1.5">
                <NaturalnessBadge score={item.food.naturalness.score} compact />
                <span className="text-xs font-semibold text-muted">{Math.round(nutrition.calories)} kcal</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {MEAL_ORDER.map((mt) => (
          <Chip key={mt} selected={mealType === mt} onClick={() => setMealType(mt)}>
            <span className="mr-1">{MEAL_LABELS[mt].emoji}</span>
            {MEAL_LABELS[mt].label}
          </Chip>
        ))}
      </div>

      <Button fullWidth size="sm" onClick={confirmAll}>
        Confirm &amp; Add {items.length > 1 ? `All (${items.length})` : ''}
      </Button>
    </div>
  );
}
