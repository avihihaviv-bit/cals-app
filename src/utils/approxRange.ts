/** A symmetric ±spreadPct range around a value — used to show "Approximately 450-600 kcal" instead of a falsely precise number when the underlying data isn't from an official source. */
export function approxRange(value: number, spreadPct = 0.15): { min: number; max: number } {
  return { min: Math.round(value * (1 - spreadPct)), max: Math.round(value * (1 + spreadPct)) };
}
