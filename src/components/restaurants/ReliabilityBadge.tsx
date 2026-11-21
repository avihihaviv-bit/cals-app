import type { DishReliability } from '@/types';

const CONFIG: Record<DishReliability, { emoji: string; label: string; short: string; className: string }> = {
  official: { emoji: '🟢', label: 'מידע רשמי', short: 'רשמי', className: 'bg-primary-50 text-primary-700 ring-primary-200' },
  estimated: { emoji: '🟡', label: 'הערכה לפי מתכון / מרכיבים', short: 'משוער', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  low: { emoji: '🔴', label: 'מידע לא מספיק אמין', short: 'לא אמין', className: 'bg-red-50 text-red-700 ring-red-200' },
};

export function ReliabilityBadge({ reliability = 'estimated', compact = false }: { reliability?: DishReliability; compact?: boolean }) {
  const c = CONFIG[reliability];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${c.className}`}>
      <span aria-hidden>{c.emoji}</span>
      {compact ? c.short : c.label}
    </span>
  );
}

export const RELIABILITY_LABEL = CONFIG;
