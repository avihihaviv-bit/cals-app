import { findDishById } from '@/data/restaurants';
import { addDays, todayISO } from '@/utils/date';
import type { DiaryEntry } from '@/types';

export interface Achievement {
  emoji: string;
  label: string;
  value: string;
  achieved: boolean;
}

export function computeStreak(entries: DiaryEntry[]): number {
  const loggedDates = new Set(entries.map((e) => e.date));
  let streak = 0;
  let cursor = todayISO();
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function computeAchievements(entries: DiaryEntry[], proteinTargetG: number): Achievement[] {
  const streak = computeStreak(entries);

  const proteinByDate = new Map<string, number>();
  for (const e of entries) {
    proteinByDate.set(e.date, (proteinByDate.get(e.date) ?? 0) + e.nutrition.proteinG);
  }
  const proteinHitDays = Array.from(proteinByDate.values()).filter((g) => proteinTargetG > 0 && g >= proteinTargetG * 0.9).length;

  const scanCount = entries.filter((e) => e.source === 'scan').length;

  const restaurantIds = new Set(
    entries
      .filter((e) => e.source === 'restaurant')
      .map((e) => findDishById(e.foodId)?.restaurantId)
      .filter((id): id is string => !!id),
  );

  return [
    { emoji: '🔥', label: 'Day streak', value: `${streak}`, achieved: streak >= 3 },
    { emoji: '🥩', label: 'Protein target hit', value: `${proteinHitDays}x`, achieved: proteinHitDays >= 3 },
    { emoji: '📸', label: 'Meals scanned', value: `${scanCount}`, achieved: scanCount >= 5 },
    { emoji: '🏪', label: 'Restaurants tried', value: `${restaurantIds.size}`, achieved: restaurantIds.size >= 2 },
  ];
}
