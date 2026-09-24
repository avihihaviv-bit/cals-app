import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChefHat, RefreshCw, Shuffle, Trash2, X } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { useAICoachData } from '@/hooks/useAICoachData';
import { useAppStore } from '@/store/useAppStore';
import { buildMealPlan, checkPlan, dayTotals, regenerateSlot, slotTotals } from '@/utils/mealPlanBuilder';
import type { PlanCheckRow } from '@/utils/mealPlanBuilder';
import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { addDays, formatDayLabel, todayISO } from '@/utils/date';
import { MEAL_LABELS } from '@/utils/mealTime';
import { generateId } from '@/utils/id';
import { ManualSlotEditor } from './ManualSlotEditor';
import type { MealPlanDay, MealPlanSlot, MealType } from '@/types';

type DaysOption = 1 | 3 | 7;
type MealsOption = 3 | 4 | 5;
type PlanOrigin = 'ai' | 'user';

function mealTypesFor(mealsPerDay: MealsOption): MealType[] {
  if (mealsPerDay === 3) return ['breakfast', 'lunch', 'dinner'];
  if (mealsPerDay === 4) return ['breakfast', 'lunch', 'dinner', 'snacks'];
  return ['breakfast', 'snacks', 'lunch', 'snacks', 'dinner'];
}

export function MealPlanBuilderView() {
  const { targets, profile } = useAICoachData();
  const navigate = useNavigate();
  const saveMealPlan = useAppStore((s) => s.saveMealPlan);
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);

  const [origin, setOrigin] = useState<PlanOrigin>('ai');
  const [days, setDays] = useState<DaysOption>(3);
  const [mealsPerDay, setMealsPerDay] = useState<MealsOption>(3);
  const [plan, setPlan] = useState<MealPlanDay[] | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [addedSlotIds, setAddedSlotIds] = useState<Set<string>>(new Set());
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const check = useMemo<PlanCheckRow[]>(() => (plan ? checkPlan(plan, targets) : []), [plan, targets]);

  function generate() {
    setPlan(buildMealPlan({ days, mealsPerDay, dayTargets: targets, profile }));
    setSavedId(null);
    setAddedSlotIds(new Set());
  }

  function startMyOwnPlan() {
    const mealTypes = mealTypesFor(mealsPerDay);
    const start = todayISO();
    const newPlan: MealPlanDay[] = Array.from({ length: days }, (_, d) => ({
      dayIndex: d,
      date: addDays(start, d),
      slots: mealTypes.map((mealType) => ({
        id: generateId('slot'),
        mealType,
        name: '',
        emoji: MEAL_LABELS[mealType].emoji,
        items: [],
      })),
    }));
    setPlan(newPlan);
    setSavedId(null);
    setAddedSlotIds(new Set());
  }

  function switchOrigin(next: PlanOrigin) {
    setOrigin(next);
    setPlan(null);
    setSavedId(null);
    setEditingSlotId(null);
  }

  function addFoodToSlot(dayIndex: number, slotId: string, foodId: string, grams: number) {
    const food = findFoodById(foodId);
    if (!food) return;
    setPlan((prev) =>
      prev
        ? prev.map((day) =>
            day.dayIndex === dayIndex
              ? {
                  ...day,
                  slots: day.slots.map((s) =>
                    s.id === slotId
                      ? {
                          ...s,
                          items: [...s.items, { foodId, grams }],
                          name: [...s.items.map((i) => findFoodById(i.foodId)?.name ?? ''), food.name].filter(Boolean).join(', '),
                        }
                      : s,
                  ),
                }
              : day,
          )
        : prev,
    );
  }

  function removeItemFromSlot(dayIndex: number, slotId: string, itemIndex: number) {
    setPlan((prev) =>
      prev
        ? prev.map((day) =>
            day.dayIndex === dayIndex
              ? {
                  ...day,
                  slots: day.slots.map((s) => {
                    if (s.id !== slotId) return s;
                    const items = s.items.filter((_, i) => i !== itemIndex);
                    return { ...s, items, name: items.map((i) => findFoodById(i.foodId)?.name ?? '').filter(Boolean).join(', ') };
                  }),
                }
              : day,
          )
        : prev,
    );
  }

  function slotCountOfType(day: MealPlanDay, mealType: MealType): number {
    return day.slots.filter((s) => s.mealType === mealType).length;
  }

  function updateSlot(dayIndex: number, slotId: string, next: MealPlanSlot | null) {
    if (!next) return;
    setPlan((prev) =>
      prev
        ? prev.map((day) => (day.dayIndex === dayIndex ? { ...day, slots: day.slots.map((s) => (s.id === slotId ? next : s)) } : day))
        : prev,
    );
  }

  function regenerate(day: MealPlanDay, slot: MealPlanSlot, bias?: 'protein' | 'cheaper' | 'faster' | 'different') {
    const next = regenerateSlot(slot.mealType, targets, slotCountOfType(day, slot.mealType), profile, bias);
    updateSlot(day.dayIndex, slot.id, next ? { ...next, id: slot.id } : null);
  }

  function deleteSlot(dayIndex: number, slotId: string) {
    setPlan((prev) => (prev ? prev.map((day) => (day.dayIndex === dayIndex ? { ...day, slots: day.slots.filter((s) => s.id !== slotId) } : day)) : prev));
  }

  function duplicateDay(day: MealPlanDay) {
    if (!plan) return;
    const clone: MealPlanDay = { ...day, dayIndex: plan.length, date: day.date, slots: day.slots.map((s) => ({ ...s, id: `${s.id}_${plan.length}` })) };
    setPlan([...plan, clone]);
  }

  function addSlotToDiary(day: MealPlanDay, slot: MealPlanSlot) {
    for (const item of slot.items) {
      const food = findFoodById(item.foodId);
      if (!food) continue;
      addDiaryEntry({
        date: day.date,
        mealType: slot.mealType,
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
    setAddedSlotIds((prev) => new Set(prev).add(slot.id));
  }

  function save() {
    if (!plan) return;
    const id = saveMealPlan({
      name: `${origin === 'ai' ? 'AI' : 'My'} Meal Plan — ${new Date().toLocaleDateString()}`,
      days: plan,
      origin,
    });
    setSavedId(id);
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex gap-2">
        <Chip selected={origin === 'ai'} onClick={() => switchOrigin('ai')}>
          ✨ AI Plan
        </Chip>
        <Chip selected={origin === 'user'} onClick={() => switchOrigin('user')}>
          📋 My Plan
        </Chip>
      </div>

      <div className="rounded-xl2 bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm font-bold text-fg">{origin === 'ai' ? 'Build My Meal Plan' : 'Plan your own meals'}</p>

        <p className="mb-1.5 text-xs font-semibold text-fg">Days</p>
        <div className="mb-4 flex gap-2">
          {([1, 3, 7] as DaysOption[]).map((d) => (
            <Chip key={d} selected={days === d} onClick={() => setDays(d)}>
              {d === 1 ? 'Today' : `${d} Days`}
            </Chip>
          ))}
        </div>

        <p className="mb-1.5 text-xs font-semibold text-fg">Meals per day</p>
        <div className="mb-4 flex gap-2">
          {([3, 4, 5] as MealsOption[]).map((m) => (
            <Chip key={m} selected={mealsPerDay === m} onClick={() => setMealsPerDay(m)}>
              {m}
            </Chip>
          ))}
        </div>

        {origin === 'ai' ? (
          <>
            <p className="mb-4 text-[11px] text-muted">
              Uses your daily targets ({targets.calories.toLocaleString()} kcal, {targets.proteinG}g protein) and your profile's
              preferences. Every meal can be replaced or regenerated afterward.
            </p>
            <Button fullWidth size="lg" onClick={generate}>
              🗓️ Build My Meal Plan
            </Button>
          </>
        ) : (
          <>
            <p className="mb-4 text-[11px] text-muted">
              You pick every meal yourself — the AI won't add or swap anything here. We'll still show you how it compares to
              your targets.
            </p>
            <Button fullWidth size="lg" onClick={startMyOwnPlan}>
              📋 Start My Plan
            </Button>
          </>
        )}
      </div>

      {plan && (
        <>
          {check.length > 0 && (
            <div className="rounded-xl2 bg-surface p-4 shadow-card">
              <p className="mb-2 text-sm font-bold text-fg">Plan Review — Target vs Plan</p>
              <ul className="space-y-1.5">
                {check.map((row) => (
                  <li key={row.label} className="flex items-center gap-2 text-xs">
                    {row.ok ? <Check size={14} className="text-primary-500" /> : <X size={14} className="text-amber-500" />}
                    <span className="text-fg">{row.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                This just shows the gap between your plan and your targets — it's not a grade, and no plan needs to be perfect.
              </p>
            </div>
          )}

          {plan.map((day) => (
            <div key={day.dayIndex} className="rounded-xl2 bg-surface p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-fg">{formatDayLabel(day.date)}</p>
                  <p className="text-[11px] text-muted">
                    {Math.round(dayTotals(day).calories)} kcal · {Math.round(dayTotals(day).proteinG)}g protein
                  </p>
                </div>
                <button
                  onClick={() => duplicateDay(day)}
                  className="rounded-lg bg-surface-alt px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:bg-surface-alt2"
                >
                  Duplicate day
                </button>
              </div>

              <div className="space-y-2.5">
                {day.slots.map((slot) => {
                  const totals = slotTotals(slot);
                  const added = addedSlotIds.has(slot.id);
                  const isEmpty = origin === 'user' && slot.items.length === 0;
                  return (
                    <div key={slot.id} className="rounded-xl bg-surface-alt p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-muted">
                            {MEAL_LABELS[slot.mealType].emoji} {MEAL_LABELS[slot.mealType].label}
                          </p>
                          <p className="text-sm font-semibold text-fg">
                            {isEmpty ? <span className="italic text-faint">No foods added yet</span> : `${slot.emoji} ${slot.name}`}
                          </p>
                          {!isEmpty && (
                            <p className="text-[11px] text-muted">
                              {Math.round(totals.calories)} kcal · {Math.round(totals.proteinG)}g protein · {Math.round(totals.carbsG)}g carbs ·{' '}
                              {Math.round(totals.fatG)}g fat
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteSlot(day.dayIndex, slot.id)}
                          aria-label="Remove meal"
                          className="shrink-0 text-faint hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {origin === 'ai' ? (
                        <>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <IconAction icon={<RefreshCw size={11} />} label="Replace" onClick={() => regenerate(day, slot)} />
                            <IconAction icon={<Shuffle size={11} />} label="Generate Alternative" onClick={() => regenerate(day, slot, 'different')} />
                            <IconAction label="🥩 More Protein" onClick={() => regenerate(day, slot, 'protein')} />
                            <IconAction label="💰 Cheaper" onClick={() => regenerate(day, slot, 'cheaper')} />
                            <IconAction label="⚡ Faster" onClick={() => regenerate(day, slot, 'faster')} />
                            <IconAction
                              icon={<ChefHat size={11} />}
                              label="Create Recipe"
                              onClick={() => navigate('/coach?view=recipe')}
                            />
                          </div>

                          <button
                            onClick={() => addSlotToDiary(day, slot)}
                            disabled={added}
                            className={`mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold transition ${
                              added ? 'bg-primary-500 text-white' : 'bg-surface text-primary-700 shadow-sm hover:bg-primary-50'
                            }`}
                          >
                            {added ? 'Added ✓' : 'Add to Diary'}
                          </button>
                        </>
                      ) : (
                        <>
                          {slot.items.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {slot.items.map((item, i) => {
                                const food = findFoodById(item.foodId);
                                return (
                                  <li key={`${item.foodId}_${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-fg">
                                    <span>
                                      {food?.imageEmoji} {food?.name} · {item.grams}g
                                    </span>
                                    <button onClick={() => removeItemFromSlot(day.dayIndex, slot.id, i)} aria-label="Remove item" className="text-faint hover:text-red-500">
                                      <X size={12} />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {editingSlotId === slot.id ? (
                            <ManualSlotEditor
                              onAdd={(foodId, grams) => addFoodToSlot(day.dayIndex, slot.id, foodId, grams)}
                              onClose={() => setEditingSlotId(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setEditingSlotId(slot.id)}
                              className="mt-2 w-full rounded-lg border border-dashed border-default py-1.5 text-[11px] font-semibold text-muted hover:border-primary-300 hover:text-primary-700"
                            >
                              + Add food
                            </button>
                          )}

                          {slot.items.length > 0 && (
                            <button
                              onClick={() => addSlotToDiary(day, slot)}
                              disabled={added}
                              className={`mt-2 w-full rounded-lg py-1.5 text-[11px] font-semibold transition ${
                                added ? 'bg-primary-500 text-white' : 'bg-surface text-primary-700 shadow-sm hover:bg-primary-50'
                              }`}
                            >
                              {added ? 'Added ✓' : 'Add to Diary'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <Button fullWidth onClick={save} disabled={!!savedId}>
            {savedId ? '❤️ Saved' : '❤️ Save My Plan'}
          </Button>
        </>
      )}
    </div>
  );
}

function IconAction({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-default bg-surface px-2.5 py-1 text-[10px] font-medium text-fg transition hover:border-primary-300 hover:text-primary-700"
    >
      {icon}
      {label}
    </button>
  );
}
