import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { naturalnessColor, naturalnessTier } from '@/utils/naturalness';
import type { NaturalnessInfo } from '@/types';

export function NaturalnessSection({ naturalness }: { naturalness: NaturalnessInfo }) {
  const [expanded, setExpanded] = useState(false);
  const tier = naturalnessTier(naturalness.score);
  const color = naturalnessColor(naturalness.score);

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">🌿 Estimated Naturalness</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {naturalness.score}/100
        </span>
      </div>

      <ProgressBar value={naturalness.score} max={100} color={color} className="mt-2" />

      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
          {tier.emoji} {tier.label}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"
        >
          <Sparkles size={12} />
          Why?
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-subtle pt-3">
          {naturalness.reasons.map((reason, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-muted">
              <span className="mt-0.5 text-faint">•</span>
              {reason}
            </p>
          ))}
          <p className="pt-1 text-[11px] italic text-faint">
            Based mainly on how close this food is to its original form and how much processing it went through — not a
            health rating, and not a real ingredient-label analysis in this demo.
          </p>
        </div>
      )}
    </div>
  );
}
