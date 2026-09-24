import { useMemo } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { weightedNaturalness, naturalnessColor, naturalnessTier, naturalnessSummaryText } from '@/utils/naturalness';
import type { DiaryEntry } from '@/types';

export function NaturalnessMixCard({ entries }: { entries: DiaryEntry[] }) {
  const score = useMemo(
    () => weightedNaturalness(entries.map((e) => ({ naturalness: e.naturalness, grams: e.quantityGrams }))),
    [entries],
  );

  if (score === null) return null;

  const tier = naturalnessTier(score);
  const color = naturalnessColor(score);

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-fg">🌿 Today&apos;s Food Quality Mix</h3>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {score}/100
        </span>
      </div>
      <ProgressBar value={score} max={100} color={color} className="mt-2" />
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
        {tier.emoji} {tier.label}
      </p>
      <p className="mt-1 text-xs text-muted">{naturalnessSummaryText(score)}</p>
    </div>
  );
}
