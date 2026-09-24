import { useState } from 'react';
import { Droplet } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { todayISO } from '@/utils/date';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { calculateHydrationTargetMl } from '@/utils/nutritionCalculator';

const QUICK_ADD_ML = [250, 500, 750, 1000];

export function WaterTracker() {
  const date = todayISO();
  const waterLog = useAppStore((s) => s.waterLog);
  const addWater = useAppStore((s) => s.addWater);
  const profile = useAppStore((s) => s.profile);
  const current = waterLog[date] ?? 0;
  const [customMl, setCustomMl] = useState('');

  const goal = profile ? calculateHydrationTargetMl(profile) : 2000;

  function addCustom() {
    const ml = Number(customMl);
    if (ml > 0) {
      addWater(ml, date);
      setCustomMl('');
    }
  }

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Droplet size={15} className="text-blue-400" />
          Water
        </h3>
        <span className="text-sm font-semibold tabular-nums text-fg">
          {(current / 1000).toFixed(1)}L <span className="text-xs font-normal text-muted">/ {(goal / 1000).toFixed(1)}L</span>
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">Estimated hydration target, based on your weight and activity</p>
      <ProgressBar value={current} max={goal} color="#3B82F6" className="mt-2.5" />
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {QUICK_ADD_ML.map((ml) => (
          <button
            key={ml}
            onClick={() => addWater(ml, date)}
            className="rounded-lg bg-blue-50 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-95"
          >
            +{ml >= 1000 ? '1L' : `${ml}ml`}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          value={customMl}
          onChange={(e) => setCustomMl(e.target.value)}
          placeholder="Custom ml"
          className="input flex-1 py-1.5 text-xs"
        />
        <button
          onClick={addCustom}
          className="shrink-0 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-600 active:scale-95"
        >
          Add
        </button>
        {current > 0 && (
          <button
            onClick={() => addWater(-current, date)}
            className="shrink-0 rounded-lg bg-surface-alt px-3 py-2 text-xs font-semibold text-muted transition hover:bg-surface-alt2 active:scale-95"
          >
            Reset
          </button>
        )}
      </div>
      {profile && profile.trainingDaysPerWeek > 0 && (
        <p className="mt-2.5 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] text-blue-700">
          💧 You train {profile.trainingDaysPerWeek}x/week — hydrate before, during, and after workouts. No need to overdo it.
        </p>
      )}
    </div>
  );
}
