import { Sparkles } from 'lucide-react';
import { findFoodById } from '@/data/foods';
import { sumNutrition } from '@/utils/nutritionCalculator';
import { weightedNaturalness, cleanFoodPercentage } from '@/utils/naturalness';
import { scoreNutritionAgainstRemaining, reasonFor } from '@/services/RecommendationService';
import { useAICoachData } from '@/hooks/useAICoachData';
import type { ScannedFoodCandidate } from '@/types';

/** A one-liner, non-judgmental read on this specific meal's naturalness — distinct from the daily-summary phrasing in utils/naturalness.ts. */
function mealNaturalnessLine(score: number): string {
  if (score >= 80) return 'Mostly whole, minimally processed foods.';
  if (score >= 60) return 'Mostly whole foods, with some processed ones.';
  if (score >= 40) return 'A mix of whole and processed foods.';
  if (score >= 20) return 'Mostly processed foods, with some whole ones.';
  return 'Mostly processed foods.';
}

export function ScanCoachOpinion({ candidates }: { candidates: ScannedFoodCandidate[] }) {
  const { remaining } = useAICoachData();
  if (candidates.length === 0) return null;

  const totals = sumNutrition(candidates.map((c) => c.nutrition));
  const score = scoreNutritionAgainstRemaining(totals, remaining);
  const reason = reasonFor(totals, remaining, score);

  const naturalnessInputs = candidates.map((c) => ({ naturalness: findFoodById(c.foodId)?.naturalness, grams: c.estimatedGrams }));
  const naturalness = weightedNaturalness(naturalnessInputs);
  const cleanPct = cleanFoodPercentage(candidates.map((c) => ({ naturalness: findFoodById(c.foodId)?.naturalness, calories: c.nutrition.calories })));

  return (
    <div className="rounded-xl2 bg-ink p-4 text-white shadow-card">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
        <Sparkles size={12} /> What the Coach thinks
      </p>
      <p className="mt-1.5 text-sm font-medium leading-snug">{reason}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs">
        <div>
          <p className="text-white/50">Match with what's left today</p>
          <p className="mt-0.5 text-base font-bold tabular-nums">{score}%</p>
        </div>
        {naturalness != null && cleanPct != null && (
          <div>
            <p className="text-white/50">How clean this meal is</p>
            <p className="mt-0.5 text-base font-bold tabular-nums">{cleanPct}% clean</p>
          </div>
        )}
      </div>
      {naturalness != null && <p className="mt-2 text-[11px] text-white/60">{mealNaturalnessLine(naturalness)}</p>}
      <p className="mt-2 text-[10px] text-white/40">
        Based on your remaining targets and the naturalness score of these foods — a quick read, not a grade.
      </p>
    </div>
  );
}
