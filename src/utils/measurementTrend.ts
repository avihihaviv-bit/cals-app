import { addDays, todayISO } from '@/utils/date';

export type TrendRange = '1w' | '1m' | '3m' | '6m' | '1y';

export const TREND_RANGES: { value: TrendRange; label: string; days: number }[] = [
  { value: '1w', label: '1 Week', days: 7 },
  { value: '1m', label: '1 Month', days: 30 },
  { value: '3m', label: '3 Months', days: 90 },
  { value: '6m', label: '6 Months', days: 182 },
  { value: '1y', label: '1 Year', days: 365 },
];

export function filterByRange<T extends { date: string }>(entries: T[], range: TrendRange): T[] {
  const days = TREND_RANGES.find((r) => r.value === range)?.days ?? 30;
  const cutoff = addDays(todayISO(), -days);
  return entries.filter((e) => e.date >= cutoff);
}

export type TrendDirection = 'up' | 'down' | 'stable';

export interface MeasurementTrend {
  direction: TrendDirection;
  deltaAbs: number;
  deltaPct: number;
  firstValue: number;
  lastValue: number;
}

/**
 * A small change is reported as "stable" rather than up/down — a 0.2cm
 * fluctuation between two readings isn't a meaningful trend, and calling it
 * one would overstate what the data actually shows.
 */
export function computeTrend(entriesSortedByDate: { value: number }[]): MeasurementTrend | null {
  if (entriesSortedByDate.length < 2) return null;
  const firstValue = entriesSortedByDate[0].value;
  const lastValue = entriesSortedByDate[entriesSortedByDate.length - 1].value;
  const deltaAbs = Math.round((lastValue - firstValue) * 10) / 10;
  const deltaPct = firstValue !== 0 ? Math.round((deltaAbs / firstValue) * 1000) / 10 : 0;

  let direction: TrendDirection = 'stable';
  if (Math.abs(deltaPct) >= 1 && Math.abs(deltaAbs) >= 0.3) {
    direction = deltaAbs > 0 ? 'up' : 'down';
  }

  return { direction, deltaAbs, deltaPct, firstValue, lastValue };
}
