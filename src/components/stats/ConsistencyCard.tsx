import type { DayStat } from '@/hooks/useHistoryStats';

export function ConsistencyCard({ data, goal }: { data: DayStat[]; goal: number }) {
  const trackedDays = data.filter((d) => d.hasEntries);
  const withinRange = trackedDays.filter((d) => {
    const pct = goal > 0 ? d.totals.calories / goal : 0;
    return pct >= 0.85 && pct <= 1.15;
  });
  const pct = trackedDays.length > 0 ? Math.round((withinRange.length / trackedDays.length) * 100) : 0;

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <h3 className="text-sm font-bold text-fg">Nutrition consistency</h3>
      <p className="mt-0.5 text-xs text-muted">Days within ±15% of your calorie goal, last 7 days</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-lg font-bold text-primary-700">
          {pct}%
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-fg">
            {withinRange.length} of {trackedDays.length || 0} tracked days
          </p>
          <p className="text-xs text-muted">{trackedDays.length === 0 ? 'Log a few days to see your consistency.' : 'Keep it up!'}</p>
        </div>
      </div>
    </div>
  );
}
