import { FOODS } from '@/data/foods';
import { gramsPerMeasure, MEASURE_LABEL, measureFromWord, type MeasureUnit } from '@/data/portions';
import { useAppStore } from '@/store/useAppStore';
import { normalizeText } from '@/services/restaurantSearch';
import { pluralizeUnit } from '@/utils/units';
import type { FoodItem, ServingOption } from '@/types';

/**
 * Instant, on-device answer for typed foods that are clearly in the built-in
 * list ("150g חזה עוף, 2 ביצים", "2 כפות חומוס", "חביתה מביצה אחת") — no AI
 * call, no waiting, same answer every time. It is deliberately strict: every
 * part of the text must match one food exactly; anything descriptive or
 * unknown ("חזה עוף מטוגן", "חביתה עם גבינה") returns null and goes to the AI.
 */

export interface LocalTextMatch {
  raw: string;
  food: FoodItem;
  grams: number;
  count?: number;
  /** Unit name for count ("eggs", "tbsp"). */
  unitLabel?: string;
  /** Grams in one unit, when the amount came from a count or a household measure. */
  unitGrams?: number;
  /** How the amount was worked out, e.g. "2 tbsp × 20 g (standard household measure)". */
  note?: string;
  /** True when no amount was typed and the food's typical portion was used. */
  portionAssumed: boolean;
}

// All keys in normalized form (final letters folded: "שתיים" → "שתיימ").
const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, אחת: 1, שתיימ: 2, שתי: 2, שני: 2, שניימ: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1, חצי: 0.5, half: 0.5,
};
const PIECE_WORDS = new Set(['פרוסה', 'פרוסות', 'יחידה', 'יחידות', 'יח', 'חתיכה', 'חתיכות', 'slice', 'slices', 'piece', 'pieces']);
const FILLER = new Set(['של', 'of', 'כ', 'בערכ', 'about', 'around']);
/** A singular word typed without a number means one unit ("ביצה" = 1 egg, not a default portion of 2). */
const SINGULAR_TO_PLURAL: Record<string, string> = { ביצה: 'ביצימ', egg: 'eggs', תמר: 'תמרימ', שקד: 'שקדימ', ענב: 'ענבימ', תות: 'תותימ' };
const PLURAL_TO_SINGULAR: Record<string, string> = {
  בננות: 'בננה', תפוחימ: 'תפוח', תפוזימ: 'תפוז', עגבניות: 'עגבנייה', מלפפונימ: 'מלפפונ', פיתות: 'פיתה', אגסימ: 'אגס', אפרסקימ: 'אפרסק',
};
/** Words too generic to auto-complete to one specific food ("טחינה" usually means the prepared sauce, not raw paste). */
const NO_PREFIX = new Set(['טחינה', 'גבינה', 'חלבונ', 'שוקולד', 'סלט', 'יוגורט', 'לחמ']);

function foodKeys(f: FoodItem): string[] {
  const base = f.name.replace(/\s*\(.*?\)\s*/g, ' ');
  return [f.nameHe, f.name, base].filter(Boolean).map((x) => normalizeText(x!));
}

function findFood(words: string[], pool: FoodItem[]): FoodItem | null {
  const phrase = words.map((w) => SINGULAR_TO_PLURAL[w] ?? PLURAL_TO_SINGULAR[w] ?? w).join(' ');
  if (!phrase) return null;
  const exact = pool.filter((f) => foodKeys(f).includes(phrase));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null; // ambiguous (e.g. cooked vs dry oats) — let the AI decide
  if (NO_PREFIX.has(phrase)) return null;
  // "אורז" → "אורז לבן": only when exactly one food's Hebrew name starts with these words.
  const prefix = pool.filter((f) => f.nameHe && normalizeText(f.nameHe).startsWith(`${phrase} `));
  return prefix.length === 1 ? prefix[0] : null;
}

function pieceOf(food: FoodItem) {
  return food.servingOptions.find((o) => o.unit === 'piece');
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

const unitNameOf = (piece: ServingOption) => piece.label.replace(/^1\s*/, '').replace(/\s*\(.*\)$/, '') || 'pcs';

/** No amount typed: the typical portion — as a count when it's whole units (2 slices, 1 pita), so the count can be changed. */
function typicalPortion(raw: string, food: FoodItem, unitName?: string): LocalTextMatch {
  const piece = pieceOf(food);
  const n = piece ? food.defaultServing.grams / piece.grams : NaN;
  if (piece && Number.isInteger(n) && n >= 1 && n <= 12) {
    return { raw, food, grams: food.defaultServing.grams, count: n, unitLabel: pluralizeUnit(unitName ?? unitNameOf(piece), n), unitGrams: piece.grams, portionAssumed: true };
  }
  return { raw, food, grams: food.defaultServing.grams, portionAssumed: true };
}

// ---- Plain egg dishes: "חביתה מביצה אחת", "חביתה מ-2 ביצים", "2 ביצי עין", "omelette with 3 eggs" ----

const EGG_DISH_WORDS: [RegExp, string][] = [
  [/מקושקש|scrambled/, 'egg-scrambled'],
  [/חביתה|חביתת|omelet/, 'omelette'],
  [/ביצת עינ|ביצי עינ|fried egg/, 'egg-fried'],
  [/(?:ביצה|ביצימ|ביצי) (?:קשה|קשות|רכה|רכות)|boiled egg|hard boiled|soft boiled/, 'eggs'],
];
const EGG_OK_TOKENS = new Set([
  'חביתה', 'חביתת', 'omelet', 'omelette', 'omelete', 'מקושקשת', 'מקושקשות', 'scrambled', 'ביצת', 'ביצי', 'עינ', 'fried', 'ביצה', 'ביצימ',
  'מביצה', 'מביצימ', 'egg', 'eggs', 'קשה', 'קשות', 'רכה', 'רכות', 'hard', 'soft', 'boiled', 'מ', 'של', 'עמ', 'from', 'with', 'of', 'made', 'x',
]);

function matchEggDish(segment: string, pool: FoodItem[]): LocalTextMatch | null | undefined {
  const t = normalizeText(segment);
  const dish = EGG_DISH_WORDS.find(([re]) => re.test(t))?.[1];
  if (!dish) return undefined; // not an egg dish — use the general matcher
  const tokens = t.split(' ').filter(Boolean);
  let count: number | undefined;
  const digits = segment.match(/(\d+(?:[.,]\d+)?)/);
  if (digits) count = Number(digits[1].replace(',', '.'));
  for (const tok of tokens) {
    if (/^\d+$/.test(tok) || /^מ\d+$/.test(tok)) continue;
    const word = NUMBER_WORDS[tok] !== undefined ? tok : tok.startsWith('מ') && NUMBER_WORDS[tok.slice(1)] !== undefined ? tok.slice(1) : null;
    if (word) {
      if (count === undefined) count = NUMBER_WORDS[word];
      continue;
    }
    if (!EGG_OK_TOKENS.has(tok)) return null; // "חביתה עם גבינה" — not a plain egg dish; the AI handles it
  }
  // "חביתה מביצה" / "ביצת עין" / "ביצה קשה": a singular egg word means one egg.
  if (count === undefined && /(?:^| )(?:מביצה|ביצה|ביצת|egg)(?: |$)/.test(t)) count = 1;
  const food = pool.find((f) => f.id === dish);
  if (!food) return undefined;
  const piece = pieceOf(food);
  if (count === undefined || !piece) return typicalPortion(segment.trim(), food, 'egg');
  if (count <= 0 || count > 12) return null;
  const unit = count === 1 ? 'egg' : 'eggs';
  return {
    raw: segment.trim(),
    food,
    grams: Math.round(piece.grams * count),
    count,
    unitLabel: unit,
    unitGrams: piece.grams,
    note: `${fmt(count)} ${unit} × ${piece.grams} g per egg (standard)`,
    portionAssumed: false,
  };
}

function matchSegment(segment: string, pool: FoodItem[]): LocalTextMatch | null {
  let text = segment.trim();
  let grams: number | undefined;
  let count: number | undefined;
  let piece = false;
  let measure: MeasureUnit | undefined;

  const gm = text.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|גר׳|גר'|גר|g|gr|grams?|מ"ל|מ״ל|מל|ml)(?![\p{L}])/iu);
  if (gm) {
    grams = Number(gm[1].replace(',', '.'));
    text = text.replace(gm[0], ' ');
  } else {
    const egg = matchEggDish(text, pool);
    if (egg !== undefined) return egg;
    // A leading number ("1.5 כוסות") is read before normalizing, which would split "1.5" into two words.
    const lead = text.match(/^\s*(\d+(?:[.,]\d+)?)\s*/);
    if (lead) {
      count = Number(lead[1].replace(',', '.'));
      text = text.slice(lead[0].length);
    }
  }
  let words = normalizeText(text).split(' ').filter(Boolean);
  if (grams === undefined && count === undefined && words.length && NUMBER_WORDS[words[0]] !== undefined) {
    count = NUMBER_WORDS[words[0]];
    words = words.slice(1);
  }
  if (grams === undefined && words.length) {
    measure = measureFromWord(words[0]);
    if (measure) {
      words = words.slice(1);
      count = count ?? 1;
      // "כף אחת חומוס" / "כוס אחת חלב"
      if (words.length && (words[0] === 'אחת' || words[0] === 'אחד')) words = words.slice(1);
    }
  }
  if (!measure && words.length && PIECE_WORDS.has(words[0])) {
    piece = true;
    words = words.slice(1);
  }
  words = words.filter((w) => !FILLER.has(w));
  if (words.some((w) => /\d/.test(w))) return null;

  const singularTyped = words.length === 1 && SINGULAR_TO_PLURAL[words[0]] !== undefined;
  const food = findFood(words, pool);
  if (!food) return null;
  const raw = segment.trim();

  if (grams !== undefined) {
    if (grams <= 0 || grams > 3000) return null;
    return { raw, food, grams: Math.round(grams), portionAssumed: false };
  }
  if (measure) {
    const per = gramsPerMeasure(food, measure);
    if (!per || !count || count <= 0 || count > 20) return null; // no sensible spoon size for this food — ask the AI
    const [one, many] = MEASURE_LABEL[measure];
    const label = count <= 1 ? one : many;
    return {
      raw,
      food,
      grams: Math.round(per * count),
      count,
      unitLabel: label,
      unitGrams: per,
      note: `${fmt(count)} ${label} × ${per} g (standard household measure)`,
      portionAssumed: false,
    };
  }
  const pieceOption = pieceOf(food);
  if (count === undefined && singularTyped && pieceOption) count = 1;
  if (count !== undefined) {
    if (count <= 0 || count > 30) return null;
    if (!pieceOption && !piece) return null; // "2 חומוס" — unclear what a unit is; ask the AI
    const unit = pieceOption ?? food.defaultServing;
    return {
      raw,
      food,
      grams: Math.round(unit.grams * count),
      count,
      unitLabel: pluralizeUnit(pieceOption ? unitNameOf(pieceOption) : 'pcs', count),
      unitGrams: unit.grams,
      note: `${fmt(count)} × ${unit.label}`,
      portionAssumed: false,
    };
  }
  return typicalPortion(raw, food);
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
    const m = matchSegment(seg, pool);
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
