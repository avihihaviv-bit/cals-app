import { useEffect, useMemo, useState } from 'react';
import { Heart, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { DataQualityBadge } from '@/components/ui/DataQualityBadge';
import { NaturalnessSection } from '@/components/food/NaturalnessSection';
import { useAppStore } from '@/store/useAppStore';
import { nutritionService } from '@/services/NutritionService';
import { resolveFoodRef } from '@/utils/resolveFoodRef';
import { MEAL_LABELS, suggestMealType } from '@/utils/mealTime';
import { formatGrams } from '@/utils/format';
import type { DiaryEntry, FoodRef, MealType } from '@/types';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

interface FoodDetailModalProps {
  open: boolean;
  onClose: () => void;
  /** Add mode: a reference to a food/dish not yet logged. */
  addRef?: FoodRef;
  addDate?: string;
  addSource?: DiaryEntry['source'];
  /** Edit mode: an existing diary entry. */
  entry?: DiaryEntry;
  onAdded?: () => void;
}

export function FoodDetailModal({ open, onClose, addRef, addDate, addSource = 'search', entry, onAdded }: FoodDetailModalProps) {
  const isEdit = !!entry;
  const ref: FoodRef | undefined = entry ? { refId: entry.foodId, refType: entry.source === 'restaurant' ? 'dish' : 'food' } : addRef;
  const resolved = useMemo(() => (ref ? resolveFoodRef(ref) : undefined), [ref?.refId, ref?.refType]);

  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const updateDiaryEntry = useAppStore((s) => s.updateDiaryEntry);
  const removeDiaryEntry = useAppStore((s) => s.removeDiaryEntry);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const isFavoriteFn = useAppStore((s) => s.isFavorite);
  const touchRecent = useAppStore((s) => s.touchRecent);

  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>('breakfast');

  useEffect(() => {
    if (!open || !resolved) return;
    setGrams(entry ? entry.quantityGrams : resolved.defaultServing.grams);
    setMealType(entry ? entry.mealType : suggestMealType());
  }, [open, resolved?.id, entry?.id]);

  if (!resolved) return null;

  const nutrition = nutritionService.nutritionForQuantity(resolved.per100g, grams);
  const favorite = isFavoriteFn({ refId: resolved.id, refType: resolved.refType });
  const isRestaurantEstimate = resolved.refType === 'dish';

  function matchingOptionGrams(g: number) {
    return resolved!.servingOptions.find((o) => o.grams === g);
  }

  function handleAdd() {
    if (!addDate || !resolved) return;
    addDiaryEntry({
      date: addDate,
      mealType,
      foodId: resolved.id,
      foodName: resolved.name,
      foodImageEmoji: resolved.emoji,
      quantityGrams: grams,
      servingLabel: matchingOptionGrams(grams)?.label ?? formatGrams(grams),
      nutrition,
      dataQuality: resolved.dataQuality,
      source: addSource,
      naturalness: resolved.naturalness,
    });
    touchRecent({ refId: resolved.id, refType: resolved.refType });
    onAdded?.();
    onClose();
  }

  function handleSaveEdit() {
    if (!entry || !resolved) return;
    updateDiaryEntry(entry.id, {
      mealType,
      quantityGrams: grams,
      servingLabel: matchingOptionGrams(grams)?.label ?? formatGrams(grams),
      nutrition,
      naturalness: resolved.naturalness,
    });
    onClose();
  }

  function handleDelete() {
    if (!entry) return;
    removeDiaryEntry(entry.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-2xl">{resolved.emoji}</div>
          <div>
            <h2 className="text-lg font-bold leading-tight text-fg">{resolved.name}</h2>
            {resolved.subtitle && <p className="text-xs text-muted">{resolved.subtitle}</p>}
          </div>
        </div>
        <button
          onClick={() => toggleFavorite({ refId: resolved.id, refType: resolved.refType })}
          aria-label="Toggle favorite"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-alt2 active:scale-90"
        >
          <Heart size={20} className={favorite ? 'fill-red-500 text-red-500' : 'text-faint'} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DataQualityBadge quality={resolved.dataQuality} />
        {isRestaurantEstimate && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Info size={12} /> Nutrition estimated for a typical serving
          </span>
        )}
      </div>

      {/* Meal selector */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-fg">Meal</p>
        <div className="flex flex-wrap gap-2">
          {MEAL_ORDER.map((mt) => (
            <Chip key={mt} selected={mealType === mt} onClick={() => setMealType(mt)}>
              <span className="mr-1">{MEAL_LABELS[mt].emoji}</span>
              {MEAL_LABELS[mt].label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Serving options */}
      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-fg">Serving</p>
        <div className="flex flex-wrap gap-2">
          {resolved.servingOptions.map((opt) => (
            <Chip key={opt.label} selected={grams === opt.grams} onClick={() => setGrams(opt.grams)}>
              {opt.label}
            </Chip>
          ))}
          <Chip selected={!matchingOptionGrams(grams)} onClick={() => {}}>
            Custom
          </Chip>
        </div>
      </div>

      {/* Custom portion stepper */}
      <div className="mt-4 flex items-center justify-center rounded-xl2 bg-surface-alt py-4">
        <QuantityStepper value={grams} onChange={setGrams} step={10} min={5} />
      </div>

      {/* Nutrition breakdown */}
      <div className="mt-5 rounded-xl2 bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <span className="text-sm font-semibold text-fg">Calories</span>
          <span className="text-lg font-bold tabular-nums text-fg">{Math.round(nutrition.calories)}</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-subtle">
          <MacroCell label="Protein" value={nutrition.proteinG} color="text-protein" />
          <MacroCell label="Carbs" value={nutrition.carbsG} color="text-carbs" />
          <MacroCell label="Fat" value={nutrition.fatG} color="text-fat" />
        </div>
        {(nutrition.fiberG !== undefined || nutrition.sugarG !== undefined || nutrition.sodiumMg !== undefined) && (
          <div className="grid grid-cols-3 divide-x divide-subtle border-t border-subtle text-xs text-muted">
            {nutrition.fiberG !== undefined && <SmallCell label="Fiber" value={`${formatGrams(nutrition.fiberG)}`} />}
            {nutrition.sugarG !== undefined && <SmallCell label="Sugar" value={`${formatGrams(nutrition.sugarG)}`} />}
            {nutrition.sodiumMg !== undefined && <SmallCell label="Sodium" value={`${Math.round(nutrition.sodiumMg)}mg`} />}
          </div>
        )}
      </div>

      <div className="mt-3">
        <NaturalnessSection naturalness={resolved.naturalness} />
      </div>

      <div className="mt-5 flex gap-2.5">
        {isEdit ? (
          <>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
            <Button fullWidth onClick={handleSaveEdit}>
              Save changes
            </Button>
          </>
        ) : (
          <Button fullWidth size="lg" onClick={handleAdd}>
            Add to {MEAL_LABELS[mealType].label}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function MacroCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className={`text-base font-bold tabular-nums ${color}`}>{formatGrams(value)}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function SmallCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 text-center">
      <p className="font-semibold text-fg">{value}</p>
      <p>{label}</p>
    </div>
  );
}
