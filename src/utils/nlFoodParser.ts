import { FOODS } from '@/data/foods';
import { RESTAURANT_DISHES } from '@/data/restaurants';
import type { FoodItem, RestaurantDish, ServingUnit } from '@/types';

/** Anything the parser can resolve a phrase to — a database food or a restaurant dish. */
export type MatchableFood = FoodItem | RestaurantDish;

const MATCH_POOL: MatchableFood[] = [...FOODS, ...RESTAURANT_DISHES];

// ---------------------------------------------------------------------------
// Lightweight, local, rule-based natural-language food parser.
//
// This is NOT an LLM call — it's a small on-device heuristic (number words +
// unit words + keyword matching against the local food database) that lets
// the assistant understand short phrases like "two slices of pizza" or
// "chicken and rice, one plate" well enough to pre-fill an editable confirm
// card. It will misparse unusual phrasing, which is exactly why every result
// is shown to the user for confirmation/editing before anything is logged —
// never auto-logged silently.
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  couple: 2,
  few: 3,
  // Hebrew number words — masculine and feminine forms both map to the same quantity.
  אחד: 1,
  אחת: 1,
  שתיים: 2,
  שני: 2,
  שתי: 2,
  שלוש: 3,
  שלושה: 3,
  ארבע: 4,
  ארבעה: 4,
  חמש: 5,
  חמישה: 5,
  שש: 6,
  שישה: 6,
  שבע: 7,
  שבעה: 7,
  שמונה: 8,
  תשע: 9,
  תשעה: 9,
  עשר: 10,
  עשרה: 10,
  כמה: 3,
};

// Word-boundary anchored so these only match whole unit words — e.g. an
// unanchored /g|grams?/ would match "eggs" (it contains a "g") and silently
// misparse "two eggs" as literally 2 grams of food.
const UNIT_WORDS: { pattern: RegExp; unit: ServingUnit }[] = [
  { pattern: /\bslices?\b/i, unit: 'piece' },
  { pattern: /\bpieces?\b/i, unit: 'piece' },
  { pattern: /\bservings?\b/i, unit: 'serving' },
  { pattern: /\bplates?\b/i, unit: 'serving' },
  { pattern: /\bbowls?\b/i, unit: 'serving' },
  { pattern: /\bcups?\b/i, unit: 'serving' },
  { pattern: /\b(?:g|grams?)\b/i, unit: 'g' },
];

// JS regex \b treats Hebrew letters as non-word characters, so a \b-anchored
// pattern silently fails to match Hebrew words at all — these are matched
// by plain substring instead (safe here since the phrases are short and
// these unit words don't collide with common Hebrew food-name substrings).
const HEBREW_UNIT_WORDS: { word: string; unit: ServingUnit }[] = [
  { word: 'פרוסות', unit: 'piece' },
  { word: 'פרוסה', unit: 'piece' },
  { word: 'חתיכות', unit: 'piece' },
  { word: 'חתיכה', unit: 'piece' },
  { word: 'מנות', unit: 'serving' },
  { word: 'מנה', unit: 'serving' },
  { word: 'צלחת', unit: 'serving' },
  { word: 'קערה', unit: 'serving' },
  { word: 'כוסות', unit: 'serving' },
  { word: 'כוס', unit: 'serving' },
  { word: 'גרם', unit: 'g' },
];

export interface ParsedFoodMention {
  raw: string;
  food: MatchableFood;
  quantity: number;
  grams: number;
}

/** A small set of common colloquial terms mapped to a canonical food id, for words that share no letters with the actual food name (e.g. "toast" vs "bread"). */
const SYNONYM_TO_FOOD_ID: Record<string, string> = {
  toast: 'whole-wheat-bread',
  toasts: 'whole-wheat-bread',
  yogurt: 'greek-yogurt',
  yoghurt: 'greek-yogurt',
  oats: 'oatmeal',
  porridge: 'oatmeal',
  // Hebrew colloquial terms — most Hebrew food names are matched directly
  // against each food's `nameHe` field (see findBestFoodMatch), this map is
  // only for terms that don't literally appear in any nameHe string.
  טוסט: 'whole-wheat-bread',
  דייסה: 'oatmeal',
  חזה: 'chicken-breast',
};

function extractQuantity(segment: string): { quantity: number; rest: string } {
  const trimmed = segment.trim();
  const numMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*/);
  if (numMatch) {
    return { quantity: Number(numMatch[1]), rest: trimmed.slice(numMatch[0].length) };
  }
  // Matches a leading number word in either Latin or Hebrew script — \w and
  // \b don't cover Hebrew letters, so this uses an explicit character class.
  const wordMatch = trimmed.match(/^([a-zא-ת]+)\s+/i);
  if (wordMatch && NUMBER_WORDS[wordMatch[1].toLowerCase()]) {
    return { quantity: NUMBER_WORDS[wordMatch[1].toLowerCase()], rest: trimmed.slice(wordMatch[0].length) };
  }
  return { quantity: 1, rest: trimmed };
}

function detectUnit(text: string): ServingUnit | null {
  for (const { pattern, unit } of UNIT_WORDS) {
    if (pattern.test(text)) return unit;
  }
  for (const { word, unit } of HEBREW_UNIT_WORDS) {
    if (text.includes(word)) return unit;
  }
  return null;
}

// Splits on anything that's neither a Latin nor a Hebrew letter, so a mixed
// or all-Hebrew phrase still tokenizes correctly (the previous [^a-z]-only
// split silently dropped every Hebrew word).
const WORD_SPLIT = /[^a-zא-ת]+/;

function findBestFoodMatch(text: string): MatchableFood | null {
  const words = text
    .toLowerCase()
    .replace(/\bof\b/g, ' ')
    .split(WORD_SPLIT)
    .filter((w) => w.length > 2 && !UNIT_WORDS.some(({ pattern }) => pattern.test(w)) && !HEBREW_UNIT_WORDS.some(({ word }) => word === w));

  if (words.length === 0) return null;

  for (const w of words) {
    const synonymId = SYNONYM_TO_FOOD_ID[w];
    if (synonymId) {
      const match = MATCH_POOL.find((f) => f.id === synonymId);
      if (match) return match;
    }
  }

  let best: { food: MatchableFood; score: number } | null = null;
  for (const food of MATCH_POOL) {
    // .filter(Boolean) drops empty strings produced by trailing punctuation
    // (e.g. "Chicken Breast (cooked)" splits to [...,"cooked", ""]) — without
    // it, nw === "" makes `w.startsWith(nw)` true for every word, so the
    // first food in the array would spuriously "match" any query.
    const nameWords = food.name.toLowerCase().split(WORD_SPLIT).filter(Boolean);
    const nameHeWords = ('nameHe' in food ? food.nameHe : undefined)?.split(WORD_SPLIT).filter(Boolean) ?? [];
    const categoryWord = ('category' in food ? food.category : undefined)?.toLowerCase() ?? '';
    let score = 0;
    for (const w of words) {
      if (nameWords.some((nw) => nw === w) || nameHeWords.some((nw) => nw === w)) score += 2;
      else if (nameWords.some((nw) => nw.length >= 3 && (nw.startsWith(w) || w.startsWith(nw)))) score += 1;
      if (categoryWord === w) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { food, score };
    }
  }
  return best?.food ?? null;
}

/** Splits "two eggs, toast and a banana" into ["two eggs", "toast", "a banana"]. */
function splitMentions(input: string): string[] {
  return input
    .split(/,|\band\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseFoodPhrase(input: string): ParsedFoodMention[] {
  const segments = splitMentions(input);
  const results: ParsedFoodMention[] = [];

  for (const segment of segments) {
    const { quantity, rest } = extractQuantity(segment);
    const food = findBestFoodMatch(rest || segment);
    if (!food) continue;

    const unit = detectUnit(segment);
    const pieceOption = food.servingOptions.find((o) => o.unit === 'piece');
    let grams: number;
    if (unit === 'piece' && pieceOption) {
      grams = pieceOption.grams * quantity;
    } else if (unit === 'g') {
      grams = quantity;
    } else {
      grams = food.defaultServing.grams * quantity;
    }

    results.push({ raw: segment, food, quantity, grams: Math.round(grams) });
  }

  return results;
}
