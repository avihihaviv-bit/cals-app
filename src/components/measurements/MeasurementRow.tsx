import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Minus, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { MEASUREMENT_LABELS } from '@/utils/measurementLabels';
import { computeTrend } from '@/utils/measurementTrend';
import { cmToIn } from '@/utils/units';
import type { MeasurementType } from '@/types';

export function MeasurementRow({ type, onClick }: { type: MeasurementType; onClick: () => void }) {
  const units = useAppStore((s) => s.units);
  const entries = useAppStore((s) => s.measurements);
  const { label, emoji } = MEASUREMENT_LABELS[type];

  const sorted = useMemo(() => entries.filter((e) => e.type === type).sort((a, b) => a.date.localeCompare(b.date)), [entries, type]);
  const latest = sorted[sorted.length - 1];
  const trend = useMemo(() => computeTrend(sorted.slice(-2).map((e) => ({ value: e.valueCm }))), [sorted]);

  const unitLabel = units === 'imperial' ? 'in' : 'cm';
  const display = latest ? (units === 'imperial' ? cmToIn(latest.valueCm) : Math.round(latest.valueCm * 10) / 10) : null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-3.5 text-left shadow-card transition hover:shadow-elevated active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-lg">{emoji}</div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">{label}</p>
        <p className="text-xs text-muted">{sorted.length > 0 ? `${sorted.length} entries` : 'No entries yet'}</p>
      </div>
      {display !== null && (
        <div className="flex items-center gap-1.5">
          {trend?.direction === 'up' && <TrendingUp size={14} className="text-amber-600" />}
          {trend?.direction === 'down' && <TrendingDown size={14} className="text-primary-600" />}
          {trend?.direction === 'stable' && <Minus size={14} className="text-muted" />}
          <span className="text-sm font-bold tabular-nums text-fg">
            {display}
            {unitLabel}
          </span>
        </div>
      )}
      <ChevronRight size={16} className="shrink-0 text-faint" />
    </button>
  );
}
