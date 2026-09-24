import { clamp } from '@/utils/format';

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  trackClassName?: string;
  className?: string;
}

export function ProgressBar({ value, max, color = '#10B981', trackClassName = 'bg-surface-alt2', className = '' }: ProgressBarProps) {
  const pct = max > 0 ? clamp(Math.round((value / max) * 100), 0, 100) : 0;
  const isOver = value > max;

  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${trackClassName} ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, backgroundColor: isOver ? '#EF4444' : color }}
      />
    </div>
  );
}
