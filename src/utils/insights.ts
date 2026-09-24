import type { MacroTargets, NutritionFacts } from '@/types';
import type { DayStat } from '@/hooks/useHistoryStats';
import { WEEKDAY_LABELS } from '@/utils/date';

// ---------------------------------------------------------------------------
// Every insight here is computed directly from the user's own stored data —
// nothing is invented or estimated by a language model. If there isn't
// enough history to say something meaningful, these functions say so rather
// than guessing.
// ---------------------------------------------------------------------------

export interface DailySummary {
  headline: string;
  lines: string[];
  positive: boolean;
}

export function generateDailySummary(
  totals: NutritionFacts,
  targets: MacroTargets,
  last7ExcludingToday: DayStat[],
  streakDays: number,
): DailySummary {
  const lines: string[] = [];

  const proteinPct = targets.proteinG > 0 ? Math.round((totals.proteinG / targets.proteinG) * 100) : 0;
  const caloriePct = targets.calories > 0 ? Math.round((totals.calories / targets.calories) * 100) : 0;

  const trackedPastDays = last7ExcludingToday.filter((d) => d.hasEntries);
  const avgCalories =
    trackedPastDays.length > 0 ? trackedPastDays.reduce((s, d) => s + d.totals.calories, 0) / trackedPastDays.length : null;

  let headline: string;
  let positive = true;

  if (proteinPct >= 90) {
    headline = `Great protein intake today 💪 — you're at ${proteinPct}% of your target.`;
  } else if (caloriePct > 115) {
    headline = `You're running a bit over your calorie target today (${caloriePct}%) — no big deal, tomorrow's a fresh start.`;
    positive = false;
  } else if (caloriePct >= 40) {
    headline = `You're on track today — ${caloriePct}% of your calorie goal and ${proteinPct}% of protein so far.`;
  } else {
    headline = `Early days for today — ${Math.round(totals.calories)} kcal logged so far.`;
  }

  if (avgCalories !== null) {
    const diffPct = Math.round(((totals.calories - avgCalories) / Math.max(avgCalories, 1)) * 100);
    if (Math.abs(diffPct) >= 20) {
      lines.push(`That's ${Math.abs(diffPct)}% ${diffPct > 0 ? 'more' : 'less'} than your ${trackedPastDays.length}-day average so far.`);
    }
  }

  if (streakDays >= 2) {
    lines.push(`You've logged ${streakDays} days in a row 🔥`);
  }

  if (proteinPct < 60) {
    lines.push(`One thing to focus on: you still have ${Math.max(targets.proteinG - Math.round(totals.proteinG), 0)}g of protein to go.`);
  }

  return { headline, lines, positive };
}

export interface StatsInsight {
  text: string;
}

export function generateStatsInsights(last7: DayStat[], proteinTarget: number): StatsInsight[] {
  const insights: StatsInsight[] = [];
  const tracked = last7.filter((d) => d.hasEntries);

  if (tracked.length < 2) {
    return [{ text: 'Log a few more days to start seeing real trends here.' }];
  }

  const half = Math.floor(tracked.length / 2);
  const firstHalf = tracked.slice(0, half);
  const secondHalf = tracked.slice(half);
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const avg = (arr: DayStat[]) => arr.reduce((s, d) => s + d.totals.proteinG, 0) / arr.length;
    const change = Math.round(((avg(secondHalf) - avg(firstHalf)) / Math.max(avg(firstHalf), 1)) * 100);
    if (Math.abs(change) >= 10) {
      insights.push({ text: `Your average protein intake ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change)}% this week.` });
    }
  }

  const proteinHitDays = tracked.filter((d) => proteinTarget > 0 && d.totals.proteinG >= proteinTarget * 0.9);
  if (proteinHitDays.length > 0) {
    const dayNames = proteinHitDays
      .map((d) => {
        const idx = last7.findIndex((x) => x.date === d.date);
        return idx >= 0 ? WEEKDAY_LABELS[idx] : null;
      })
      .filter((x): x is string => !!x);
    if (dayNames.length > 0) {
      insights.push({ text: `You hit your protein target on ${dayNames.join(', ')}.` });
    }
  }

  insights.push({ text: `You logged food on ${tracked.length} of the last 7 days.` });

  return insights.slice(0, 3);
}

/**
 * A grounded, neutral observation about naturalness this week — only
 * returned when the data actually supports the specific claim (a real
 * average, a real threshold crossed). Never asserts something the numbers
 * don't back up, and never frames a low score as bad.
 */
export function generateNaturalnessInsight(last7: DayStat[]): string | null {
  const tracked = last7.filter((d) => d.hasEntries && d.naturalness !== null);
  if (tracked.length < 2) return null;

  const avg = Math.round(tracked.reduce((s, d) => s + (d.naturalness ?? 0), 0) / tracked.length);

  if (avg >= 70) return `This week, most of your meals were based on minimally processed foods (avg. ${avg}/100).`;
  if (avg >= 45) return `This week included a mix of whole and processed foods (avg. ${avg}/100).`;
  return `This week leaned toward more processed foods (avg. ${avg}/100) — just information, not a target to hit.`;
}
