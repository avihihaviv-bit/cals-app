import { AnimatedNumber } from './AnimatedNumber';

interface ProgressRingProps {
  consumed: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function ProgressRing({ consumed, goal, size = 220, strokeWidth = 16, label = 'kcal remaining' }: ProgressRingProps) {
  const remaining = goal - consumed;
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const isOver = remaining < 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EEF1F4"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isOver ? '#F97316' : '#10B981'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), stroke 0.3s' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <AnimatedNumber
          value={Math.abs(remaining)}
          className="text-4xl font-bold tabular-nums tracking-tight text-fg"
        />
        <span className="mt-1 text-sm font-medium text-muted">{isOver ? 'kcal over' : label}</span>
      </div>
    </div>
  );
}
