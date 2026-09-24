import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { DataQualityBadge } from '@/components/ui/DataQualityBadge';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { FoodDetailModal } from '@/components/food/FoodDetailModal';
import type { DiaryEntry } from '@/types';

export function DiaryEntryRow({ entry }: { entry: DiaryEntry }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-3 text-left shadow-card transition hover:shadow-elevated active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xl">
          {entry.foodImageEmoji ?? '🍽️'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-fg">{entry.foodName}</p>
            {entry.aiConfidence && (
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">
                AI
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span>{entry.servingLabel}</span>
            <span>·</span>
            <span>
              P{Math.round(entry.nutrition.proteinG)} C{Math.round(entry.nutrition.carbsG)} F{Math.round(entry.nutrition.fatG)}
            </span>
            <DataQualityBadge quality={entry.dataQuality} compact />
            {entry.naturalness && <NaturalnessBadge score={entry.naturalness.score} compact />}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-bold tabular-nums text-fg">{Math.round(entry.nutrition.calories)}</span>
          <Pencil size={13} className="text-faint" />
        </div>
      </button>

      <FoodDetailModal open={editing} onClose={() => setEditing(false)} entry={entry} />
    </>
  );
}
