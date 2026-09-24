import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
        <Link
          to={`/add?date=${date}&meal=${mealType}`}
          className="flex items-center justify-center gap-1.5 rounded-xl2 border-2 border-dashed border-default bg-surface/60 py-3.5 text-sm font-medium text-muted transition hover:border-primary-300 hover:text-primary-600"
        >
          <Plus size={15} />
          Add food to {label.toLowerCase()}
        </Link>
      )}
    </section>
  );
}
