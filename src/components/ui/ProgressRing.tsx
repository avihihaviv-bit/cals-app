import { useEffect, useId, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

interface ProgressRingProps {
  consumed: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/** The home screen's calorie gauge: gradient arc, tick marks, and a knob that follows today's progress. */
export function ProgressRing({ consumed, goal, size = 230, strokeWidth = 18, label = 'kcal remaining' }: ProgressRingProps) {
  const id = useId().replace(/:/g, '');
  const remaining = goal - consumed;
  const isOver = remaining < 0;
  const target = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const percent = goal > 0 ? Math.round((consumed / goal) * 100) : 0;

  // Sweep in from zero on first paint, then animate to each new value.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = window.requestAnimationFrame(() => setPct(target));
    return () => window.cancelAnimationFrame(t);
  }, [target]);

  const c = size / 2;
  const radius = (size - strokeWidth) / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const angle = pct * 2 * Math.PI - Math.PI / 2;
  const knobX = c + radius * Math.cos(angle);
  const knobY = c + radius * Math.sin(angle);
  const tickRadius = radius + strokeWidth / 2 + 6;
  const tickCount = 48;
  const tickCirc = 2 * Math.PI * tickRadius;
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={`ok${id}`} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6EE7B7" />
            <stop offset="0.5" stopColor="#10B981" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
          <linearGradient id={`over${id}`} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FDBA74" />
            <stop offset="1" stopColor="#EF4444" />
          </linearGradient>
          <filter id={`knob${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.25" />
          </filter>
        </defs>
        {/* tick marks */}
        <circle
          cx={c}
          cy={c}
          r={tickRadius}
          fill="none"
          className="text-faint"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeDasharray={`1.5 ${tickCirc / tickCount - 1.5}`}
        />
        {/* track */}
        <circle cx={c} cy={c} r={radius} fill="none" className="text-surface-alt2" stroke="currentColor" strokeWidth={strokeWidth} />
        {/* progress */}
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          stroke={`url(#${isOver ? 'over' : 'ok'}${id})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: `stroke-dashoffset 1s ${ease}` }}
        />
        {/* knob at the end of the arc */}
        {pct > 0.005 && (
          <circle
            cx={knobX}
            cy={knobY}
            r={strokeWidth / 2 - 3}
            fill="#FFFFFF"
            filter={`url(#knob${id})`}
            style={{ transition: `cx 1s ${ease}, cy 1s ${ease}` }}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <AnimatedNumber value={Math.abs(Math.round(remaining))} className="text-[2.6rem] font-bold leading-none tabular-nums tracking-tight text-fg" />
        <span className="mt-1.5 text-sm font-medium text-muted">{isOver ? 'kcal over' : label}</span>
        <span
          className={`mt-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
            isOver ? 'bg-orange-500/15 text-orange-600' : 'bg-primary-500/15 text-primary-600'
          }`}
        >
          {percent}% of goal
        </span>
      </div>
    </div>
  );
}
