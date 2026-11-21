import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { foodRecognitionService } from '@/services/FoodRecognitionService';
import { findFoodById } from '@/data/foods';
import { MEAL_LABELS, suggestMealType } from '@/utils/mealTime';
import { sumNutrition } from '@/utils/nutritionCalculator';
import { useAppStore } from '@/store/useAppStore';
import { todayISO } from '@/utils/date';
import type { MealType, ScanResult, ScannedFoodCandidate } from '@/types';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

function amountLabel(c: ScannedFoodCandidate): string {
  if (c.unitCount && c.unitLabel) return `${c.unitCount} ${c.unitLabel} (~${c.estimatedGrams}g)`;
  return c.estimatedGramsRange ? `~${c.estimatedGrams}g (est.)` : `${c.estimatedGrams}g`;
}

/** Looks up what the user said they ate (any food, any language) and lets them add it to today's diary in one tap. */
export function AIFoodLookupCard({ description, onNavigate }: { description: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [items, setItems] = useState<ScannedFoodCandidate[]>([]);
  const [mealType, setMealType] = useState<MealType>(suggestMealType());
  const [added, setAdded] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    foodRecognitionService
      .recognizeText(description)
      .then((r) => {
        setResult(r);
        setItems(r.candidates);
      })
      .catch((err) =>
        setResult({ id: 'err', candidates: [], createdAt: '', recognitionAvailable: false, unavailableReason: String(err) }),
      );
  }, [description]);

  function openInScanner() {
    onNavigate?.();
    navigate(`/add/scan?text=${encodeURIComponent(description)}`);
  }

  function addAll() {
    const date = todayISO();
    for (const c of items) {
      addDiaryEntry({
        date,
        mealType,
        foodId: c.foodId,
        foodName: c.name,
        foodImageEmoji: c.imageEmoji ?? findFoodById(c.foodId)?.imageEmoji,
        quantityGrams: c.estimatedGrams,
        servingLabel: amountLabel(c),
        nutrition: c.nutrition,
        dataQuality: c.matchedLocalFood ? (findFoodById(c.foodId)?.dataQuality ?? 'ai_estimate') : 'ai_estimate',
        source: 'ai_coach',
        aiConfidence: c.confidence,
        naturalness: findFoodById(c.foodId)?.naturalness,
      });
      touchRecent({ refId: c.foodId, refType: 'food' });
    }
    setAdded(true);
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-surface p-3 text-xs text-muted shadow-card">
        <Loader2 size={14} className="animate-spin text-primary-600" /> Looking up nutrition…
      </div>
    );
  }

  if (!result.recognitionAvailable) {
    return (
      <div className="space-y-2 rounded-xl bg-surface p-3 shadow-card">
        <p className="text-xs text-red-600">{result.unavailableReason}</p>
        {result.needsApiKey && (
          <Button size="sm" variant="secondary" onClick={() => { onNavigate?.(); navigate('/settings'); }}>
            Open Settings
          </Button>
        )}
      </div>
    );
  }

  if (added) {
    return (
      <p className="rounded-xl bg-primary-50 p-3 text-sm font-medium text-primary-700">
        Added to {MEAL_LABELS[mealType].label.toLowerCase()} ✓
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="rounded-xl bg-surface-alt p-3 text-xs text-muted">Nothing left to add.</p>;
  }

  const total = sumNutrition(items.map((c) => c.nutrition));

  return (
    <div className="space-y-2.5 rounded-xl bg-surface p-3 shadow-card">
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">
                {c.imageEmoji ? `${c.imageEmoji} ` : ''}
                {c.name}
              </p>
              <p className="text-[11px] text-muted">
                {amountLabel(c)} · {Math.round(c.nutrition.calories)} kcal · P {Math.round(c.nutrition.proteinG)}g · C{' '}
                {Math.round(c.nutrition.carbsG)}g · F {Math.round(c.nutrition.fatG)}g
              </p>
            </div>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== c.id))}
              aria-label={`Remove ${c.name}`}
              className="mt-0.5 shrink-0 rounded-full p-1 text-faint transition hover:bg-surface-alt2 hover:text-fg"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <p className="border-t border-subtle pt-2 text-xs font-semibold text-fg">
          Total: {Math.round(total.calories)} kcal · {Math.round(total.proteinG)}g protein
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {MEAL_ORDER.map((m) => (
          <Chip key={m} selected={mealType === m} onClick={() => setMealType(m)}>
            {MEAL_LABELS[m].emoji} {MEAL_LABELS[m].label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={addAll}>
          Add to diary
        </Button>
        <Button size="sm" variant="ghost" onClick={openInScanner}>
          Adjust amounts
        </Button>
      </div>
      <p className="text-[10px] text-faint">AI estimate — values are approximate.</p>
    </div>
  );
}
