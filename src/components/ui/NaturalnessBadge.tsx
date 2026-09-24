import { naturalnessColor, naturalnessTier } from '@/utils/naturalness';

export function NaturalnessBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const tier = naturalnessTier(score);
  const color = naturalnessColor(score);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
      title={`Estimated Naturalness: ${score}/100 — ${tier.label}`}
    >
      🌿 {score}
      {!compact && <span className="hidden sm:inline">/100</span>}
    </span>
  );
}
