import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAICoachData } from '@/hooks/useAICoachData';
import { analyzeDailyNutrition } from '@/utils/dailyAnalysis';
import { useAppStore } from '@/store/useAppStore';
import { findFoodById } from '@/data/foods';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { todayISO } from '@/utils/date';
import { suggestMealType } from '@/utils/mealTime';
import type { BalanceLabel } from '@/utils/dailyAnalysis';

const BALANCE_META: Record<BalanceLabel, { emoji: string; label: string; className: string }> = {
  good: { emoji: '🟢', label: 'Good', className: 'bg-primary-50 text-primary-700' },
  improve: { emoji: '🟡', label: 'Could improve', className: 'bg-amber-50 text-amber-700' },
  incomplete: { emoji: '🔵', label: 'Still incomplete', className: 'bg-blue-50 text-blue-700' },
};

export function DailyAnalysisView() {
  const { totals, targets, entries } = useAICoachData();
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const [ranAnalysis, setRanAnalysis] = useState(false);

  const analysis = useMemo(() => analyzeDailyNutrition(totals, targets, entries), [totals, targets, entries]);
  const meta = BALANCE_META[analysis.balance];

  function addSuggestion(foodId: string) {
    const food = findFoodById(foodId);
    if (!food) return;
    const mealType = suggestMealType();
    addDiaryEntry({
      date: todayISO(),
      mealType,
      foodId: food.id,
      foodName: food.name,
      foodImageEmoji: food.imageEmoji,
      quantityGrams: food.defaultServing.grams,
      servingLabel: food.defaultServing.label,
      nutrition: calculateNutrition(food.per100g, food.defaultServing.grams),
      dataQuality: food.dataQuality,
      source: 'ai_coach',
      naturalness: food.naturalness,
    });
    touchRecent({ refId: food.id, refType: 'food' });
  }

  if (!ranAnalysis) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl2 bg-surface p-8 text-center shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-2xl">📊</div>
        <div>
          <p className="font-semibold text-fg">See how your day is shaping up</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            A grounded, judgment-free look at today's calories, protein, carbs, and fat against your own targets.
          </p>
        </div>
        <Button size="lg" onClick={() => setRanAnalysis(true)}>
          🤖 How did I eat today?
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className={`flex items-center justify-between rounded-xl2 p-4 shadow-card ${meta.className}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Overall balance</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-base font-bold">
            {meta.emoji} {meta.label}
          </p>
        </div>
        {analysis.hasEnoughData && <span className="text-lg font-bold tabular-nums">{analysis.overallScore}/10</span>}
      </div>

      <p className="text-sm text-fg">{analysis.balanceText}</p>

      <AnalysisRow emoji="🔥" title="Calories" text={analysis.caloriesText} />
      <AnalysisRow emoji="🥩" title="Protein" text={analysis.proteinText}>
        {analysis.proteinSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold text-muted">Good options for you</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {analysis.proteinSuggestions.map((s) => (
                <button
                  key={s.foodId}
                  onClick={() => addSuggestion(s.foodId)}
                  className="rounded-xl bg-surface-alt p-2.5 text-left transition hover:bg-surface-alt2 active:scale-95"
                >
                  <p className="text-lg leading-none">{s.emoji ?? '🍽️'}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-fg">{s.name}</p>
                  <p className="text-[10px] text-muted">
                    {s.calories} kcal · {s.proteinG}g protein
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </AnalysisRow>
      <AnalysisRow emoji="🍚" title="Carbs" text={analysis.carbsText} />
      <AnalysisRow emoji="🥑" title="Fat" text={analysis.fatText} />

      {analysis.crossMacroText && (
        <div className="flex items-start gap-2 rounded-xl2 bg-ink p-3.5 text-sm text-white">
          <CircleDot size={14} className="mt-0.5 shrink-0 text-primary-300" />
          <span>{analysis.crossMacroText}</span>
        </div>
      )}

      <AnalysisRow emoji="🥦" title="Food quality / variety" text={analysis.varietyText} />

      <p className="flex items-start gap-1.5 text-xs text-muted">
        <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
        This is a supportive summary, not a grade — no food is off-limits, and there's no such thing as a failed day.
      </p>
    </div>
  );
}

function AnalysisRow({
  emoji,
  title,
  text,
  children,
}: {
  emoji: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  if (!text) return null;
  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <span>{emoji}</span>
        {title}
      </p>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}
