import { useMemo } from 'react';
import { useTargets } from './useTargets';
import { useDiaryForDate } from './useDiary';
import { useLastNDaysStats } from './useHistoryStats';
import { useAppStore } from '@/store/useAppStore';
import { computeStreak } from '@/utils/achievements';
import { todayISO } from '@/utils/date';
import type { AssistantContext } from '@/services/AssistantService';

export function useAssistantContext(): AssistantContext {
  const { targets } = useTargets();
  const diary = useDiaryForDate(todayISO());
  const last7Days = useLastNDaysStats(7);
  const entries = useAppStore((s) => s.diaryEntries);
  const profile = useAppStore((s) => s.profile);

  const streakDays = useMemo(() => computeStreak(entries), [entries]);

  return { totals: diary.totals, targets, last7Days, streakDays, isMinor: profile?.isMinor ?? false };
}
