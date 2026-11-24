import { askWithWebSearch, dailyResetLocalTime, GeminiError, type WebSource } from '@/services/geminiVision';
import { getGeminiKey } from '@/utils/geminiKey';
import { allRestaurants, dishesForRestaurant, makeDish } from '@/data/restaurants';
import { normalizeText } from '@/services/restaurantSearch';
import { useAppStore } from '@/store/useAppStore';
import type { DishReliability, NaturalnessInfo, NutritionFacts, Restaurant, RestaurantDish } from '@/types';

/**
 * The AI restaurant researcher. Gemini runs real Google searches (official
 * site, nutrition pages/PDFs, delivery-app menus) and returns a structured
 * menu with nutrition per dish and an honest reliability level. Results are
 * saved on the device, so a restaurant is researched once.
 *
 * Honesty guards applied here, not just asked of the model:
 * - "official" survives only if a live web search actually ran;
 * - a dish's source link is kept only if its site is among the pages the
 *   search really returned;
 * - numbers whose calories contradict their own macros are downgraded to "low".
 */

export interface ResearchRequest {
  /** What the user typed: a restaurant name, maybe with a dish. */
  query: string;
  /** Research (or verify) a restaurant that's already known. */
  restaurant?: Restaurant;
  /** Focus on one dish (e.g. "Big Mac") instead of the whole menu. */
  dishFocus?: string;
  /** Load more dishes: names already on the menu, to skip. */
  excludeDishNames?: string[];
}

export interface ResearchResult {
  restaurant: Restaurant;
  dishes: RestaurantDish[];
  sources: WebSource[];
  grounded: boolean;
  notes?: string;
}

export class ResearchError extends Error {
  constructor(
    message: string,
    public detail?: string,
    public needsApiKey = false,
  ) {
    super(message);
  }
}

interface RawDish {
  nameHe?: string;
  nameEn?: string;
  category?: string;
  description?: string;
  servingDescription?: string;
  servingSizeG?: number;
  weightKnown?: boolean;
  isDrink?: boolean;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  saturatedFatG?: number;
  sugarG?: number;
  sodiumMg?: number;
  reliability?: string;
  basis?: string;
  sourceUrl?: string;
  emoji?: string;
}

interface RawResearch {
  found?: boolean;
  notFoundReason?: string;
  restaurant?: {
    name?: string;
    nameHe?: string;
    categoryHe?: string;
    cuisine?: string[];
    emoji?: string;
    website?: string;
    branchesNote?: string;
    city?: string;
  };
  dishes?: RawDish[];
  notes?: string;
}

const SYSTEM_PROMPT = `You are a meticulous restaurant-nutrition researcher for an Israeli calorie-tracking app. Use Google Search — do several searches.

Process:
1. Identify the exact restaurant the user means (assume Israel unless clearly elsewhere). If it doesn't exist or you can't identify it, set found=false with a short Hebrew reason.
2. Find its official website and menu. Also use delivery-app menus (Wolt, 10bis/תן ביס, Mishloha/משלוחה), Google Maps menu photos and reviews to learn what the dishes contain and their sizes.
3. Search specifically for OFFICIAL nutrition information (e.g. "<restaurant> ערכים תזונתיים", "<restaurant> nutrition", nutrition PDF, allergen/nutrition pages). International chains in Israel often publish an Israeli nutrition table — prefer it over foreign data.
4. For every dish: if you found official per-dish numbers, copy them exactly and set reliability "official" with sourceUrl = the page you got them from. Otherwise estimate from the components (bun/bread, protein weight, cheese, sauces, oil for frying, side) and portion size, set reliability "estimated" and explain the breakdown briefly in basis (Hebrew). Use "low" when you are unsure what the dish contains or how big it is.
5. Calories must be consistent: calories ≈ 4×protein + 4×carbs + 9×fat. Values are for ONE serving as sold.
6. Never present a guess as official. Never invent a source URL.

Output: ONLY a JSON object inside a \`\`\`json code block, no other text, with this shape:
{
  "found": true,
  "notFoundReason": "",
  "restaurant": { "name": "English or official Latin name", "nameHe": "שם בעברית", "categoryHe": "e.g. המבורגרים / פיצה / בית קפה / סושי", "cuisine": ["Burger"], "emoji": "🍔", "website": "https://...", "branchesNote": "short Hebrew note about branches/locations", "city": "city or ארצי" },
  "dishes": [
    { "nameHe": "שם המנה בעברית", "nameEn": "English name", "category": "קטגוריה בתפריט (המבורגרים, שתייה...)", "description": "Hebrew: main ingredients", "servingDescription": "Hebrew, e.g. מנה / משולש / כוס", "servingSizeG": 250, "weightKnown": false, "isDrink": false, "calories": 650, "proteinG": 30, "carbsG": 50, "fatG": 35, "saturatedFatG": 12, "sugarG": 8, "sodiumMg": 1100, "reliability": "official|estimated|low", "basis": "Hebrew: where the numbers come from", "sourceUrl": "https://... (only for official)", "emoji": "🍔" }
  ],
  "notes": "Hebrew: one or two sentences about how reliable this research is overall"
}
servingSizeG is required (estimate it if not published, and then weightKnown=false). Omit saturatedFatG/sugarG/sodiumMg if unknown rather than guessing wildly.`;

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extractJson(text: string): RawResearch | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      return JSON.parse(c) as RawResearch;
    } catch {
      /* try next */
    }
  }
  return null;
}

const num = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function naturalnessFor(name: string, category: string): NaturalnessInfo {
  const t = `${name} ${category}`.toLowerCase();
  if (/(קולה|cola|משקה|soda|מיץ)/.test(t)) return { score: 10, reasons: ['Sweetened drink'] };
  if (/(קינוח|dessert|עוגה|עוגייה|גלידה|cake|cookie)/.test(t)) return { score: 15, reasons: ['Added sugar and fat'] };
  if (/(ציפס|צ׳יפס|fries|מטוגן|נאגטס|nuggets|טמפורה|tempura)/.test(t)) return { score: 28, reasons: ['Deep-fried'] };
  if (/(בורגר|burger|פיצה|pizza)/.test(t)) return { score: 25, reasons: ['Prepared dish with processed components'] };
  if (/(סלט|salad|שיפוד|skewer|grill|גריל|סשימי)/.test(t)) return { score: 70, reasons: ['Mostly whole ingredients'] };
  return { score: 45, reasons: ['Prepared restaurant dish'] };
}

/** Turns the model's raw output into app dishes, applying the honesty guards. */
function buildDishes(raw: RawDish[], restaurantId: string, grounded: boolean, sourceHosts: Set<string>): RestaurantDish[] {
  const out: RestaurantDish[] = [];
  const seen = new Set<string>();
  for (const d of raw) {
    const nameHe = (d.nameHe || d.nameEn || '').trim();
    const calories = num(d.calories);
    const proteinG = num(d.proteinG);
    const carbsG = num(d.carbsG);
    const fatG = num(d.fatG);
    if (!nameHe || calories === undefined || proteinG === undefined || carbsG === undefined || fatG === undefined) continue;
    if (calories > 5000) continue;
    const key = normalizeText(nameHe);
    if (seen.has(key)) continue;
    seen.add(key);

    let reliability: DishReliability = d.reliability === 'official' ? 'official' : d.reliability === 'low' ? 'low' : 'estimated';
    let basis = (d.basis || '').trim();
    let sourceUrl: string | undefined;

    if (reliability === 'official') {
      const host = d.sourceUrl ? hostOf(d.sourceUrl) : null;
      const hostSeen = !!host && [...sourceHosts].some((h) => h === host || host.endsWith(`.${h}`) || h.endsWith(`.${host}`));
      if (!grounded) {
        reliability = 'estimated';
        basis = `${basis ? `${basis} · ` : ''}החיפוש באינטרנט לא היה זמין — לא אומת מול מקור רשמי.`;
      } else if (hostSeen) {
        sourceUrl = d.sourceUrl;
      } else {
        // Claimed official but the source page wasn't among the search results we can verify.
        reliability = 'estimated';
        basis = `${basis ? `${basis} · ` : ''}המקור הרשמי לא אומת בתוצאות החיפוש.`;
      }
    }

    const implied = 4 * proteinG + 4 * carbsG + 9 * fatG;
    if (implied > 0 && Math.abs(calories - implied) / implied > 0.35) {
      reliability = 'low';
      basis = `${basis ? `${basis} · ` : ''}הקלוריות לא תואמות לחלבון/פחמימות/שומן — ייתכן שהנתונים שגויים.`;
    }

    const grams = num(d.servingSizeG) && d.servingSizeG! >= 5 ? d.servingSizeG! : 250;
    const perServing: NutritionFacts = {
      calories: Math.round(calories),
      proteinG,
      carbsG,
      fatG,
      ...(num(d.saturatedFatG) !== undefined ? { saturatedFatG: d.saturatedFatG } : {}),
      ...(num(d.sugarG) !== undefined ? { sugarG: d.sugarG } : {}),
      ...(num(d.sodiumMg) !== undefined ? { sodiumMg: d.sodiumMg } : {}),
    };
    const category = (d.category || 'מנות').trim();
    out.push(
      makeDish({
        id: `${restaurantId}--${hash(key)}`,
        restaurantId,
        nameHe,
        nameEn: d.nameEn && d.nameEn !== nameHe ? d.nameEn : undefined,
        menuCategory: category,
        emoji: d.emoji || '🍽️',
        perServing,
        grams,
        weightKnown: !!d.weightKnown && !!num(d.servingSizeG),
        unit: d.isDrink ? 'ml' : 'g',
        servingDescription: d.servingDescription || undefined,
        description: d.description || undefined,
        reliability,
        basis: basis || (reliability === 'official' ? 'מהמידע התזונתי הרשמי של המסעדה.' : 'הערכה לפי מרכיבים וגודל מנה.'),
        sourceUrl,
        naturalness: naturalnessFor(nameHe, category),
      }),
    );
  }
  return out;
}

function friendlyGeminiError(err: GeminiError): ResearchError {
  switch (err.kind) {
    case 'invalid_key':
      return new ResearchError('מפתח ה-Gemini נדחה — בדקו בהגדרות שהוא הועתק במלואו.', err.detail, true);
    case 'quota':
      return new ResearchError('הגעתם למגבלת השימוש החינמית של Gemini כרגע — נסו שוב בעוד דקה (או מחר, אם זו המגבלה היומית).', err.detail);
    case 'quota_daily':
      return new ResearchError(`המגבלה היומית החינמית של Gemini במפתח שלך נגמרה להיום. היא מתחדשת אוטומטית מחר בבוקר (בערך ב-${dailyResetLocalTime()}).`, err.detail);
    case 'overloaded':
      return new ResearchError('השרתים של Gemini עמוסים כרגע — נסו שוב בעוד דקה.', err.detail);
    case 'network':
      return new ResearchError('אין חיבור ל-Gemini או שהמחקר לקח יותר מדי זמן — בדקו את האינטרנט ונסו שוב.', err.detail);
    default:
      return new ResearchError('ה-AI לא הצליח להשלים את המחקר הפעם — נסו שוב.', err.detail);
  }
}

/** Finds a previously researched (or built-in) restaurant with this name, so research merges instead of duplicating. */
function existingByName(name: string, nameHe?: string): Restaurant | undefined {
  const a = normalizeText(name).replace(/\s/g, '');
  const b = normalizeText(nameHe ?? '').replace(/\s/g, '');
  return allRestaurants().find((r) =>
    [r.name, r.nameHe, ...(r.aliases ?? [])].some((n) => {
      const x = normalizeText(n ?? '').replace(/\s/g, '');
      return !!x && (x === a || (!!b && x === b));
    }),
  );
}

export async function researchRestaurant(req: ResearchRequest): Promise<ResearchResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new ResearchError('חוקר ה-AI צריך מפתח Gemini חינמי — הוסיפו אותו בהגדרות (לוקח דקה).', undefined, true);

  const target = req.restaurant ? `${req.restaurant.name}${req.restaurant.nameHe ? ` (${req.restaurant.nameHe})` : ''}` : req.query.trim();
  const parts = [`Restaurant to research: ${target}`];
  if (req.restaurant?.website) parts.push(`Official website (known): ${req.restaurant.website}`);
  if (req.dishFocus) {
    parts.push(`Focus on this dish: "${req.dishFocus}". Return that dish (and up to 3 closely related variants/sizes) only.`);
  } else if (req.excludeDishNames?.length) {
    parts.push(`Already have these dishes — return up to 20 OTHER popular dishes, not these: ${req.excludeDishNames.join(', ')}`);
  } else {
    parts.push('Return the restaurant and up to 20 of its most popular dishes across the menu categories (mains, sides, desserts, drinks).');
  }

  let answer;
  try {
    answer = await askWithWebSearch(apiKey, SYSTEM_PROMPT, parts.join('\n'));
  } catch (err) {
    if (err instanceof GeminiError) throw friendlyGeminiError(err);
    throw new ResearchError('משהו השתבש במחקר — נסו שוב.', String(err));
  }

  const raw = extractJson(answer.text);
  if (!raw) throw new ResearchError('ה-AI החזיר תשובה בפורמט לא צפוי — נסו שוב.', answer.text.slice(0, 300));
  if (raw.found === false && !req.restaurant) {
    throw new ResearchError(raw.notFoundReason?.trim() || 'לא הצלחתי לזהות מסעדה בשם הזה. נסו לכתוב את השם המדויק, ואולי גם עיר.');
  }

  const info = raw.restaurant ?? {};
  const existing = req.restaurant ?? existingByName(info.name || target, info.nameHe);
  const id = existing?.id ?? `ai-${hash(normalizeText(info.name || info.nameHe || target))}`;

  const sourceHosts = new Set(
    answer.sources.flatMap((s) => [s.title.toLowerCase().replace(/^www\./, ''), hostOf(s.url) ?? '']).filter((h) => h && !h.includes('vertexaisearch')),
  );
  const dishes = buildDishes(raw.dishes ?? [], id, answer.grounded, sourceHosts);
  if (dishes.length === 0) {
    throw new ResearchError(
      req.dishFocus ? `לא מצאתי מידע על "${req.dishFocus}" במסעדה הזו.` : 'מצאתי את המסעדה אבל לא הצלחתי לבנות תפריט עם ערכים — נסו שוב.',
      answer.text.slice(0, 300),
    );
  }

  const website = info.website && hostOf(info.website) ? info.website : existing?.website;
  const restaurant: Restaurant = {
    ...(existing ?? {}),
    id,
    name: existing?.name ?? (info.name || info.nameHe || target),
    nameHe: existing?.nameHe ?? info.nameHe,
    aliases: existing?.aliases ?? [target],
    city: existing?.city ?? (info.city || 'ארצי'),
    cuisine: existing?.cuisine ?? (info.cuisine?.length ? info.cuisine : ['Restaurant']),
    categoryHe: existing?.categoryHe ?? info.categoryHe,
    imageEmoji: existing?.imageEmoji ?? (info.emoji || '🍽️'),
    brandColor: existing?.brandColor ?? 'from-primary-600 to-primary-400',
    website,
    branchesNote: existing?.branchesNote ?? info.branchesNote,
    origin: existing?.origin === 'builtin' ? 'builtin' : 'ai',
    researchedAt: new Date().toISOString(),
    sources: answer.sources,
    grounded: answer.grounded,
    dishIds: dishes.map((d) => d.id),
  };

  useAppStore.getState().saveResearchedRestaurant({ restaurant, dishes });
  return { restaurant, dishes, sources: answer.sources, grounded: answer.grounded, notes: raw.notes };
}

/** Names already on a restaurant's menu (for "load more dishes"). */
export function menuDishNames(restaurantId: string): string[] {
  return dishesForRestaurant(restaurantId).map((d) => d.nameHe || d.name);
}
