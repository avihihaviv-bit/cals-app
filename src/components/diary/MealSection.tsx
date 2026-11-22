import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Repeat2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { addDays } from '@/utils/date';
import { DiaryEntryRow } from './DiaryEntryRow';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { MEAL_LABELS } from '@/utils/mealTime';
import { weightedNaturalness } from '@/utils/naturalness';
import type { DiaryEntry, MealType, NutritionFacts } from '@/types';

interface MealSectionProps {
  mealType: MealType;
  entries: DiaryEntry[];
  totals: NutritionFacts;
  date: string;
}

export function MealSection({ mealType, entries, totals, date }: MealSectionProps) {
  const { label, emoji } = MEAL_LABELS[mealType];
  const allEntries = useAppStore((s) => s.diaryEntries);
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  // The same meal on the previous day — offered as a one-tap "repeat" when this meal is still empty.
  const yesterday = useMemo(
    () => allEntries.filter((e) => e.date === addDays(date, -1) && e.mealType === mealType),
    [allEntries, date, mealType],
  );
  const yesterdayKcal = Math.round(yesterday.reduce((sum, e) => sum + e.nutrition.calories, 0));

  function repeatYesterday() {
    for (const e of yesterday) {
      const { id: _id, loggedAt: _at, ...rest } = e;
      void _id;
      void _at;
      addDiaryEntry({ ...rest, date });
    }
  }

  const mealNaturalness = useMemo(
    () => weightedNaturalness(entries.map((e) => ({ naturalness: e.naturalness, grams: e.quantityGrams }))),
    [entries],
  );

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <span>{emoji}</span>
          {label}
        </h3>
        <div className="flex items-center gap-2">
          {mealNaturalness !== null && <NaturalnessBadge score={mealNaturalness} compact />}
          <span className="text-sm font-semibold tabular-nums text-muted">{Math.round(totals.calories)} kcal</span>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <DiaryEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
        {yesterday.length > 0 && (
          <button
            onClick={repeatYesterday}
            className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-3 text-left shadow-card transition hover:bg-surface-alt active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Repeat2 size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">Repeat yesterday&apos;s {label.toLowerCase()}</span>
              <span className="block truncate text-xs text-muted">
                {yesterday.map((e) => e.foodName).join(', ')} · {yesterdayKcal} kcal
              </span>
            </span>
          </button>
        )}
        <Link
          to={`/add?date=${date}&meal=${mealType}`}
          className="flex items-center justify-center gap-1.5 rounded-xl2 border-2 border-dashed border-default bg-surface/60 py-3.5 text-sm font-medium text-muted transition hover:border-primary-300 hover:text-primary-600"
        >
          <Plus size={15} />
          Add food to {label.toLowerCase()}
        </Link>
        </div>
      )}
    </section>
  );
}
