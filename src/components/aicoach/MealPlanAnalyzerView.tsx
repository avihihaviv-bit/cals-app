import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAICoachData } from '@/hooks/useAICoachData';
import { analyzeMealPlanText, applySwap } from '@/utils/mealPlanAnalyzer';
import type { MealPlanAnalysis } from '@/utils/mealPlanAnalyzer';
import { MEAL_LABELS } from '@/utils/mealTime';

const PLACEHOLDER = `Breakfast:
two eggs, toast, banana

Lunch:
chicken breast, rice, salad

Dinner:
salmon, sweet potato

Snacks:
greek yogurt`;

export function MealPlanAnalyzerView() {
  const { targets } = useAICoachData();
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<MealPlanAnalysis | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [applied, setApplied] = useState(false);

  function analyze() {
    const result = analyzeMealPlanText(text, targets);
    setAnalysis(result);
    setNotFound(!result);
    setApplied(false);
  }

  function apply() {
    if (!analysis?.suggestedSwap) return;
    setAnalysis(applySwap(analysis, analysis.suggestedSwap));
    setApplied(true);
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-xl2 bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-bold text-fg">Paste in your meal plan</p>
        <p className="mb-3 text-xs text-muted">
          Use headers like "Breakfast:", "Lunch:", "Dinner:", "Snacks:" followed by the foods for that meal.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          className="input w-full font-mono text-xs leading-relaxed"
        />
        <Button fullWidth className="mt-3" onClick={analyze} disabled={!text.trim()}>
          Analyze My Meal Plan
        </Button>
      </div>

      {notFound && (
        <p className="rounded-xl2 bg-surface p-4 text-center text-sm text-muted shadow-card">
          I couldn't recognize any foods in that text — try naming foods more directly, e.g. "chicken breast, rice, salad".
        </p>
      )}

      {analysis && (
        <>
          <div className="rounded-xl2 bg-surface p-4 shadow-card">
            <p className="mb-2 text-sm font-bold text-fg">Your Meal Plan</p>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <Stat emoji="🔥" value={`${Math.round(analysis.totals.calories)}`} />
              <Stat emoji="🥩" value={`${Math.round(analysis.totals.proteinG)}g`} />
              <Stat emoji="🍚" value={`${Math.round(analysis.totals.carbsG)}g`} />
              <Stat emoji="🥑" value={`${Math.round(analysis.totals.fatG)}g`} />
            </div>
            <div className="mt-3 space-y-1.5 border-t border-subtle pt-3">
              {analysis.meals.map((meal) => (
                <p key={meal.mealType} className="text-xs text-muted">
                  <b className="text-fg">
                    {MEAL_LABELS[meal.mealType].emoji} {MEAL_LABELS[meal.mealType].label}:
                  </b>{' '}
                  {meal.mentions.map((m) => m.food.name).join(', ')} · {Math.round(meal.totals.calories)} kcal
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-xl2 bg-surface p-4 shadow-card">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
              <Sparkles size={14} className="text-primary-500" />
              AI Opinion
            </p>
            {analysis.opinion.goodPoints.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold text-primary-700">👍 What's good</p>
                <ul className="space-y-1">
                  {analysis.opinion.goodPoints.map((p, i) => (
                    <li key={i} className="text-xs text-muted">
                      • {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.opinion.improvePoints.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-amber-700">💡 What could improve</p>
                <ul className="space-y-1">
                  {analysis.opinion.improvePoints.map((p, i) => (
                    <li key={i} className="text-xs text-muted">
                      • {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {analysis.suggestedSwap && !applied && (
            <div className="rounded-xl2 bg-surface p-4 shadow-card">
              <p className="mb-2 text-sm font-bold text-fg">✨ Improve My Plan</p>
              <div className="flex items-center justify-between rounded-xl bg-surface-alt p-3 text-xs">
                <div>
                  <p className="font-semibold text-muted">Current</p>
                  <p className="text-fg">{analysis.suggestedSwap.from.label}</p>
                  <p className="text-muted">
                    {Math.round(analysis.suggestedSwap.from.totals.calories)} kcal / {Math.round(analysis.suggestedSwap.from.totals.proteinG)}g protein
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary-700">Suggested</p>
                  <p className="text-fg">
                    {analysis.suggestedSwap.to.grams}g {analysis.suggestedSwap.to.name}
                  </p>
                  <p className="text-muted">
                    {Math.round(analysis.suggestedSwap.to.totals.calories)} kcal / {Math.round(analysis.suggestedSwap.to.totals.proteinG)}g protein
                  </p>
                </div>
              </div>
              <Button fullWidth size="sm" className="mt-3" onClick={apply}>
                Apply Change
              </Button>
            </div>
          )}
          {applied && <p className="text-center text-xs font-medium text-primary-700">✓ Applied — numbers above are updated.</p>}
        </>
      )}
    </div>
  );
}

function Stat({ emoji, value }: { emoji: string; value: string }) {
  return (
    <div>
      <p>{emoji}</p>
      <p className="font-bold tabular-nums text-fg">{value}</p>
    </div>
  );
}
