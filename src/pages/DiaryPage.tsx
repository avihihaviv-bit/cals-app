import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MealSection } from '@/components/diary/MealSection';
import { useDiaryForDate, MEAL_TYPES } from '@/hooks/useDiary';
import { useTargets } from '@/hooks/useTargets';
import { addDays, formatDayLabel, isToday, todayISO } from '@/utils/date';
import { formatKcal } from '@/utils/format';

export function DiaryPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || todayISO();
  const diary = useDiaryForDate(date);
  const { targets } = useTargets();

  function goTo(newDate: string) {
    setParams({ date: newDate });
  }

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Diary</h1>
      </header>

      <div className="flex items-center justify-between rounded-xl2 bg-surface p-2 shadow-card">
        <button
          onClick={() => goTo(addDays(date, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt2 active:scale-90"
          aria-label="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-fg">{formatDayLabel(date)}</span>
        <button
          onClick={() => goTo(addDays(date, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt2 active:scale-90"
          aria-label="Next day"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!isToday(date) && (
        <button onClick={() => goTo(todayISO())} className="text-xs font-semibold text-primary-600 hover:underline">
          Jump to Today
        </button>
      )}

      <div className="grid grid-cols-4 gap-2 rounded-xl2 bg-surface p-4 shadow-card text-center">
        <SummaryStat label="Calories" value={formatKcal(diary.totals.calories)} sub={`/ ${formatKcal(targets.calories)}`} />
        <SummaryStat label="Protein" value={`${Math.round(diary.totals.proteinG)}g`} sub={`/ ${targets.proteinG}g`} />
        <SummaryStat label="Carbs" value={`${Math.round(diary.totals.carbsG)}g`} sub={`/ ${targets.carbsG}g`} />
        <SummaryStat label="Fat" value={`${Math.round(diary.totals.fatG)}g`} sub={`/ ${targets.fatG}g`} />
      </div>

      <div className="space-y-6">
        {MEAL_TYPES.map((mt) => (
          <MealSection key={mt} mealType={mt} entries={diary.byMeal[mt]} totals={diary.mealTotals[mt]} date={date} />
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-sm font-bold tabular-nums text-fg">{value}</p>
      <p className="text-[10px] text-muted">{sub}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}
