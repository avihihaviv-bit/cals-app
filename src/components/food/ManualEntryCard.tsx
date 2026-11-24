import { useState } from 'react';
import { Check, PenLine } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { suggestMealType, MEAL_LABELS } from '@/utils/mealTime';
import { generateId } from '@/utils/id';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import type { FoodItem, MealType, NutritionFacts } from '@/types';

/**
 * Log food by typing its numbers yourself — no AI, no photo. For when the AI
 * can't recognize something, its free quota is used up, or you already know
 * the values (from a package, a restaurant menu, an app). Saved to "My foods"
 * so it can be logged again in one tap.
 */
export function ManualEntryCard({ date, meal, onAdded }: { date: string; meal?: MealType; onAdded: () => void }) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const saveCustomFoods = useAppStore((s) => s.saveCustomFoods);
  const touchRecent = useAppStore((s) => s.touchRecent);

  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [grams, setGrams] = useState('');
  const [mealType, setMealType] = useState<MealType>(meal ?? suggestMealType());
  const [error, setError] = useState('');

  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  function save() {
    const kcal = num(calories);
    const p = protein.trim() ? num(protein) : 0;
    const c = carbs.trim() ? num(carbs) : 0;
    const f = fat.trim() ? num(fat) : 0;
    const g = grams.trim() ? num(grams) : 0;
    if (!calories.trim() || Number.isNaN(kcal)) return setError('Enter the calories (a number).');
    if ([p, c, f, g].some(Number.isNaN)) return setError('Protein, carbs, fat and weight must be numbers.');
    if (kcal > 5000 || p > 500 || c > 1000 || f > 500 || g > 5000) return setError('That looks too high for one item — check the numbers.');
    setError('');

    const label = name.trim() || 'Quick add';
    const eaten: NutritionFacts = { calories: Math.round(kcal), proteinG: p, carbsG: c, fatG: f };
    // With a weight we store true per-100g values; without one, the whole portion is the unit (no invented grams).
    const portionGrams = g > 0 ? Math.round(g) : 100;
    const factor = 100 / portionGrams;
    const per100g: NutritionFacts = {
      calories: Math.round(eaten.calories * factor),
      proteinG: Math.round(p * factor * 10) / 10,
      carbsG: Math.round(c * factor * 10) / 10,
      fatG: Math.round(f * factor * 10) / 10,
    };
    const portion = { label: g > 0 ? `1 portion (${portionGrams}g)` : '1 portion', unit: 'serving' as const, grams: portionGrams };
    const food: FoodItem = {
      id: generateId('manual'),
      name: label,
      category: 'My foods',
      imageEmoji: '✍️',
      per100g,
      servingOptions: g > 0 ? [{ label: '100g', unit: 'g', grams: 100 }, portion] : [portion],
      defaultServing: portion,
      dataQuality: 'estimated',
      source: 'Values you entered',
      naturalness: { score: 50, reasons: ['Not rated — entered manually'] },
    };
    saveCustomFoods([food]);
    addDiaryEntry({
      date,
      mealType,
      foodId: food.id,
      foodName: label,
      foodImageEmoji: '✍️',
      quantityGrams: portionGrams,
      servingLabel: portion.label,
      nutrition: eaten,
      dataQuality: 'estimated',
      source: 'search',
      notes: 'Entered manually',
    });
    touchRecent({ refId: food.id, refType: 'food' });
    onAdded();
  }

  const field = 'input w-full py-2 text-sm';
  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <PenLine size={15} className="text-primary-500" /> Enter values yourself
      </p>
      <p className="mt-0.5 text-[11px] text-muted">No AI needed — type what you know (from the package, the menu…). Only calories are required.</p>

      <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="What was it? (e.g. סנדוויץ׳ טונה)" className={`${field} mt-3`} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold text-muted">
          Calories (kcal) *
          <input inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="450" className={`${field} mt-0.5`} aria-label="Calories" />
        </label>
        <label className="text-[11px] font-semibold text-muted">
          Protein (g)
          <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="25" className={`${field} mt-0.5`} aria-label="Protein" />
        </label>
        <label className="text-[11px] font-semibold text-muted">
          Carbs (g)
          <input inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="40" className={`${field} mt-0.5`} aria-label="Carbs" />
        </label>
        <label className="text-[11px] font-semibold text-muted">
          Fat (g)
          <input inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="15" className={`${field} mt-0.5`} aria-label="Fat" />
        </label>
        <label className="col-span-2 text-[11px] font-semibold text-muted">
          Weight (g) — optional
          <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="if you know it" className={`${field} mt-0.5`} aria-label="Weight" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(['breakfast', 'lunch', 'dinner', 'snacks'] as MealType[]).map((mt) => (
          <Chip key={mt} selected={mealType === mt} onClick={() => setMealType(mt)}>
            <span className="mr-1">{MEAL_LABELS[mt].emoji}</span>
            {MEAL_LABELS[mt].label}
          </Chip>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Button fullWidth className="mt-3" icon={<Check size={16} />} disabled={!calories.trim()} onClick={save}>
        Add to {MEAL_LABELS[mealType].label}
      </Button>
      <p className="mt-1.5 text-center text-[10px] text-faint">Saved to My foods too, so next time it&apos;s one tap.</p>
    </div>
  );
}
