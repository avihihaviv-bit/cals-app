import { useEffect, useState } from 'react';
import { ExternalLink, Minus, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ReliabilityBadge } from './ReliabilityBadge';
import { useAppStore } from '@/store/useAppStore';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { suggestMealType } from '@/utils/mealTime';
import type { MealType, Restaurant, RestaurantDish } from '@/types';

const MEALS: { value: MealType; label: string; emoji: string }[] = [
  { value: 'breakfast', label: 'בוקר', emoji: '🌅' },
  { value: 'lunch', label: 'צהריים', emoji: '☀️' },
  { value: 'dinner', label: 'ערב', emoji: '🌙' },
  { value: 'snacks', label: 'נשנוש', emoji: '🍎' },
];

const MEAL_NAME: Record<MealType, string> = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב', snacks: 'נשנושים' };

function formatServings(n: number): string {
  if (n === 0.5) return '½';
  if (Number.isInteger(n)) return String(n);
  return `${Math.floor(n)}½`;
}

/** Choose how much, which meal, and add a restaurant dish to the existing diary. */
export function DishSheet({
  dish,
  restaurant,
  date,
  defaultMeal,
  onClose,
  onAdded,
}: {
  dish: RestaurantDish | null;
  restaurant?: Restaurant;
  date: string;
  defaultMeal?: MealType;
  onClose: () => void;
  onAdded: (dish: RestaurantDish, meal: MealType) => void;
}) {
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(defaultMeal ?? suggestMealType());

  useEffect(() => {
    if (dish) {
      setServings(1);
      setMeal(defaultMeal ?? suggestMealType());
    }
  }, [dish?.id, defaultMeal]);

  if (!dish) return null;

  const grams = Math.round(dish.defaultServing.grams * servings);
  const n = calculateNutrition(dish.per100g, grams);
  const servingWord = dish.servingDescription || 'מנה';
  const restaurantName = restaurant?.nameHe ?? restaurant?.name;

  function add() {
    if (!dish) return;
    addDiaryEntry({
      date,
      mealType: meal,
      foodId: dish.id,
      foodName: restaurantName ? `${dish.nameHe ?? dish.name} (${restaurantName})` : (dish.nameHe ?? dish.name),
      foodImageEmoji: dish.imageEmoji,
      quantityGrams: grams,
      servingLabel: `${formatServings(servings)} × ${servingWord}`,
      nutrition: n,
      dataQuality: dish.dataQuality,
      source: 'restaurant',
      naturalness: dish.naturalness,
    });
    touchRecent({ refId: dish.id, refType: 'dish' });
    onAdded(dish, meal);
  }

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );

  return (
    <Modal open={!!dish} onClose={onClose} size="md">
      <div dir="rtl" className="text-right">
        <div className="flex items-start gap-3 pe-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-2xl">{dish.imageEmoji ?? '🍽️'}</div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight text-fg">{dish.nameHe ?? dish.name}</h2>
            <p className="text-xs text-muted">
              {restaurantName}
              {dish.aliases?.[0] ? ` · ${dish.aliases[0]}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <ReliabilityBadge reliability={dish.reliability} />
          {dish.reliability !== 'official' && <p className="text-xs font-semibold text-amber-800">ערכים משוערים – לא אומתו מול המסעדה</p>}
          {dish.basis && <p className="text-xs text-muted">{dish.basis}</p>}
          {dish.sourceUrl && (
            <a href={dish.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 underline">
              <ExternalLink size={11} /> המקור הרשמי
            </a>
          )}
        </div>

        {dish.description && <p className="mt-3 rounded-xl bg-surface-alt px-3 py-2 text-xs text-fg/80">{dish.description}</p>}

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-fg">כמות</p>
          <div className="flex items-center justify-between rounded-xl2 bg-surface-alt px-4 py-3">
            <button
              onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
              aria-label="פחות"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-card active:scale-90"
            >
              <Minus size={16} />
            </button>
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-fg">{formatServings(servings)}</p>
              <p className="text-xs text-muted">
                × {servingWord}
                {dish.weightKnown ? ` · ${grams} ${dish.defaultServing.label.includes('מ״ל') ? 'מ״ל' : 'גרם'}` : ''}
              </p>
            </div>
            <button
              onClick={() => setServings((s) => Math.min(20, s + 0.5))}
              aria-label="יותר"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-card active:scale-90"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl2 bg-surface p-3 shadow-card">
          <div className="flex items-center justify-between border-b border-subtle pb-2">
            <span className="text-sm font-semibold text-fg">קלוריות</span>
            <span className="text-xl font-bold tabular-nums text-fg">{Math.round(n.calories)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 py-2 text-center">
            <div>
              <p className="font-bold tabular-nums text-protein">{Math.round(n.proteinG)}g</p>
              <p className="text-[11px] text-muted">חלבון</p>
            </div>
            <div>
              <p className="font-bold tabular-nums text-carbs">{Math.round(n.carbsG)}g</p>
              <p className="text-[11px] text-muted">פחמימות</p>
            </div>
            <div>
              <p className="font-bold tabular-nums text-fat">{Math.round(n.fatG)}g</p>
              <p className="text-[11px] text-muted">שומן</p>
            </div>
          </div>
          {(n.saturatedFatG !== undefined || n.sugarG !== undefined || n.sodiumMg !== undefined) && (
            <div className="border-t border-subtle pt-1">
              {n.saturatedFatG !== undefined && row('שומן רווי', `${Math.round(n.saturatedFatG * 10) / 10}g`)}
              {n.sugarG !== undefined && row('סוכר', `${Math.round(n.sugarG * 10) / 10}g`)}
              {n.sodiumMg !== undefined && row('נתרן', `${Math.round(n.sodiumMg)}mg`)}
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-fg">ארוחה</p>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => (
              <Chip key={m.value} selected={meal === m.value} onClick={() => setMeal(m.value)}>
                <span className="me-1">{m.emoji}</span>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>

        <Button fullWidth size="lg" className="mt-5" onClick={add}>
          ➕ הוסף ל{MEAL_NAME[meal]}
        </Button>
      </div>
    </Modal>
  );
}
