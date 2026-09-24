import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Plus, TrendingUp } from 'lucide-react';
import { ExplainPlanModal } from '@/components/dashboard/ExplainPlanModal';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { MacroCard } from '@/components/dashboard/MacroCard';
import { SmartSuggestions } from '@/components/dashboard/SmartSuggestions';
import { WaterTracker } from '@/components/dashboard/WaterTracker';
import { ActivityCard } from '@/components/dashboard/ActivityCard';
import { MealRecommendations } from '@/components/dashboard/MealRecommendations';
import { DailyAIInsight } from '@/components/dashboard/DailyAIInsight';
import { WeeklyCheckInCard } from '@/components/dashboard/WeeklyCheckInCard';
import { DailyTargetsCard } from '@/components/dashboard/DailyTargetsCard';
import { NaturalnessMixCard } from '@/components/dashboard/NaturalnessMixCard';
import { MealSection } from '@/components/diary/MealSection';
import { Button } from '@/components/ui/Button';
import { useTargets } from '@/hooks/useTargets';
import { useDiaryForDate, MEAL_TYPES } from '@/hooks/useDiary';
import { todayISO } from '@/utils/date';
import { formatKcal } from '@/utils/format';
import { greeting } from '@/utils/mealTime';

export function DashboardPage() {
  const date = todayISO();
  const { targets } = useTargets();
  const diary = useDiaryForDate(date);
  const [explainOpen, setExplainOpen] = useState(false);

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-7 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">
            {greeting()} 👋 · {todayLabel}
          </p>
          <h1 className="text-2xl font-bold text-fg">Today</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/stats"
            aria-label="Statistics"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-muted shadow-card transition hover:text-fg"
          >
            <TrendingUp size={17} />
          </Link>
          <Link
            to="/add"
            className="hidden items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600 active:scale-95 sm:flex"
          >
            <Plus size={16} />
            Add Food
          </Link>
        </div>
      </header>

      <WeeklyCheckInCard />

      <DailyTargetsCard targets={targets} />

      {/* Calorie summary */}
      <div className="flex flex-col items-center rounded-xl2 bg-surface p-6 shadow-card">
        <div className="mb-4 flex w-full items-center justify-between text-sm">
          <div className="text-center">
            <p className="font-bold tabular-nums text-fg">{formatKcal(diary.totals.calories)}</p>
            <p className="text-xs text-muted">🔥 consumed</p>
          </div>
          <div className="text-center">
            <p className="font-bold tabular-nums text-fg">{formatKcal(targets.calories)}</p>
            <p className="text-xs text-muted">🎯 goal</p>
          </div>
        </div>

        <ProgressRing consumed={diary.totals.calories} goal={targets.calories} />

        <button
          onClick={() => setExplainOpen(true)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-muted hover:text-primary-600"
        >
          <Info size={12} />
          Explain how this was calculated
        </button>

        <Link to="/add" className="mt-4 w-full sm:hidden">
          <Button fullWidth size="lg" icon={<Plus size={18} />}>
            Add Food
          </Button>
        </Link>
      </div>

      <ExplainPlanModal open={explainOpen} onClose={() => setExplainOpen(false)} />

      <SmartSuggestions totals={diary.totals} targets={targets} hasEntries={diary.entries.length > 0} />

      <DailyAIInsight />

      {/* Macros */}
      <div>
        <h2 className="mb-2.5 text-sm font-bold text-fg">Macros</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <MacroCard emoji="🥩" label="Protein" consumed={diary.totals.proteinG} goal={targets.proteinG} color="#F97316" />
          <MacroCard emoji="🍚" label="Carbs" consumed={diary.totals.carbsG} goal={targets.carbsG} color="#3B82F6" />
          <MacroCard emoji="🥑" label="Fat" consumed={diary.totals.fatG} goal={targets.fatG} color="#F59E0B" />
        </div>
      </div>

      <NaturalnessMixCard entries={diary.entries} />

      <ActivityCard />

      <WaterTracker />

      <MealRecommendations totals={diary.totals} targets={targets} date={date} />

      {/* Meals */}
      <div className="space-y-6">
        {MEAL_TYPES.map((mt) => (
          <MealSection key={mt} mealType={mt} entries={diary.byMeal[mt]} totals={diary.mealTotals[mt]} date={date} />
        ))}
      </div>
    </div>
  );
}
