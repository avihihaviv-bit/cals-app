import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { MeasurementRow } from '@/components/measurements/MeasurementRow';
import { MeasurementDetailModal } from '@/components/measurements/MeasurementDetailModal';
import { ProgressPhotoSection } from '@/components/measurements/ProgressPhotoSection';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { MEASUREMENT_ORDER } from '@/utils/measurementLabels';
import { computeTrend } from '@/utils/measurementTrend';
import { kgToLb, lbToKg } from '@/utils/units';
import { todayISO } from '@/utils/date';
import type { MeasurementType } from '@/types';

export function MeasurementsPage() {
  const units = useAppStore((s) => s.units);
  const weightLog = useAppStore((s) => s.weightLog);
  const addWeightLog = useAppStore((s) => s.addWeightLog);
  const profile = useAppStore((s) => s.profile);
  const [activeType, setActiveType] = useState<MeasurementType | null>(null);

  const sortedWeights = useMemo(() => [...weightLog].sort((a, b) => a.date.localeCompare(b.date)), [weightLog]);
  const latestWeightKg = sortedWeights[sortedWeights.length - 1]?.weightKg ?? profile?.weightKg ?? 70;
  const weightTrend = computeTrend(sortedWeights.slice(-2).map((w) => ({ value: w.weightKg })));

  const [weightInput, setWeightInput] = useState(units === 'imperial' ? kgToLb(latestWeightKg) : latestWeightKg);
  const weightUnitLabel = units === 'imperial' ? 'lb' : 'kg';

  function logWeight() {
    addWeightLog(units === 'imperial' ? lbToKg(weightInput) : weightInput, todayISO());
  }

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">📏 Body Measurements</h1>
        <p className="mt-1 text-sm text-muted">Tracked privately, on this device only.</p>
      </header>

      {/* Weight */}
      <div className="rounded-xl2 bg-surface p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-lg">
            <Scale size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg">Weight</p>
            <p className="text-xs text-muted">{sortedWeights.length > 0 ? `${sortedWeights.length} entries` : 'No entries yet'}</p>
          </div>
          {weightTrend && (
            <span className="text-xs text-muted">
              {weightTrend.direction === 'stable' ? 'Stable' : `${weightTrend.direction === 'up' ? '↑' : '↓'} ${Math.abs(weightTrend.deltaAbs)}${weightUnitLabel}`}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-alt px-3 py-2.5">
          <QuantityStepper value={weightInput} onChange={setWeightInput} step={units === 'imperial' ? 1 : 0.5} min={20} suffix={weightUnitLabel} />
          <Button size="sm" onClick={logWeight}>
            Log
          </Button>
        </div>
      </div>

      {/* Other measurements */}
      <div>
        <h2 className="mb-2.5 text-sm font-bold text-fg">Measurements</h2>
        <div className="space-y-2">
          {MEASUREMENT_ORDER.map((type) => (
            <MeasurementRow key={type} type={type} onClick={() => setActiveType(type)} />
          ))}
        </div>
      </div>

      <ProgressPhotoSection />

      <MeasurementDetailModal type={activeType} onClose={() => setActiveType(null)} />
    </div>
  );
}
