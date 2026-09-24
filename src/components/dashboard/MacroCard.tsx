import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatGrams } from '@/utils/format';

interface MacroCardProps {
  emoji: string;
  label: string;
  consumed: number;
  goal: number;
  color: string;
}

export function MacroCard({ emoji, label, consumed, goal, color }: MacroCardProps) {
  return (
    <div className="rounded-xl2 bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <span>{emoji}</span>
        {label}
      </div>
      <p className="mt-1.5 text-base font-bold tabular-nums text-fg">
        {formatGrams(consumed)} <span className="text-xs font-medium text-muted">/ {formatGrams(goal)}</span>
      </p>
      <ProgressBar value={consumed} max={goal} color={color} className="mt-2" />
    </div>
  );
}
