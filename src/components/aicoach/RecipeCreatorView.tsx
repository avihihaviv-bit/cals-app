import { useState } from 'react';
import { X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { generateRecipe, applyRegenerateModifier } from '@/utils/recipeGenerator';
import type { RecipeConstraints, RegenerateModifier } from '@/utils/recipeGenerator';
import { useAICoachData } from '@/hooks/useAICoachData';
import type { Recipe, RecipeMealType, RecipeStyle } from '@/types';
import { RecipeCard } from './RecipeCard';

const MEAL_TYPES: { value: RecipeMealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snack' },
  { value: 'dessert', label: 'Dessert' },
];

const COOK_TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: Infinity, label: 'Any' },
];

const STYLE_OPTIONS: { value: RecipeStyle; label: string }[] = [
  { value: 'high_protein', label: 'High protein' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'quick', label: 'Quick' },
  { value: 'cheap', label: 'Cheap' },
  { value: 'filling', label: 'Filling' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'vegetarian', label: 'Vegetarian' },
];

export function RecipeCreatorView() {
  // Defaults are derived from the user's real remaining calories/protein for
  // today (not a generic placeholder) — still freely editable below.
  const { remaining } = useAICoachData();
  const [mealType, setMealType] = useState<RecipeMealType>('lunch');
  const [calorieMin, setCalorieMin] = useState(() => clamp(Math.round(remaining.calories * 0.25), 200, 900));
  const [calorieMax, setCalorieMax] = useState(() => clamp(Math.round(remaining.calories * 0.45), 300, 1200));
  const [minProteinG, setMinProteinG] = useState(() => clamp(Math.round(remaining.proteinG * 0.35), 15, 60));
  const [maxCookMinutes, setMaxCookMinutes] = useState(30);
  const [styles, setStyles] = useState<RecipeStyle[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [constraints, setConstraints] = useState<RecipeConstraints | null>(null);

  function toggleStyle(s: RecipeStyle) {
    setStyles((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function addIngredient() {
    const val = ingredientInput.trim();
    if (!val || ingredients.includes(val)) return;
    setIngredients((prev) => [...prev, val]);
    setIngredientInput('');
  }

  function removeIngredient(val: string) {
    setIngredients((prev) => prev.filter((i) => i !== val));
  }

  function generate() {
    const built: RecipeConstraints = {
      mealType,
      calorieMin: Math.min(calorieMin, calorieMax),
      calorieMax: Math.max(calorieMin, calorieMax),
      minProteinG,
      maxCookMinutes,
      styles,
      availableIngredientNames: ingredients,
    };
    setConstraints(built);
    setRecipe(generateRecipe(built));
  }

  function regenerate(modifier: RegenerateModifier) {
    if (!recipe || !constraints) return;
    const { recipe: nextRecipe, constraints: nextConstraints } = applyRegenerateModifier(recipe, constraints, modifier);
    setRecipe(nextRecipe);
    setConstraints(nextConstraints);
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="rounded-xl2 bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm font-bold text-fg">What do you want?</p>

        <FormRow label="🍽️ Meal type">
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((m) => (
              <Chip key={m.value} selected={mealType === m.value} onClick={() => setMealType(m.value)}>
                {m.label}
              </Chip>
            ))}
          </div>
        </FormRow>

        <FormRow label="🔥 Calories">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={calorieMin}
              onChange={(e) => setCalorieMin(Number(e.target.value) || 0)}
              className="input w-24"
            />
            <span className="text-sm text-muted">to</span>
            <input
              type="number"
              value={calorieMax}
              onChange={(e) => setCalorieMax(Number(e.target.value) || 0)}
              className="input w-24"
            />
            <span className="text-sm text-muted">kcal</span>
          </div>
        </FormRow>

        <FormRow label="🥩 Protein (at least)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={minProteinG}
              onChange={(e) => setMinProteinG(Number(e.target.value) || 0)}
              className="input w-24"
            />
            <span className="text-sm text-muted">g</span>
          </div>
        </FormRow>

        <FormRow label="⏱️ Cooking time">
          <div className="flex flex-wrap gap-2">
            {COOK_TIME_OPTIONS.map((o) => (
              <Chip key={o.label} selected={maxCookMinutes === o.value} onClick={() => setMaxCookMinutes(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </FormRow>

        <FormRow label="😋 Style">
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={styles.includes(o.value)} onClick={() => toggleStyle(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </FormRow>

        <FormRow label="🏠 What ingredients do you have?">
          <div className="flex items-center gap-2">
            <input
              value={ingredientInput}
              onChange={(e) => setIngredientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addIngredient();
                }
              }}
              placeholder="e.g. chicken, rice, eggs"
              className="input flex-1"
            />
            <Button size="sm" variant="secondary" onClick={addIngredient} type="button">
              Add
            </Button>
          </div>
          {ingredients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ingredients.map((i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                  {i}
                  <button onClick={() => removeIngredient(i)} aria-label={`Remove ${i}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted">The recipe will lean on what you have when it can.</p>
        </FormRow>

        <Button fullWidth size="lg" onClick={generate}>
          👨‍🍳 Create a Recipe
        </Button>
      </div>

      {recipe && <RecipeCard recipe={recipe} onRegenerate={regenerate} />}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold text-fg">{label}</p>
      {children}
    </div>
  );
}
