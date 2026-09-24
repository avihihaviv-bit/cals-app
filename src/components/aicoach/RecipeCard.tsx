import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { todayISO } from '@/utils/date';
import { suggestMealType } from '@/utils/mealTime';
import type { Recipe } from '@/types';
import type { RegenerateModifier } from '@/utils/recipeGenerator';

const REGEN_ACTIONS: { modifier: RegenerateModifier; label: string }[] = [
  { modifier: 'faster', label: '🔄 Make it faster' },
  { modifier: 'more_protein', label: '🥩 More protein' },
  { modifier: 'fewer_calories', label: '🔥 Fewer calories' },
  { modifier: 'tastier', label: '😋 Make it tastier' },
  { modifier: 'cheaper', label: '💰 Make it cheaper' },
  { modifier: 'vegetarian', label: '🌱 Vegetarian version' },
];

export function RecipeCard({ recipe, onRegenerate }: { recipe: Recipe; onRegenerate: (m: RegenerateModifier) => void }) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [added, setAdded] = useState(false);

  function addToDiary() {
    const mealType = recipe.mealType === 'dessert' ? 'snacks' : recipe.mealType;
    for (const ing of recipe.ingredients) {
      if (!ing.foodId || !ing.grams) continue;
      const food = findFoodById(ing.foodId);
      if (!food) continue;
      addDiaryEntry({
        date: todayISO(),
        mealType,
        foodId: food.id,
        foodName: food.name,
        foodImageEmoji: food.imageEmoji,
        quantityGrams: ing.grams,
        servingLabel: `${ing.grams}g`,
        nutrition: calculateNutrition(food.per100g, ing.grams),
        dataQuality: food.dataQuality,
        source: 'ai_coach',
        naturalness: food.naturalness,
      });
      touchRecent({ refId: food.id, refType: 'food' });
    }
    setAdded(true);
  }

  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card animate-fade-in">
      <p className="text-lg font-bold text-fg">🍽️ {recipe.name}</p>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <NutrientStat emoji="🔥" value={`${Math.round(recipe.nutrition.calories)}`} label="kcal" />
        <NutrientStat emoji="🥩" value={`${Math.round(recipe.nutrition.proteinG)}g`} label="Protein" />
        <NutrientStat emoji="🍚" value={`${Math.round(recipe.nutrition.carbsG)}g`} label="Carbs" />
        <NutrientStat emoji="🥑" value={`${Math.round(recipe.nutrition.fatG)}g`} label="Fat" />
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">🛒 Ingredients</p>
        <ul className="space-y-1">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="text-sm text-fg">
              • {ing.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">👨‍🍳 Instructions</p>
        <ol className="space-y-1.5">
          {recipe.instructions.map((step, i) => (
            <li key={i} className="flex gap-2 text-sm text-fg">
              <span className="font-bold text-primary-500">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-alt p-3 text-center text-xs">
        <div>
          <p className="font-bold text-fg">{recipe.prepMinutes} min</p>
          <p className="text-muted">Prep</p>
        </div>
        <div>
          <p className="font-bold text-fg">{recipe.cookMinutes} min</p>
          <p className="text-muted">Cooking</p>
        </div>
        <div>
          <p className="font-bold text-fg">{totalMinutes} min</p>
          <p className="text-muted">Total</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-primary-50 p-3">
        <p className="text-xs font-bold text-primary-800">🎯 Why it fits</p>
        <p className="mt-1 text-xs text-primary-700">{recipe.whyItFits}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {REGEN_ACTIONS.map((a) => (
          <button
            key={a.modifier}
            onClick={() => onRegenerate(a.modifier)}
            className="rounded-full border border-default bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-primary-300 hover:text-primary-700"
          >
            {a.label}
          </button>
        ))}
      </div>

      <button
        onClick={addToDiary}
        disabled={added}
        className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
          added ? 'bg-primary-500 text-white' : 'bg-ink text-white hover:bg-ink/90'
        }`}
      >
        {added ? 'Added to diary ✓' : 'Add to Diary'}
      </button>
    </div>
  );
}

function NutrientStat({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div>
      <p className="text-base">{emoji}</p>
      <p className="text-sm font-bold tabular-nums text-fg">{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}
