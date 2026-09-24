import { useMemo, useState } from 'react';
import { Zap, Scale, Cookie } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAICoachData } from '@/hooks/useAICoachData';
import { useAppStore } from '@/store/useAppStore';
import { suggestMealOptions } from '@/utils/mealSuggestions';
import type { MealOption, MealOptionCategory } from '@/utils/mealSuggestions';
import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { todayISO } from '@/utils/date';
import { suggestMealType, MEAL_LABELS } from '@/utils/mealTime';

const CATEGORY_META: Record<MealOptionCategory, { label: string; icon: React.ReactNode }> = {
  quick: { label: '⚡ Quick', icon: <Zap size={13} /> },
  balanced: { label: '🥗 Balanced', icon: <Scale size={13} /> },
  treat: { label: '😋 Treat / Flexible', icon: <Cookie size={13} /> },
};

export function WhatToEatView() {
  const { remaining, profile } = useAICoachData();
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [asked, setAsked] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const mealType = suggestMealType();
  const result = useMemo(
    () => (asked ? suggestMealOptions(remaining, mealType, profile) : null),
    [asked, remaining, mealType, profile],
  );

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

  if (!asked) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl2 bg-surface p-8 text-center shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">🍽️</div>
        <div>
          <p className="font-semibold text-fg">Not sure what to eat next?</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Based on what you've eaten today, what's left, the time of day, and your {MEAL_LABELS[mealType].label.toLowerCase()}.
          </p>
        </div>
        <Button size="lg" onClick={() => setAsked(true)}>
          🍽️ What Should I Eat?
        </Button>
      </div>
    );
  }

  if (!result || (!result.best && result.options.length === 0)) {
    return (
      <p className="rounded-xl2 bg-surface p-6 text-center text-sm text-muted shadow-card">
        You're close to today's targets — a light option or some water might be all you need right now.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {result.best && (
        <div>
          <p className="mb-2 text-sm font-bold text-fg">🥇 Best Match</p>
          <OptionCard option={result.best} onAdd={addOption} added={addedId === result.best.id} highlight />
        </div>
      )}

      {result.options.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-fg">More options</p>
          <div className="space-y-3">
            {result.options.map((opt) => (
              <div key={opt.id}>
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">{CATEGORY_META[opt.category].label}</p>
                <OptionCard option={opt} onAdd={addOption} added={addedId === opt.id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OptionCard({
  option,
  onAdd,
  added,
  highlight,
}: {
  option: MealOption;
  onAdd: (o: MealOption) => void;
  added: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl2 p-4 shadow-card ${highlight ? 'bg-ink text-white' : 'bg-surface'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`flex items-center gap-1.5 text-sm font-bold ${highlight ? 'text-white' : 'text-fg'}`}>
          <span>{option.emoji}</span>
          {option.name}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${highlight ? 'bg-white/15 text-white' : 'bg-primary-50 text-primary-700'}`}>
          {option.matchScore}% match
        </span>
      </div>
      <div className={`mt-2 grid grid-cols-4 gap-1 text-center text-[11px] ${highlight ? 'text-white/70' : 'text-muted'}`}>
        <span>
          <b>{Math.round(option.totals.calories)}</b> kcal
        </span>
        <span>
          <b>{Math.round(option.totals.proteinG)}g</b> protein
        </span>
        <span>
          <b>{Math.round(option.totals.carbsG)}g</b> carbs
        </span>
        <span>
          <b>{Math.round(option.totals.fatG)}g</b> fat
        </span>
      </div>
      <p className={`mt-2 text-xs ${highlight ? 'text-white/70' : 'text-muted'}`}>
        <b>Why?</b> {option.whyItFits}
      </p>
      <button
        onClick={() => onAdd(option)}
        disabled={added}
        className={`mt-3 w-full rounded-lg py-2 text-xs font-semibold transition active:scale-[0.98] ${
          added
            ? 'bg-primary-500 text-white'
            : highlight
              ? 'bg-surface text-fg hover:bg-surface-alt2'
              : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
        }`}
      >
        {added ? 'Added to diary ✓' : 'Add to diary'}
      </button>
    </div>
  );
}
