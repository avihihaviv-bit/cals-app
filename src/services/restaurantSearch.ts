import { allDishes, allRestaurants, findRestaurantById } from '@/data/restaurants';
import type { Restaurant, RestaurantDish } from '@/types';

/**
 * Fast, on-device restaurant + dish search, Hebrew and English.
 *
 * Text is normalized (case, niqqud, final letters, apostrophes/geresh), each
 * query word is expanded with Hebrew↔English synonyms, and matched against
 * restaurant/dish names, aliases and categories by prefix — with a small typo
 * tolerance for longer words. A gram amount in the query ("המבורגר 200 גרם")
 * ranks dishes of that size first.
 */

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // niqqud / cantillation
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/["'׳״`’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Stored in normalized form (final letters folded: "עם" → "עמ"), so they compare equal to normalized query words.
const STOPWORDS = new Set(
  ['עם', 'של', 'ו', 'את', 'ב', 'with', 'and', 'the', 'a', 'of', 'in', 'גרם', 'גר', 'g', 'gr', 'grams', 'מנה', 'מנת', 'מסעדה', 'מסעדת', 'restaurant'].map(
    (w) => normalizeText(w),
  ),
);

// Each group lists interchangeable words (already normalized form is computed below).
const SYNONYM_GROUPS: string[][] = [
  ['burger', 'burgers', 'בורגר', 'המבורגר', 'המבורגרים', 'בורגרים', 'hamburger'],
  ['pizza', 'פיצה', 'פיצות', 'pizzas', 'slice', 'משולש'],
  ['fries', 'chips', 'ציפס', "צ'יפס", 'צ׳יפס', 'fry', 'french'],
  ['sushi', 'סושי', 'roll', 'רול', 'maki', 'מאקי'],
  ['salmon', 'סלמון', 'סלומון'],
  ['tuna', 'טונה'],
  ['chicken', 'עוף', 'ציקן', "צ'יקן", 'פרגית'],
  ['nuggets', 'נאגטס', 'מקנאגטס', 'mcnuggets'],
  ['coffee', 'קפה', 'הפוך', 'latte', 'cappuccino', 'קפוצינו', 'אספרסו', 'espresso'],
  ['salad', 'סלט', 'סלטים', 'salads'],
  ['sandwich', 'כריך', 'כריכים', 'סנדוויץ', 'סאב', 'sub', 'baguette', 'באגט'],
  ['skewer', 'שיפוד', 'שיפודים', 'skewers', 'kebab', 'קבב'],
  ['cheese', 'גבינה', 'גבינת', 'ציז', 'cheesy'],
  ['drink', 'שתייה', 'שתיה', 'משקה', 'cola', 'קולה', 'coke', 'soda'],
  ['dessert', 'קינוח', 'קינוחים', 'desserts', 'גלידה', 'ice', 'cream', 'עוגה', 'cake', 'עוגייה', 'cookie'],
  ['onion', 'בצל', 'טבעות'],
  ['steak', 'סטייק', 'אנטריקוט', 'entrecote'],
  ['noodles', 'נודלס', 'יאקיסובה', 'yakisoba', 'פד', 'pad'],
  ['hummus', 'חומוס'],
  ['croissant', 'קרואסון'],
];

const SYNONYMS = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const norm = group.map(normalizeText);
  for (const w of norm) {
    const set = SYNONYMS.get(w) ?? new Set<string>();
    norm.forEach((x) => set.add(x));
    SYNONYMS.set(w, set);
  }
}

function expand(token: string): string[] {
  return [...(SYNONYMS.get(token) ?? new Set([token]))];
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** How well one query word matches a set of words: the literal word scores higher than a synonym (1 / 0.9 exact, 0.85 / 0.75 prefix, 0.6 typo). */
function wordScore(queryToken: string, words: string[]): number {
  let best = 0;
  for (const q of expand(queryToken)) {
    const literal = q === queryToken;
    for (const w of words) {
      if (w === q) best = Math.max(best, literal ? 1 : 0.9);
      else if (q.length >= 2 && w.startsWith(q)) best = Math.max(best, literal ? 0.85 : 0.75);
      else if (literal && q.length >= 4 && w.length >= 4 && editDistanceAtMost1(q, w)) best = Math.max(best, 0.6);
    }
    if (best === 1) return 1;
  }
  return best;
}

function words(...parts: (string | undefined)[]): string[] {
  return normalizeText(parts.filter(Boolean).join(' ')).split(' ').filter(Boolean);
}

export interface ParsedQuery {
  tokens: string[];
  grams?: number;
}

export function parseQuery(raw: string): ParsedQuery {
  const norm = normalizeText(raw);
  let grams: number | undefined;
  const gm = raw.match(/(\d{2,4})\s*(?:גרם|גר׳?|גר'|g\b|gr\b|grams?)/i) ?? raw.match(/\b(\d{3})\b/);
  if (gm) grams = Number(gm[1]);
  const tokens = norm.split(' ').filter((t) => t && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return { tokens, grams };
}

export interface RestaurantHit {
  restaurant: Restaurant;
  score: number;
}
export interface DishHit {
  dish: RestaurantDish;
  restaurant?: Restaurant;
  score: number;
}
export interface SearchResults {
  restaurants: RestaurantHit[];
  dishes: DishHit[];
  parsed: ParsedQuery;
}

function restaurantWords(r: Restaurant): string[] {
  return words(r.name, r.nameHe, ...(r.aliases ?? []), r.categoryHe, ...r.cuisine);
}

function gramsInDish(d: RestaurantDish): number | undefined {
  const m = `${d.nameHe ?? ''} ${d.name} ${(d.aliases ?? []).join(' ')}`.match(/(\d{2,4})\s*(?:גרם|g\b)/i);
  return m ? Number(m[1]) : undefined;
}

export function searchRestaurants(raw: string, limits = { restaurants: 8, dishes: 30 }): SearchResults {
  const parsed = parseQuery(raw);
  const { tokens, grams } = parsed;
  if (tokens.length === 0 && !grams) return { restaurants: [], dishes: [], parsed };

  const restaurants = allRestaurants();
  // Words that aren't generic food words ("שמש" in "שמש בורגר", "big" in "big mac") are what identify a
  // specific place or dish — if the query has some, at least one of them must match.
  const distinctive = tokens.filter((t) => !SYNONYMS.has(t));
  const rWords = new Map(restaurants.map((r) => [r.id, restaurantWords(r)]));
  const rNameWords = new Map(restaurants.map((r) => [r.id, words(r.name, r.nameHe, ...(r.aliases ?? []))]));

  // Restaurants: average word score; a restaurant-name match counts more than a category match.
  const restaurantHits: RestaurantHit[] = [];
  for (const r of restaurants) {
    if (tokens.length === 0) break;
    const nameScores = tokens.map((t) => wordScore(t, rNameWords.get(r.id)!));
    const allScores = tokens.map((t) => wordScore(t, rWords.get(r.id)!));
    const nameAvg = nameScores.reduce((a, b) => a + b, 0) / tokens.length;
    const anyAvg = allScores.reduce((a, b) => a + b, 0) / tokens.length;
    const score = Math.max(nameAvg, anyAvg * 0.7);
    if (distinctive.length && !distinctive.some((t) => wordScore(t, rNameWords.get(r.id)!) > 0)) continue;
    if (score >= 0.5) restaurantHits.push({ restaurant: r, score });
  }
  restaurantHits.sort((a, b) => b.score - a.score);

  // Dishes: each query word may match the dish itself or its restaurant ("ארומה הפוך"),
  // but at least one word must match the dish itself.
  const dishHits: DishHit[] = [];
  for (const d of allDishes()) {
    const dWords = words(d.nameHe, d.name, ...(d.aliases ?? []), d.menuCategory, d.description);
    const restWords = rNameWords.get(d.restaurantId) ?? [];
    if (distinctive.length && !distinctive.some((t) => wordScore(t, dWords) > 0 || wordScore(t, restWords) > 0)) continue;
    let total = 0;
    let dishMatched = 0;
    for (const t of tokens) {
      const ds = wordScore(t, dWords);
      // A generic food word ("בורגר") matching a restaurant's name ("בורגר קינג") says nothing about the dish;
      // only distinctive words ("ארומה", "מקדונלדס") count when matched against the restaurant.
      const rs = SYNONYMS.has(t) ? 0 : wordScore(t, restWords);
      if (ds > 0) dishMatched++;
      total += Math.max(ds, rs);
    }
    let score = tokens.length ? total / tokens.length : 0.5;
    if (tokens.length && dishMatched === 0) continue;
    // "בורגר עם צ׳יפס": several food words — a dish matching any of them is relevant; matching all ranks first.
    const threshold = tokens.length >= 2 && distinctive.length === 0 ? 0.45 : 0.55;
    if (grams) {
      const g = gramsInDish(d);
      if (g !== undefined) {
        const diff = Math.abs(g - grams);
        score += diff <= 30 ? 0.4 - diff / 100 : -0.2;
      } else if (tokens.length === 0) continue;
    }
    if (score >= threshold) dishHits.push({ dish: d, restaurant: findRestaurantById(d.restaurantId), score });
  }
  // Several food words ("בורגר עם צ׳יפס"): places whose menu covers all of them come first.
  if (tokens.length >= 2) {
    const covered = new Map<string, Set<string>>();
    for (const h of dishHits) {
      const dWords = words(h.dish.nameHe, h.dish.name, ...(h.dish.aliases ?? []), h.dish.menuCategory);
      const set = covered.get(h.dish.restaurantId) ?? new Set<string>();
      tokens.forEach((t) => wordScore(t, dWords) >= 0.75 && set.add(t));
      covered.set(h.dish.restaurantId, set);
    }
    for (const h of dishHits) if ((covered.get(h.dish.restaurantId)?.size ?? 0) === tokens.length) h.score += 0.2;
  }
  // Equal scores: keep each restaurant's dishes together (its burger next to its fries), then lighter first.
  dishHits.sort(
    (a, b) =>
      Math.round((b.score - a.score) * 100) ||
      a.dish.restaurantId.localeCompare(b.dish.restaurantId) ||
      (a.dish.perServing?.calories ?? 0) - (b.dish.perServing?.calories ?? 0),
  );

  return { restaurants: restaurantHits.slice(0, limits.restaurants), dishes: dishHits.slice(0, limits.dishes), parsed };
}

/** The query minus words that matched a known restaurant — used to suggest what to research ("Big Mac" → dish, "מסעדת דוד" → restaurant). */
export function looksLikeRestaurantName(raw: string): boolean {
  const { tokens } = parseQuery(raw);
  if (tokens.length === 0) return false;
  // Generic food words alone ("סושי סלמון") are not a restaurant name.
  return tokens.some((t) => !SYNONYMS.has(t));
}
