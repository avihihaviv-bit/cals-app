import type { NaturalnessInfo } from '@/types';

// ---------------------------------------------------------------------------
// Naturalness Score — how close a food is to its whole/unprocessed form.
//
// This is explicitly NOT a health score and NOT a "good/bad food" judgment.
// It measures processing level only. A low score is informational, never a
// warning — nothing in this module or its callers should render a food as
// "forbidden" or use judgmental language ("bad", "unhealthy", "failed").
// ---------------------------------------------------------------------------

export interface NaturalnessTier {
  label: string;
  emoji: string;
  color: string;
  description: string;
}

const TIERS: { min: number; tier: NaturalnessTier }[] = [
  { min: 80, tier: { label: 'Mostly Natural', emoji: '🟢', color: '#16A34A', description: 'Close to its whole-food form.' } },
  { min: 60, tier: { label: 'Mostly Natural', emoji: '🟢', color: '#65A30D', description: 'Based mainly on simple ingredients, with some processing.' } },
  { min: 40, tier: { label: 'Moderately Processed', emoji: '🟡', color: '#CA8A04', description: 'Has gone through more significant processing.' } },
  { min: 20, tier: { label: 'Highly Processed', emoji: '🟠', color: '#EA580C', description: 'Contains more processing and formulated ingredients.' } },
  { min: 0, tier: { label: 'Ultra-Processed', emoji: '🔴', color: '#DC2626', description: 'Further from whole-food form, typically with several processed ingredients.' } },
];

export function naturalnessTier(score: number): NaturalnessTier {
  const match = TIERS.find((t) => score >= t.min);
  return match ? match.tier : TIERS[TIERS.length - 1].tier;
}

// Smooth color gradient across the 1-100 range, independent of the tier
// bands above — used for the score bar fill so color shifts continuously
// rather than jumping at tier boundaries.
const STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 1, rgb: [220, 38, 38] }, // red
  { at: 20, rgb: [234, 88, 12] }, // orange
  { at: 40, rgb: [202, 138, 4] }, // yellow
  { at: 60, rgb: [101, 163, 13] }, // yellow-green
  { at: 80, rgb: [22, 163, 74] }, // green
  { at: 100, rgb: [22, 163, 74] },
];

export function naturalnessColor(score: number): string {
  const clamped = Math.max(1, Math.min(100, score));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (clamped >= a.at && clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at || 1);
      const rgb = a.rgb.map((c, idx) => Math.round(c + (b.rgb[idx] - c) * t)) as [number, number, number];
      return `rgb(${rgb.join(',')})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1].rgb.join(',')})`;
}

/**
 * Weighted average by gram weight — NOT a simple mean. A 300g plate of
 * chicken and a 5g garnish of sauce shouldn't count equally.
 */
export function weightedNaturalness(items: { naturalness?: NaturalnessInfo; grams: number }[]): number | null {
  const valid = items.filter((i) => i.naturalness && i.grams > 0);
  const totalGrams = valid.reduce((sum, i) => sum + i.grams, 0);
  if (totalGrams === 0) return null;
  const weightedSum = valid.reduce((sum, i) => sum + i.naturalness!.score * i.grams, 0);
  return Math.round(weightedSum / totalGrams);
}

/** Neutral, non-judgmental one-liner for a daily/weekly average score. */
export function naturalnessSummaryText(score: number): string {
  if (score >= 80) return 'Your day included mostly whole, minimally processed foods.';
  if (score >= 60) return 'Your day included mostly whole foods, with some processed ones.';
  if (score >= 40) return 'Your day included a mix of whole foods and processed foods.';
  if (score >= 20) return 'Your day included mostly processed foods, with some whole ones.';
  return 'Your day included mostly processed foods.';
}

/** A food counts toward "clean/whole" calories at this naturalness score or above — matches the "Mostly Natural" tier boundary. */
const CLEAN_FOOD_THRESHOLD = 60;

/**
 * Percent of today's logged calories that came from minimally processed /
 * whole foods (score >= CLEAN_FOOD_THRESHOLD). A separate, complementary
 * metric to the weighted average score above — this one answers "how much
 * of what I ate was whole food" rather than "how natural was it on
 * average." Purely informational: never a target the user must hit, never
 * framed as foods being "good" or "bad".
 */
export function cleanFoodPercentage(items: { naturalness?: NaturalnessInfo; calories: number }[]): number | null {
  const valid = items.filter((i) => i.naturalness && i.calories > 0);
  const totalCalories = valid.reduce((sum, i) => sum + i.calories, 0);
  if (totalCalories === 0) return null;
  const cleanCalories = valid
    .filter((i) => i.naturalness!.score >= CLEAN_FOOD_THRESHOLD)
    .reduce((sum, i) => sum + i.calories, 0);
  return Math.round((cleanCalories / totalCalories) * 100);
}
