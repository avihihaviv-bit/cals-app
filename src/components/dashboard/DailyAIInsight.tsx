import { Sparkles } from 'lucide-react';
import { generateDailySummary } from '@/utils/insights';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useUIStore } from '@/store/useUIStore';

export function DailyAIInsight() {
  const ctx = useAssistantContext();
  const openAssistant = useUIStore((s) => s.openAssistant);

  const last7ExcludingToday = ctx.last7Days.slice(0, -1);
  const summary = generateDailySummary(ctx.totals, ctx.targets, last7ExcludingToday, ctx.streakDays);

  return (
    <button
      onClick={openAssistant}
      className="flex w-full items-start gap-3 rounded-xl2 bg-ink p-4 text-left text-white shadow-card transition hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">AI Insight</p>
        <p className="mt-0.5 text-sm font-medium leading-snug">{summary.headline}</p>
        {summary.lines[0] && <p className="mt-1 text-xs text-white/60">{summary.lines[0]}</p>}
      </div>
    </button>
  );
}
