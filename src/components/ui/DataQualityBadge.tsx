import type { DataQuality } from '@/types';

const CONFIG: Record<DataQuality, { emoji: string; label: string; className: string }> = {
  verified: { emoji: '🟢', label: 'Verified database', className: 'bg-primary-50 text-primary-700' },
  estimated: { emoji: '🟡', label: 'Estimated', className: 'bg-amber-50 text-amber-700' },
  ai_estimate: { emoji: '🟠', label: 'AI estimate', className: 'bg-orange-50 text-orange-700' },
};

export function DataQualityBadge({ quality, compact = false }: { quality: DataQuality; compact?: boolean }) {
  const cfg = CONFIG[quality];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <span>{cfg.emoji}</span>
      {!compact && <span>{cfg.label}</span>}
    </span>
  );
}
