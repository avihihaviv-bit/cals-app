import { Link } from 'react-router-dom';
import type { MacroTargets } from '@/types';

/** A single clear statement of what the user needs today — separate from the consumed/progress framing below. */
export function DailyTargetsCard({ targets }: { targets: MacroTargets }) {
  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-fg">🎯 Your daily targets</p>
        <Link to="/nutrition" className="text-xs font-semibold text-primary-600 hover:underline">
          My Nutrition →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <TargetStat emoji="🔥" value={targets.calories} unit="kcal" label="Calories" />
        <TargetStat emoji="🥩" value={targets.proteinG} unit="g" label="Protein" />
        <TargetStat emoji="🍚" value={targets.carbsG} unit="g" label="Carbs" />
        <TargetStat emoji="🥑" value={targets.fatG} unit="g" label="Fat" />
      </div>
    </div>
  );
}

function TargetStat({ emoji, value, unit, label }: { emoji: string; value: number; unit: string; label: string }) {
  return (
    <div>
      <p className="text-lg">{emoji}</p>
      <p className="text-base font-bold tabular-nums text-fg">
        {value.toLocaleString()}
        <span className="text-xs font-medium text-muted">{unit}</span>
      </p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
