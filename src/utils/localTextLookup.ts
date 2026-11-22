import { FOODS } from '@/data/foods';
import { useAppStore } from '@/store/useAppStore';
import { normalizeText } from '@/services/restaurantSearch';
import type { FoodItem } from '@/types';

/**
 * Instant, on-device answer for typed foods that are clearly in the built-in
 * list ("150g חזה עוף, 2 ביצים") — no AI call, no waiting, same answer every
 * time. It is deliberately strict: every part of the text must match one food
 * exactly; anything descriptive or unknown ("חזה עוף מטוגן", "פסטה ברוטב")
 * returns null and goes to the AI instead.
 */

export interface LocalTextMatch {
  raw: string;
  food: FoodItem;
  grams: number;
  count?: number;
  /** True when no amount was typed and the food's typical portion was used. */
  portionAssumed: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, אחת: 1, שתיימ: 2, שתי: 2, שני: 2, שניימ: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
  one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1, חצי: 0.5, half: 0.5,
};
const PIECE_WORDS = new Set(['פרוסה', 'פרוסות', 'יחידה', 'יחידות', 'יח', 'חתיכה', 'חתיכות', 'slice', 'slices', 'piece', 'pieces']);
const FILLER = new Set(['של', 'of', 'כ', 'בערכ', 'about', 'around']);
const SINGULAR_PLURAL: Record<string, string> = {
  ביצה: 'ביצימ', egg: 'eggs', בננות: 'בננה', תפוחימ: 'תפוח', תפוזימ: 'תפוז', עגבניות: 'עגבנייה', מלפפונימ: 'מלפפונ',
  תמר: 'תמרימ', פיתות: 'פיתה', שקד: 'שקדימ', ענב: 'ענבימ', תות: 'תותימ', אגסימ: 'אגס', אפרסקימ: 'אפרסק',
};

function foodKeys(f: FoodItem): string[] {
  const base = f.name.replace(/\s*\(.*?\)\s*/g, ' ');
  return [f.nameHe, f.name, base].filter(Boolean).map((x) => normalizeText(x!));
}

function findFood(words: string[], pool: FoodItem[]): FoodItem | null {
  const phrase = words.map((w) => SINGULAR_PLURAL[w] ?? w).join(' ');
  if (!phrase) return null;
  const exact = pool.filter((f) => foodKeys(f).includes(phrase));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null; // ambiguous (e.g. cooked vs dry oats) — let the AI decide
  // "אורז" → "אורז לבן": only when exactly one food's Hebrew name starts with these words.
  const prefix = pool.filter((f) => f.nameHe && normalizeText(f.nameHe).startsWith(`${phrase} `));
  return prefix.length === 1 ? prefix[0] : null;
}

function matchSegment(segment: string, pool: FoodItem[]): LocalTextMatch | null {
  let text = segment.trim();
  let grams: number | undefined;
  let count: number | undefined;
  let piece = false;

  const gm = text.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|גר׳|גר'|גר|g|gr|grams?|מ"ל|מ״ל|מל|ml)(?![\p{L}])/iu);
  if (gm) {
    grams = Number(gm[1].replace(',', '.'));
    text = text.replace(gm[0], ' ');
  }
  let words = normalizeText(text).split(' ').filter(Boolean);
  if (grams === undefined && words.length && /^\d+(?:\.\d+)?$/.test(words[0])) {
    count = Number(words[0]);
    words = words.slice(1);
  } else if (grams === undefined && words.length && NUMBER_WORDS[words[0]] !== undefined) {
    count = NUMBER_WORDS[words[0]];
    words = words.slice(1);
  }
  if (words.length && PIECE_WORDS.has(words[0])) {
    piece = true;
    words = words.slice(1);
  }
  words = words.filter((w) => !FILLER.has(w));
  if (words.some((w) => /\d/.test(w))) return null;

  const food = findFood(words, pool);
  if (!food) return null;

  if (grams !== undefined) {
    if (grams <= 0 || grams > 3000) return null;
    return { raw: segment.trim(), food, grams: Math.round(grams), portionAssumed: false };
  }
  const pieceOption = food.servingOptions.find((o) => o.unit === 'piece');
  if (count !== undefined) {
    if (!pieceOption && !piece) return null; // "2 חומוס" — unclear what a unit is; ask the AI
    const unit = pieceOption ?? food.defaultServing;
    return { raw: segment.trim(), food, grams: Math.round(unit.grams * count), count, portionAssumed: false };
  }
  return { raw: segment.trim(), food, grams: food.defaultServing.grams, portionAssumed: true };
}

export function lookupLocally(text: string): LocalTextMatch[] | null {
  const pool = [...FOODS, ...useAppStore.getState().customFoods];
  const segments = text
    .split(/[,،+\n]|\s+and\s+|\s+ו-\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const out: LocalTextMatch[] = [];
  for (const seg of segments) {
    let m = matchSegment(seg, pool);
    if (!m) {
      // "חזה עוף ואורז" — try splitting on the Hebrew "and" prefix.
      const parts = seg.split(/\s+ו(?=[\p{L}\d])/u);
      if (parts.length < 2) return null;
      for (const part of parts) {
        const pm = matchSegment(part, pool);
        if (!pm) return null;
        out.push(pm);
      }
      continue;
    }
    out.push(m);
  }
  return out;
}
