import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}

export function QuantityStepper({ value, onChange, step = 10, min = 0, max = 5000, suffix = 'g' }: QuantityStepperProps) {
  const clampVal = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clampVal(value - step))}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt2 text-fg transition active:scale-90 hover:bg-surface-alt3"
      >
        <Minus size={18} />
      </button>
      <div className="flex min-w-[84px] items-baseline justify-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(clampVal(Number(e.target.value) || 0))}
          className="w-16 bg-transparent text-center text-xl font-semibold tabular-nums text-fg outline-none"
        />
        <span className="text-sm text-muted">{suffix}</span>
      </div>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clampVal(value + step))}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white transition active:scale-90 hover:bg-primary-600"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
