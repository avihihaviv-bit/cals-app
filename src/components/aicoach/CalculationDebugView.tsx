import { useAppStore } from '@/store/useAppStore';
import { CompleteProfilePrompt } from '@/components/ai/CompleteProfilePrompt';
import {
  ACTIVITY_MULTIPLIERS,
  calculateBMR,
  calculateCalorieTarget,
  calculateMacroTargets,
  calculateTargetRanges,
  recommendedProteinRange,
} from '@/utils/nutritionCalculator';

/**
 * A developer/debug view of the full calculation pipeline — every number a
 * user's daily targets are built from, laid out step by step so a
 * discrepancy is easy to spot. Reads directly from the same engine
 * (utils/nutritionCalculator.ts) every other screen uses — there is no
 * separate/parallel calculation path here.
 */
export function CalculationDebugView() {
  const profile = useAppStore((s) => s.profile);
  if (!profile) return <CompleteProfilePrompt />;

  const bmr = calculateBMR(profile);
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const calorieResult = calculateCalorieTarget(profile);
  const macros = calculateMacroTargets(profile, calorieResult.targetCalories);
  const ranges = calculateTargetRanges(profile);
  const proteinRange = recommendedProteinRange(profile);

  const reconstructedCalories = macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
  const calorieDifference = Math.abs(macros.calories - reconstructedCalories);
  const validationOk = calorieDifference <= 5;

  return (
    <div className="space-y-4 pb-4 font-mono text-xs">
      <Section title="Input">
        <Row label="Age" value={`${profile.age}`} />
        <Row label="Sex" value={profile.sex} />
        <Row label="Weight" value={`${profile.weightKg} kg`} />
        <Row label="Height" value={`${profile.heightCm} cm`} />
        <Row label="Activity" value={profile.activityLevel} />
        <Row label="Training days/week" value={`${profile.trainingDaysPerWeek}`} />
        <Row label="Goal" value={profile.goal} />
        <Row label="Is minor" value={profile.isMinor ? 'true (teen guardrails active)' : 'false'} />
        {profile.customProteinTargetG != null && <Row label="Custom protein override" value={`${profile.customProteinTargetG}g`} />}
      </Section>

      <Section title="Calculation">
        <Row label="BMR (Harris-Benedict)" value={`${bmr} kcal`} />
        <Row label="Activity multiplier" value={`×${multiplier}`} />
        <Row label="Estimated TDEE" value={`${calorieResult.tdee} kcal`} formula="BMR × activity multiplier" />
        <Row label="Calorie target" value={`${calorieResult.targetCalories} kcal`} formula={`TDEE × (1 + goal adjustment${calorieResult.wasCapped ? ', capped by safety floor/ceiling' : ''})`} />
        <Row label="Protein range" value={`${proteinRange.minG}–${proteinRange.maxG}g`} formula="weight × goal-based factor, ±15%" />
        <Row label="Protein target" value={`${macros.proteinG}g`} formula={profile.customProteinTargetG != null ? 'custom override, clamped to safe ceiling' : 'midpoint of protein range'} />
        <Row label="Fat target" value={`${macros.fatG}g`} formula={`weight × ${profile.isMinor ? '1.0' : '1.2'} g/kg`} />
        <Row label="Fat range" value={`${ranges.fat.min}–${ranges.fat.max}g`} />
        <Row label="Carb target" value={`${macros.carbsG}g`} formula="(calories − protein cal − fat cal) ÷ 4, reconciliation-adjusted" />
      </Section>

      <Section title="Validation">
        <Row label="Protein × 4" value={`${macros.proteinG} × 4 = ${macros.proteinG * 4} kcal`} />
        <Row label="Carbs × 4" value={`${macros.carbsG} × 4 = ${macros.carbsG * 4} kcal`} />
        <Row label="Fat × 9" value={`${macros.fatG} × 9 = ${macros.fatG * 9} kcal`} />
        <div className="mt-1 flex items-center justify-between border-t border-subtle pt-1.5">
          <span className="text-muted">= Calculated calories</span>
          <span className="font-bold text-fg">{reconstructedCalories} kcal</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted">vs. calorie target</span>
          <span className="font-bold text-fg">{macros.calories} kcal</span>
        </div>
        <div className={`mt-2 rounded-lg px-3 py-2 ${validationOk ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'}`}>
          {validationOk ? '✓ Reconciled' : '⚠ Difference'}: {calorieDifference} kcal
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <p className="mb-2 text-sm font-sans font-bold text-fg">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, formula }: { label: string; value: string; formula?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-muted">{label}</span>
        <span className="font-bold text-fg">{value}</span>
      </div>
      {formula && <p className="text-[10px] text-faint">{formula}</p>}
    </div>
  );
}
