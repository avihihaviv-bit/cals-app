export function formatKcal(n: number): string {
  return `${Math.round(n).toLocaleString()} kcal`;
}

export function formatGrams(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded}g`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.round((value / total) * 100), 0, 999);
}
