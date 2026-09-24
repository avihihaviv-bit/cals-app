import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/store/useAppStore';
import { MEASUREMENT_LABELS } from '@/utils/measurementLabels';
import { TREND_RANGES, filterByRange, computeTrend, type TrendRange } from '@/utils/measurementTrend';
import { cmToIn, inToCm } from '@/utils/units';
import type { MeasurementType } from '@/types';

interface MeasurementDetailModalProps {
  type: MeasurementType | null;
  onClose: () => void;
}

export function MeasurementDetailModal({ type, onClose }: MeasurementDetailModalProps) {
  const units = useAppStore((s) => s.units);
  const allMeasurements = useAppStore((s) => s.measurements);
  const addMeasurement = useAppStore((s) => s.addMeasurement);
  const deleteMeasurement = useAppStore((s) => s.deleteMeasurement);
  const deleteMeasurementHistory = useAppStore((s) => s.deleteMeasurementHistory);

  const [range, setRange] = useState<TrendRange>('1m');
  const [inputValue, setInputValue] = useState('');

  const unitLabel = units === 'imperial' ? 'in' : 'cm';
  const toDisplay = (cm: number) => (units === 'imperial' ? cmToIn(cm) : Math.round(cm * 10) / 10);
  const toCm = (value: number) => (units === 'imperial' ? inToCm(value) : value);

  const entries = useMemo(
    () => (type ? allMeasurements.filter((m) => m.type === type).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [allMeasurements, type],
  );
  const ranged = useMemo(() => filterByRange(entries, range), [entries, range]);
  const trend = useMemo(() => computeTrend(ranged.map((e) => ({ value: e.valueCm }))), [ranged]);

  if (!type) return null;
  const { label, emoji } = MEASUREMENT_LABELS[type];

  function handleLog() {
    const value = Number(inputValue);
    if (!value || value <= 0) return;
    addMeasurement(type!, toCm(value));
    setInputValue('');
  }

  function handleDeleteAll() {
    if (window.confirm(`Delete all ${label.toLowerCase()} history? This can't be undone.`)) {
      deleteMeasurementHistory(type!);
    }
  }

  const chartData = ranged.map((e) => ({
    label: shortLabel(e.date),
    value: toDisplay(e.valueCm),
  }));

  return (
    <Modal open={!!type} onClose={onClose} title={`${emoji} ${label}`} size="md">
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`Log new value (${unitLabel})`}
          className="input flex-1"
        />
        <Button onClick={handleLog}>Log</Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TREND_RANGES.map((r) => (
          <Chip key={r.value} selected={range === r.value} onClick={() => setRange(r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {ranged.length >= 2 ? (
        <>
          {trend && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-alt px-3 py-2 text-sm">
              {trend.direction === 'up' && <TrendingUp size={16} className="text-amber-600" />}
              {trend.direction === 'down' && <TrendingDown size={16} className="text-primary-600" />}
              {trend.direction === 'stable' && <Minus size={16} className="text-muted" />}
              <span className="text-fg">
                {trend.direction === 'stable'
                  ? 'Roughly stable over this period'
                  : `${trend.direction === 'up' ? 'Increased' : 'Decreased'} by ${Math.abs(trend.deltaAbs)}${unitLabel} (${Math.abs(trend.deltaPct)}%)`}
              </span>
            </div>
          )}
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9AA1AC' }} />
                <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(16,24,40,0.12)', fontSize: 12 }}
                  formatter={(v: number) => [`${v}${unitLabel}`, label]}
                />
                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState icon={<span>{emoji}</span>} title="Not enough data yet" description="Log at least two values to see a trend." />
        </div>
      )}

      <div className="mt-4 max-h-48 space-y-1.5 overflow-y-auto">
        {[...entries].reverse().map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2 text-sm">
            <span className="text-muted">{e.date}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-fg tabular-nums">
                {toDisplay(e.valueCm)}
                {unitLabel}
              </span>
              <button onClick={() => deleteMeasurement(e.id)} aria-label="Delete entry" className="text-faint hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <button onClick={handleDeleteAll} className="mt-3 text-xs font-medium text-red-500 hover:underline">
          Delete all {label.toLowerCase()} history
        </button>
      )}
    </Modal>
  );
}

function shortLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return new Date(2020, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
