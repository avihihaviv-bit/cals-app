export function kgToLb(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.20462) * 10) / 10;
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inch = Math.round(totalInches % 12);
  return { ft, inch };
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54);
}

/** Scalar cm <-> inch conversion, for circumference measurements (waist, arm, etc). */
export function cmToIn(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}

export function inToCm(inch: number): number {
  return Math.round(inch * 2.54 * 10) / 10;
}

/** "2 slice" → "2 slices", "1 eggs" → "1 egg" — unit labels follow the count. */
export function pluralizeUnit(label: string | undefined, count: number): string | undefined {
  if (!label) return label;
  const parts = label.split(' ');
  const last = parts.pop()!;
  let word = last;
  if (!/^[a-z]+$/i.test(last) || /^(pcs|tbsp|tsp|kernels|medium|small|large)$/i.test(last)) return label;
  if (count <= 1) {
    if (/oes$/i.test(last)) word = last.slice(0, -2);
    else if (/[^s]s$/i.test(last)) word = last.slice(0, -1);
  } else if (!/s$/i.test(last)) {
    word = `${last}s`;
  }
  return [...parts, word].join(' ');
}
