import type { DishReliability, NaturalnessInfo, NutritionFacts, Restaurant, RestaurantDish, ServingOption } from '@/types';
import { useAppStore } from '@/store/useAppStore';

const serving = (label: string, unit: ServingOption['unit'], grams: number): ServingOption => ({
  label,
  unit,
  grams,
});

const nat = (score: number, reasons: string[]): NaturalnessInfo => ({ score, reasons });

/**
 * Original fictional demo restaurants — no longer listed or searchable, but
 * kept resolvable by id so diary entries logged from them still open.
 *
 * Demo restaurant + dish database. Restaurant nutrition is inherently less
 * reliable than packaged/whole foods (recipes vary by branch, chef,
 * portion), so most dishes are flagged nutritionReliable: false and shown
 * with an "Estimated" data-quality badge in the UI.
 */
const DEMO_RESTAURANTS: Restaurant[] = [
  {
    id: 'r-pizzeria-roma',
    name: 'Pizzeria Roma',
    city: 'Tel Aviv',
    cuisine: ['Italian', 'Pizza'],
    imageEmoji: '🍕',
    rating: 4.5,
    priceLevel: 2,
    dishIds: ['d-pizza-margherita', 'd-pizza-pepperoni', 'd-tiramisu'],
  },
  {
    id: 'r-burger-house',
    name: 'Burger House',
    city: 'Tel Aviv',
    cuisine: ['Burger', 'American'],
    imageEmoji: '🍔',
    rating: 4.3,
    priceLevel: 2,
    dishIds: ['d-classic-burger', 'd-cheese-fries'],
  },
  {
    id: 'r-sushi-bar',
    name: 'Sushi Bar Tokyo',
    city: 'Herzliya',
    cuisine: ['Asian', 'Sushi'],
    imageEmoji: '🍣',
    rating: 4.7,
    priceLevel: 3,
    dishIds: ['d-salmon-roll', 'd-california-roll'],
  },
  {
    id: 'r-hummus-eliyahu',
    name: 'Hummus Eliyahu',
    city: 'Jaffa',
    cuisine: ['Israeli', 'Middle Eastern'],
    imageEmoji: '🧆',
    rating: 4.8,
    priceLevel: 1,
    dishIds: ['d-hummus-plate', 'd-falafel-pita'],
  },
  {
    id: 'r-golden-dragon',
    name: 'Golden Dragon',
    city: 'Ramat Gan',
    cuisine: ['Asian', 'Chinese'],
    imageEmoji: '🥡',
    rating: 4.2,
    priceLevel: 2,
    dishIds: ['d-fried-rice', 'd-sweet-sour-chicken'],
  },
];

const DEMO_DISHES: RestaurantDish[] = [
  {
    id: 'd-pizza-margherita',
    name: 'Pizza Margherita',
    restaurantId: 'r-pizzeria-roma',
    imageEmoji: '🍕',
    price: 58,
    currency: '₪',
    per100g: { calories: 266, proteinG: 11, carbsG: 33, fatG: 10, fiberG: 2, sugarG: 3, sodiumMg: 598 },
    servingOptions: [
      serving('1 slice (110g)', 'piece', 110),
      serving('2 slices (220g)', 'serving', 220),
      serving('Half pizza (300g)', 'serving', 300),
      serving('Whole pizza (600g)', 'serving', 600),
    ],
    defaultServing: serving('2 slices (220g)', 'serving', 220),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(32, ['Made with several processed ingredients (dough, cheese, sauce)', 'A prepared, baked dish rather than a whole food', 'Contains refined flour']),
  },
  {
    id: 'd-pizza-pepperoni',
    name: 'Pizza Pepperoni',
    restaurantId: 'r-pizzeria-roma',
    imageEmoji: '🍕',
    price: 64,
    currency: '₪',
    per100g: { calories: 298, proteinG: 13, carbsG: 31, fatG: 14, fiberG: 2, sugarG: 3, sodiumMg: 720 },
    servingOptions: [
      serving('1 slice (115g)', 'piece', 115),
      serving('2 slices (230g)', 'serving', 230),
      serving('Whole pizza (620g)', 'serving', 620),
    ],
    defaultServing: serving('2 slices (230g)', 'serving', 230),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(24, ['Includes a processed, cured meat topping', 'Made with several processed ingredients', 'A prepared, multi-ingredient dish']),
  },
  {
    id: 'd-tiramisu',
    name: 'Tiramisu',
    restaurantId: 'r-pizzeria-roma',
    imageEmoji: '🍰',
    price: 34,
    currency: '₪',
    per100g: { calories: 283, proteinG: 5, carbsG: 29, fatG: 16, fiberG: 1, sugarG: 22, sodiumMg: 80 },
    servingOptions: [serving('1 slice (120g)', 'serving', 120)],
    defaultServing: serving('1 slice (120g)', 'serving', 120),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(18, ['Multiple processed ingredients (sugar, cream, cocoa, alcohol)', 'A formulated dessert rather than a whole food', 'Contains added sugar']),
  },
  {
    id: 'd-classic-burger',
    name: 'Classic Cheeseburger',
    restaurantId: 'r-burger-house',
    imageEmoji: '🍔',
    price: 52,
    currency: '₪',
    per100g: { calories: 280, proteinG: 15, carbsG: 22, fatG: 15, fiberG: 1.5, sugarG: 4, sodiumMg: 560 },
    servingOptions: [serving('Regular (250g)', 'serving', 250), serving('Double (400g)', 'serving', 400)],
    defaultServing: serving('Regular (250g)', 'serving', 250),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(22, ['Combines a processed bun, cheese, and sauces', 'Several prepared components', 'Contains processed cheese']),
  },
  {
    id: 'd-cheese-fries',
    name: 'Cheese Fries',
    restaurantId: 'r-burger-house',
    imageEmoji: '🍟',
    price: 28,
    currency: '₪',
    per100g: { calories: 312, proteinG: 6, carbsG: 35, fatG: 16, fiberG: 3, sugarG: 1, sodiumMg: 420 },
    servingOptions: [serving('Regular (200g)', 'serving', 200), serving('Large (350g)', 'serving', 350)],
    defaultServing: serving('Regular (200g)', 'serving', 200),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(16, ['Deep-fried potato product', 'Processed cheese topping', 'A highly prepared snack dish']),
  },
  {
    id: 'd-salmon-roll',
    name: 'Salmon Roll (8pc)',
    restaurantId: 'r-sushi-bar',
    imageEmoji: '🍣',
    price: 46,
    currency: '₪',
    per100g: { calories: 156, proteinG: 9, carbsG: 22, fatG: 3.5, fiberG: 1, sugarG: 3, sodiumMg: 320 },
    servingOptions: [serving('8 pieces (240g)', 'serving', 240), serving('4 pieces (120g)', 'serving', 120)],
    defaultServing: serving('8 pieces (240g)', 'serving', 240),
    dataQuality: 'estimated',
    nutritionReliable: true,
    naturalness: nat(58, ['Built around a whole-food ingredient (salmon)', 'Rice is refined but simply prepared', 'Some processed components (nori, sauce)']),
  },
  {
    id: 'd-california-roll',
    name: 'California Roll (8pc)',
    restaurantId: 'r-sushi-bar',
    imageEmoji: '🍣',
    price: 42,
    currency: '₪',
    per100g: { calories: 141, proteinG: 5, carbsG: 24, fatG: 3, fiberG: 1.5, sugarG: 3, sodiumMg: 300 },
    servingOptions: [serving('8 pieces (230g)', 'serving', 230)],
    defaultServing: serving('8 pieces (230g)', 'serving', 230),
    dataQuality: 'estimated',
    nutritionReliable: true,
    naturalness: nat(40, ['Contains imitation crab, a processed ingredient', 'A mayo-based sauce is typically added', 'Rice is refined']),
  },
  {
    id: 'd-hummus-plate',
    name: 'Hummus Plate',
    restaurantId: 'r-hummus-eliyahu',
    imageEmoji: '🥙',
    price: 32,
    currency: '₪',
    per100g: { calories: 210, proteinG: 8, carbsG: 16, fatG: 13, fiberG: 5, sugarG: 0.5, sodiumMg: 380 },
    servingOptions: [serving('Regular plate (250g)', 'serving', 250), serving('Large plate (400g)', 'serving', 400)],
    defaultServing: serving('Regular plate (250g)', 'serving', 250),
    dataQuality: 'estimated',
    nutritionReliable: true,
    naturalness: nat(65, ['Made from a few recognizable ingredients', 'A blended preparation rather than a whole food', 'Minimal industrial processing']),
  },
  {
    id: 'd-falafel-pita',
    name: 'Falafel Pita',
    restaurantId: 'r-hummus-eliyahu',
    imageEmoji: '🧆',
    price: 24,
    currency: '₪',
    per100g: { calories: 250, proteinG: 9, carbsG: 30, fatG: 11, fiberG: 5, sugarG: 2, sodiumMg: 430 },
    servingOptions: [serving('1 pita (280g)', 'serving', 280)],
    defaultServing: serving('1 pita (280g)', 'serving', 280),
    dataQuality: 'estimated',
    nutritionReliable: true,
    naturalness: nat(42, ['Falafel is fried', 'Several components (falafel, pita, sauces)', 'Pita is made from refined flour']),
  },
  {
    id: 'd-fried-rice',
    name: 'Vegetable Fried Rice',
    restaurantId: 'r-golden-dragon',
    imageEmoji: '🍛',
    price: 38,
    currency: '₪',
    per100g: { calories: 175, proteinG: 4, carbsG: 28, fatG: 5, fiberG: 1.5, sugarG: 2, sodiumMg: 450 },
    servingOptions: [serving('Regular (300g)', 'serving', 300), serving('Large (450g)', 'serving', 450)],
    defaultServing: serving('Regular (300g)', 'serving', 300),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(38, ['Refined rice, stir-fried with oil and sauces', 'Multiple added seasonings', 'A prepared dish rather than a whole food']),
  },
  {
    id: 'd-sweet-sour-chicken',
    name: 'Sweet & Sour Chicken',
    restaurantId: 'r-golden-dragon',
    imageEmoji: '🍗',
    price: 46,
    currency: '₪',
    per100g: { calories: 215, proteinG: 12, carbsG: 24, fatG: 8, fiberG: 1, sugarG: 15, sodiumMg: 480 },
    servingOptions: [serving('Regular (350g)', 'serving', 350)],
    defaultServing: serving('Regular (350g)', 'serving', 350),
    dataQuality: 'estimated',
    nutritionReliable: false,
    naturalness: nat(28, ['Sauce contains added sugar', 'Chicken is typically breaded and fried', 'Several processed components']),
  },
];


// ---------------------------------------------------------------------------
// Real restaurant chains (built-in)
//
// Honest provenance: none of these numbers were verified against the Israeli
// restaurants. International chains publish nutrition abroad, but Israeli
// franchises use local (often kosher) recipes and portion sizes, so every
// built-in value is an ESTIMATE ('estimated') with an explanation. The AI
// researcher (services/restaurantResearch.ts) can look up official figures on
// the web; only numbers it actually finds in an official source become
// 'official'.
// ---------------------------------------------------------------------------

export const BASIS_INTL = 'הערכה לפי הנתונים שהרשת מפרסמת בחו״ל ומתכון אופייני — המתכון והגודל בסניפים בישראל עשויים להיות שונים.';
export const BASIS_RECIPE = 'הערכה לפי מרכיבים, גודל מנה ושיטת הכנה אופייניים.';

const NAT: Record<string, NaturalnessInfo> = {
  burger: nat(22, ['Processed bun, sauces and cheese', 'Several prepared components']),
  fried: nat(28, ['Deep-fried', 'Processed product']),
  pizza: nat(30, ['Refined-flour dough with cheese and sauce', 'A prepared, baked dish']),
  sushi: nat(50, ['Seasoned white rice with fish/vegetables', 'Lightly processed']),
  grill: nat(70, ['Grilled meat, few ingredients', 'Some added fat and spices']),
  salad: nat(75, ['Mostly fresh vegetables', 'Dressing and cheese add processing']),
  sandwich: nat(40, ['Refined bread with fillings', 'Several prepared components']),
  coffee: nat(60, ['Milk and coffee', 'Sweetened versions add sugar']),
  dessert: nat(15, ['Added sugar and fat', 'Formulated dessert']),
  drink: nat(10, ['Sweetened soft drink']),
  zero: nat(20, ['Artificially sweetened drink']),
  side: nat(45, ['Prepared side dish']),
};

type Seed = [
  key: string,
  nameHe: string,
  nameEn: string,
  menuCategory: string,
  emoji: string,
  macros: [kcal: number, protein: number, carbs: number, fat: number, satFat?: number, sugar?: number, sodium?: number],
  grams: number,
  natKey: keyof typeof NAT,
  extra?: { desc?: string; serving?: string; unit?: 'g' | 'ml'; basis?: string },
];

function per100From(perServing: NutritionFacts, grams: number): NutritionFacts {
  const k = 100 / grams;
  const r = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * k * 100) / 100);
  return {
    calories: Math.round(perServing.calories * k * 100) / 100,
    proteinG: r(perServing.proteinG)!,
    carbsG: r(perServing.carbsG)!,
    fatG: r(perServing.fatG)!,
    ...(perServing.saturatedFatG !== undefined ? { saturatedFatG: r(perServing.saturatedFatG) } : {}),
    ...(perServing.sugarG !== undefined ? { sugarG: r(perServing.sugarG) } : {}),
    ...(perServing.sodiumMg !== undefined ? { sodiumMg: r(perServing.sodiumMg) } : {}),
  };
}

const RELIABILITY_TO_QUALITY: Record<DishReliability, RestaurantDish['dataQuality']> = {
  official: 'verified',
  estimated: 'estimated',
  low: 'ai_estimate',
};

/** Builds a dish from per-serving numbers. Serving options are fractions/multiples of one serving, so 1 serving always shows the exact listed values. */
export function makeDish(input: {
  id: string;
  restaurantId: string;
  nameHe: string;
  nameEn?: string;
  menuCategory: string;
  emoji: string;
  perServing: NutritionFacts;
  grams: number;
  weightKnown: boolean;
  unit?: 'g' | 'ml';
  servingDescription?: string;
  description?: string;
  reliability: DishReliability;
  basis: string;
  sourceUrl?: string;
  naturalness: NaturalnessInfo;
}): RestaurantDish {
  const g = Math.max(1, Math.round(input.grams));
  const unit = input.unit ?? 'g';
  const unitLabel = unit === 'ml' ? 'מ״ל' : 'גרם';
  const base = input.servingDescription || 'מנה';
  const sizeLabel = input.weightKnown ? ` (${g} ${unitLabel})` : '';
  const one: ServingOption = { label: `1 ${base}${sizeLabel}`, unit: 'serving', grams: g };
  const servingOptions: ServingOption[] = [
    { label: `½ ${base}`, unit: 'serving', grams: Math.round(g / 2) },
    one,
    { label: `2 × ${base}`, unit: 'serving', grams: g * 2 },
  ];
  return {
    id: input.id,
    name: input.nameHe,
    nameHe: input.nameHe,
    aliases: input.nameEn ? [input.nameEn] : undefined,
    restaurantId: input.restaurantId,
    imageEmoji: input.emoji,
    per100g: per100From(input.perServing, g),
    perServing: input.perServing,
    servingOptions,
    defaultServing: one,
    weightKnown: input.weightKnown,
    servingDescription: input.servingDescription,
    menuCategory: input.menuCategory,
    description: input.description,
    reliability: input.reliability,
    basis: input.basis,
    sourceUrl: input.sourceUrl,
    dataQuality: RELIABILITY_TO_QUALITY[input.reliability],
    nutritionReliable: input.reliability === 'official',
    naturalness: input.naturalness,
  };
}

function chain(
  r: Omit<Restaurant, 'dishIds' | 'origin'> & { defaultBasis: string },
  seeds: Seed[],
): { restaurant: Restaurant; dishes: RestaurantDish[] } {
  const dishes = seeds.map(([key, nameHe, nameEn, menuCategory, emoji, m, grams, natKey, extra]) =>
    makeDish({
      id: `${r.id}-${key}`,
      restaurantId: r.id,
      nameHe,
      nameEn,
      menuCategory,
      emoji,
      perServing: {
        calories: m[0],
        proteinG: m[1],
        carbsG: m[2],
        fatG: m[3],
        ...(m[4] !== undefined ? { saturatedFatG: m[4] } : {}),
        ...(m[5] !== undefined ? { sugarG: m[5] } : {}),
        ...(m[6] !== undefined ? { sodiumMg: m[6] } : {}),
      },
      grams,
      weightKnown: false,
      unit: extra?.unit,
      servingDescription: extra?.serving,
      description: extra?.desc,
      reliability: 'estimated',
      basis: extra?.basis ?? r.defaultBasis,
      naturalness: NAT[natKey],
    }),
  );
  const { defaultBasis: _ignored, ...rest } = r;
  void _ignored;
  return { restaurant: { ...rest, origin: 'builtin', dishIds: dishes.map((d) => d.id) }, dishes };
}

const COKE: Seed = ['coke', 'קוקה קולה (בינוני)', 'Coca-Cola', 'שתייה', '🥤', [210, 0, 53, 0, 0, 53, 10], 500, 'drink', { unit: 'ml', serving: 'כוס', basis: 'לפי הערכים על בקבוק קוקה קולה (42 קק״ל ל-100 מ״ל), 500 מ״ל.' }];
const COKE_ZERO: Seed = ['coke-zero', 'קוקה קולה זירו', 'Coke Zero', 'שתייה', '🥤', [1, 0, 0, 0, 0, 0, 40], 500, 'zero', { unit: 'ml', serving: 'כוס', basis: 'משקה ללא סוכר — כמעט ללא קלוריות.' }];

const BUILTIN = [
  chain(
    { id: 'mcdonalds', name: "McDonald's", nameHe: 'מקדונלד׳ס', aliases: ['מקדונלדס', 'מקדונלד', 'mcdonalds', 'mc donalds', 'מק'], city: 'ארצי', cuisine: ['Burger', 'Fast food'], categoryHe: 'המבורגרים · מזון מהיר', imageEmoji: '🍔', brandColor: 'from-red-500 to-yellow-400', website: 'https://www.mcdonalds.co.il', branchesNote: 'עשרות סניפים בכל הארץ, חלקם כשרים', defaultBasis: BASIS_INTL },
    [
      ['big-mac', 'ביג מק', 'Big Mac', 'המבורגרים', '🍔', [590, 25, 46, 34, 11, 9, 1050], 219, 'burger', { desc: 'שתי קציצות בקר, רוטב ביג מק, חסה, בצל, מלפפון חמוץ, לחמניית שומשום' }],
      ['quarter', 'רבע פאונדר', 'Quarter Pounder', 'המבורגרים', '🍔', [520, 30, 42, 26, 12, 10, 1140], 202, 'burger', { desc: 'קציצת בקר ¼ פאונד, בצל, חמוצים, קטשופ וחרדל' }],
      ['cheeseburger', 'צ׳יזבורגר', 'Cheeseburger', 'המבורגרים', '🍔', [300, 15, 32, 13, 6, 7, 720], 114, 'burger'],
      ['hamburger', 'המבורגר', 'Hamburger', 'המבורגרים', '🍔', [250, 12, 31, 9, 3.5, 6, 510], 100, 'burger'],
      ['mcchicken', 'מקצ׳יקן', 'McChicken', 'עוף', '🍗', [400, 14, 39, 21, 3.5, 5, 560], 143, 'fried', { desc: 'שניצל עוף מטוגן, חסה, מיונז' }],
      ['nuggets-9', 'מקנאגטס 9 יח׳', 'Chicken McNuggets 9', 'עוף', '🍗', [380, 21, 23, 22, 4, 0, 750], 145, 'fried', { serving: 'מנה (9 יח׳)' }],
      ['fries-m', 'צ׳יפס בינוני', 'Medium Fries', 'תוספות', '🍟', [320, 5, 43, 15, 2, 0, 260], 111, 'fried'],
      ['fries-l', 'צ׳יפס גדול', 'Large Fries', 'תוספות', '🍟', [480, 7, 65, 23, 3, 0, 390], 168, 'fried'],
      ['mcflurry', 'מקפלורי אוראו', 'McFlurry Oreo', 'קינוחים', '🍦', [510, 12, 80, 16, 8, 64, 260], 285, 'dessert'],
      COKE,
      COKE_ZERO,
    ],
  ),
  chain(
    { id: 'burger-king', name: 'Burger King', nameHe: 'בורגר קינג', aliases: ['burgerking', 'bk', 'בי קיי'], city: 'ארצי', cuisine: ['Burger', 'Fast food'], categoryHe: 'המבורגרים · מזון מהיר', imageEmoji: '👑', brandColor: 'from-orange-500 to-amber-400', website: 'https://www.burgerking.co.il', branchesNote: 'סניפים בכל הארץ', defaultBasis: BASIS_INTL },
    [
      ['whopper', 'וופר', 'Whopper', 'המבורגרים', '🍔', [660, 28, 49, 40, 12, 11, 980], 270, 'burger', { desc: 'קציצת בקר על האש, עגבנייה, חסה, בצל, חמוצים, מיונז וקטשופ' }],
      ['double-whopper', 'דאבל וופר', 'Double Whopper', 'המבורגרים', '🍔', [920, 48, 49, 58, 20, 11, 1050], 354, 'burger'],
      ['whopper-jr', 'וופר ג׳וניור', 'Whopper Jr', 'המבורגרים', '🍔', [330, 14, 28, 18, 5, 6, 470], 150, 'burger'],
      ['chicken-royale', 'צ׳יקן רויאל', 'Chicken Royale', 'עוף', '🍗', [570, 25, 48, 31, 4, 5, 1100], 210, 'fried'],
      ['nuggets-8', 'נאגטס 8 יח׳', 'Chicken Nuggets 8', 'עוף', '🍗', [360, 18, 22, 22, 3.5, 0, 690], 128, 'fried', { serving: 'מנה (8 יח׳)' }],
      ['fries-m', 'צ׳יפס בינוני', 'Medium Fries', 'תוספות', '🍟', [380, 4, 53, 17, 2.5, 0.5, 570], 116, 'fried'],
      ['onion-rings', 'טבעות בצל (בינוני)', 'Onion Rings', 'תוספות', '🧅', [410, 5, 51, 21, 3.5, 6, 690], 117, 'fried'],
      COKE,
      COKE_ZERO,
    ],
  ),
  chain(
    { id: 'kfc', name: 'KFC', nameHe: 'KFC', aliases: ['קיי אף סי', 'קנטקי', 'kentucky'], city: 'ארצי', cuisine: ['Chicken', 'Fast food'], categoryHe: 'עוף מטוגן · מזון מהיר', imageEmoji: '🍗', brandColor: 'from-red-600 to-red-400', website: 'https://www.kfc.co.il', branchesNote: 'סניפים במרכז ובערים הגדולות', defaultBasis: BASIS_INTL },
    [
      ['breast', 'חזה עוף במתכון המקורי', 'Original Recipe Breast', 'עוף', '🍗', [390, 39, 11, 21, 4, 0, 1190], 175, 'fried', { serving: 'חתיכה' }],
      ['drumstick', 'שוק עוף במתכון המקורי', 'Original Recipe Drumstick', 'עוף', '🍗', [130, 12, 4, 8, 1.5, 0, 430], 58, 'fried', { serving: 'חתיכה' }],
      ['tenders-3', 'סטריפס עוף 3 יח׳', 'Chicken Tenders 3', 'עוף', '🍗', [390, 33, 20, 20, 3, 0, 1150], 150, 'fried', { serving: 'מנה (3 יח׳)' }],
      ['zinger', 'זינגר בורגר', 'Zinger Burger', 'כריכים', '🍔', [480, 26, 45, 22, 3.5, 5, 1100], 200, 'fried'],
      ['popcorn', 'פופקורן צ׳יקן', 'Popcorn Chicken', 'עוף', '🍗', [400, 22, 23, 25, 4, 0, 1100], 130, 'fried'],
      ['fries', 'צ׳יפס', 'Fries', 'תוספות', '🍟', [320, 4, 41, 15, 2.5, 0, 600], 115, 'fried'],
      ['coleslaw', 'סלט כרוב (קולסלאו)', 'Coleslaw', 'תוספות', '🥗', [170, 1, 14, 12, 2, 10, 170], 113, 'side'],
      COKE,
    ],
  ),
  chain(
    { id: 'dominos', name: "Domino's Pizza", nameHe: 'דומינוס פיצה', aliases: ['דומינוס', 'dominos', 'domino'], city: 'ארצי', cuisine: ['Pizza'], categoryHe: 'פיצה', imageEmoji: '🍕', brandColor: 'from-blue-600 to-red-500', website: 'https://www.dominos.co.il', branchesNote: 'משלוחים וסניפים בכל הארץ (כשר)', defaultBasis: BASIS_INTL },
    [
      ['classic-slice', 'פיצה קלאסית — משולש', 'Classic Cheese Pizza Slice', 'פיצות', '🍕', [290, 12, 36, 11, 5, 3, 640], 115, 'pizza', { serving: 'משולש', desc: 'משולש מפיצה משפחתית (1/8), רוטב עגבניות ומוצרלה' }],
      ['thin-slice', 'פיצה דקה — משולש', 'Thin Crust Slice', 'פיצות', '🍕', [210, 9, 20, 11, 5, 2, 450], 80, 'pizza', { serving: 'משולש' }],
      ['veggie-slice', 'פיצה עם ירקות — משולש', 'Veggie Pizza Slice', 'פיצות', '🍕', [270, 11, 37, 9, 4.5, 3, 600], 125, 'pizza', { serving: 'משולש', desc: 'פטריות, בצל, זיתים ופלפלים' }],
      ['extra-cheese-slice', 'פיצה אקסטרה גבינה — משולש', 'Extra Cheese Slice', 'פיצות', '🍕', [340, 15, 36, 15, 7.5, 3, 760], 125, 'pizza', { serving: 'משולש' }],
      ['family-pizza', 'פיצה משפחתית שלמה', 'Whole Family Pizza', 'פיצות', '🍕', [2320, 96, 288, 88, 40, 24, 5120], 920, 'pizza', { serving: 'פיצה (8 משולשים)' }],
      ['garlic-bread', 'לחם שום — מקל', 'Garlic Bread Stick', 'תוספות', '🥖', [120, 4, 15, 5, 2, 1, 190], 40, 'side', { serving: 'מקל' }],
      COKE,
    ],
  ),
  chain(
    { id: 'pizza-hut', name: 'Pizza Hut', nameHe: 'פיצה האט', aliases: ['פיצה הט', 'pizzahut', 'האט'], city: 'ארצי', cuisine: ['Pizza'], categoryHe: 'פיצה', imageEmoji: '🍕', brandColor: 'from-red-600 to-rose-400', website: 'https://www.pizzahut.co.il', branchesNote: 'סניפים ומשלוחים בכל הארץ (כשר)', defaultBasis: BASIS_INTL },
    [
      ['pan-slice', 'פיצה פאן — משולש', 'Pan Pizza Slice', 'פיצות', '🍕', [300, 12, 32, 14, 5, 3, 560], 112, 'pizza', { serving: 'משולש', desc: 'בצק פאן עבה, רוטב עגבניות ומוצרלה' }],
      ['thin-slice', 'פיצה דקה — משולש', "Thin 'N Crispy Slice", 'פיצות', '🍕', [220, 10, 23, 10, 4.5, 2, 500], 85, 'pizza', { serving: 'משולש' }],
      ['stuffed-slice', 'פיצה עם שוליים ממולאים — משולש', 'Stuffed Crust Slice', 'פיצות', '🍕', [350, 15, 37, 16, 7, 3, 820], 130, 'pizza', { serving: 'משולש' }],
      ['olive-slice', 'פיצה עם זיתים — משולש', 'Olive Pizza Slice', 'פיצות', '🍕', [310, 12, 32, 15, 5, 3, 650], 118, 'pizza', { serving: 'משולש' }],
      ['breadstick', 'מקל לחם', 'Breadstick', 'תוספות', '🥖', [140, 4, 19, 5, 1, 1, 250], 45, 'side', { serving: 'מקל' }],
      COKE,
    ],
  ),
  chain(
    { id: 'subway', name: 'Subway', nameHe: 'סאבוויי', aliases: ['סאבווי', 'סבוויי', 'subway'], city: 'ארצי', cuisine: ['Sandwich'], categoryHe: 'כריכים · סלטים', imageEmoji: '🥪', brandColor: 'from-green-600 to-yellow-400', website: 'https://www.subway.co.il', branchesNote: 'סניפים בכל הארץ (כשר)', defaultBasis: BASIS_INTL },
    [
      ['turkey-15', 'חזה הודו — 15 ס״מ', 'Turkey Breast 6"', 'סאבים 15 ס״מ', '🥪', [280, 18, 46, 3.5, 1, 7, 760], 220, 'sandwich', { serving: 'סאב 15 ס״מ', desc: 'לחם, חזה הודו, ירקות, בלי רטבים' }],
      ['teriyaki-15', 'עוף טריאקי — 15 ס״מ', 'Chicken Teriyaki 6"', 'סאבים 15 ס״מ', '🥪', [350, 25, 52, 4.5, 1, 16, 880], 250, 'sandwich', { serving: 'סאב 15 ס״מ' }],
      ['tuna-15', 'טונה — 15 ס״מ', 'Tuna 6"', 'סאבים 15 ס״מ', '🥪', [470, 20, 44, 24, 4.5, 6, 600], 240, 'sandwich', { serving: 'סאב 15 ס״מ', desc: 'סלט טונה במיונז, ירקות' }],
      ['steak-15', 'סטייק — 15 ס״מ', 'Steak 6"', 'סאבים 15 ס״מ', '🥪', [320, 23, 45, 6, 2, 7, 860], 240, 'sandwich', { serving: 'סאב 15 ס״מ' }],
      ['schnitzel-15', 'שניצל — 15 ס״מ', 'Schnitzel 6"', 'סאבים 15 ס״מ', '🥪', [420, 23, 52, 13, 2, 6, 900], 250, 'sandwich', { serving: 'סאב 15 ס״מ', basis: BASIS_RECIPE }],
      ['veggie-15', 'ירקות — 15 ס״מ', 'Veggie Delite 6"', 'סאבים 15 ס״מ', '🥪', [210, 9, 39, 2.5, 0.5, 5, 280], 170, 'sandwich', { serving: 'סאב 15 ס״מ' }],
      ['turkey-30', 'חזה הודו — 30 ס״מ', 'Turkey Breast Footlong', 'סאבים 30 ס״מ', '🥪', [560, 36, 92, 7, 2, 14, 1520], 440, 'sandwich', { serving: 'סאב 30 ס״מ' }],
      ['chicken-salad', 'סלט עוף', 'Chicken Salad', 'סלטים', '🥗', [160, 23, 10, 3, 1, 5, 520], 300, 'salad', { desc: 'בלי רוטב' }],
      ['cookie', 'עוגיית שוקולד צ׳יפס', 'Chocolate Chip Cookie', 'קינוחים', '🍪', [210, 2, 30, 10, 5, 18, 170], 45, 'dessert', { serving: 'עוגייה' }],
    ],
  ),
  chain(
    { id: 'aroma', name: 'Aroma Espresso Bar', nameHe: 'ארומה', aliases: ['ארומה ישראל', 'aroma', 'aroma israel', 'ארומה אספרסו בר'], city: 'ארצי', cuisine: ['Cafe'], categoryHe: 'בית קפה', imageEmoji: '☕', brandColor: 'from-stone-700 to-red-600', website: 'https://www.aroma.co.il', branchesNote: 'מאות סניפים בכל הארץ', defaultBasis: BASIS_RECIPE },
    [
      ['hafuch', 'הפוך רגיל', 'Cafe Latte (regular)', 'קפה', '☕', [155, 8, 12, 8.3, 5.2, 12, 110], 260, 'coffee', { unit: 'ml', serving: 'כוס', desc: 'אספרסו עם כ-250 מ״ל חלב 3%' }],
      ['hafuch-l', 'הפוך גדול', 'Cafe Latte (large)', 'קפה', '☕', [230, 12, 18, 12.5, 7.8, 18, 165], 390, 'coffee', { unit: 'ml', serving: 'כוס' }],
      ['ice-coffee', 'אייס קפה', 'Iced Coffee Slush', 'קפה', '🧋', [260, 4, 52, 4, 2.5, 48, 70], 400, 'coffee', { unit: 'ml', serving: 'כוס', desc: 'ברד קפה עם חלב וסוכר' }],
      ['hot-choc', 'שוקו חם', 'Hot Chocolate', 'קפה', '☕', [290, 10, 38, 11, 7, 34, 180], 300, 'coffee', { unit: 'ml', serving: 'כוס' }],
      ['omelette-sandwich', 'כריך חביתה', 'Omelette Sandwich', 'כריכים', '🥪', [560, 25, 58, 24, 6, 6, 950], 280, 'sandwich', { desc: 'לחמנייה, חביתה משתי ביצים, ירקות' }],
      ['tuna-sandwich', 'כריך טונה', 'Tuna Sandwich', 'כריכים', '🥪', [560, 30, 56, 22, 3.5, 5, 1100], 290, 'sandwich'],
      ['bulgarian-sandwich', 'כריך גבינה בולגרית', 'Bulgarian Cheese Sandwich', 'כריכים', '🥪', [520, 22, 56, 22, 10, 5, 1300], 270, 'sandwich'],
      ['salad', 'סלט ירקות עם גבינה בולגרית', 'Salad with Bulgarian Cheese', 'סלטים', '🥗', [350, 15, 18, 25, 9, 9, 900], 400, 'salad', { desc: 'ללא לחם, עם רוטב' }],
      ['croissant', 'קרואסון חמאה', 'Butter Croissant', 'מאפים', '🥐', [260, 5, 28, 14, 8, 5, 280], 60, 'dessert', { serving: 'יחידה' }],
      ['yeast-cake', 'עוגת שמרים שוקולד (פרוסה)', 'Chocolate Yeast Cake Slice', 'מאפים', '🍫', [380, 6, 48, 18, 8, 24, 200], 100, 'dessert', { serving: 'פרוסה' }],
    ],
  ),
  chain(
    { id: 'bbb', name: 'BBB', nameHe: 'BBB', aliases: ['בי בי בי', 'בורגרס בר', 'burgers bar', 'boutique burger bar'], city: 'ארצי', cuisine: ['Burger'], categoryHe: 'המבורגרים', imageEmoji: '🍔', brandColor: 'from-zinc-800 to-orange-500', website: 'https://www.bbb.co.il', branchesNote: 'סניפים בכל הארץ', defaultBasis: BASIS_RECIPE },
    [
      ['burger-160', 'המבורגר 160 גרם', 'Burger 160g', 'המבורגרים', '🍔', [680, 36, 48, 38, 13, 8, 1000], 300, 'burger', { desc: 'קציצת בקר 160 גרם (לפני צלייה), לחמנייה, ירקות ורוטב' }],
      ['burger-220', 'המבורגר 220 גרם', 'Burger 220g', 'המבורגרים', '🍔', [820, 45, 48, 49, 17, 8, 1150], 360, 'burger', { desc: 'קציצת בקר 220 גרם (לפני צלייה), לחמנייה, ירקות ורוטב' }],
      ['burger-300', 'המבורגר 300 גרם', 'Burger 300g', 'המבורגרים', '🍔', [1020, 58, 48, 64, 23, 8, 1350], 440, 'burger', { desc: 'קציצת בקר 300 גרם (לפני צלייה), לחמנייה, ירקות ורוטב' }],
      ['chicken-burger', 'צ׳יקן בורגר', 'Chicken Burger', 'המבורגרים', '🍗', [620, 35, 52, 28, 5, 6, 1100], 300, 'burger'],
      ['fries', 'צ׳יפס', 'Fries', 'תוספות', '🍟', [420, 5, 55, 20, 3, 0.5, 500], 150, 'fried'],
      ['onion-rings', 'טבעות בצל', 'Onion Rings', 'תוספות', '🧅', [450, 6, 50, 25, 4, 6, 700], 140, 'fried'],
      COKE,
    ],
  ),
  chain(
    { id: 'agadir', name: 'Agadir', nameHe: 'אגאדיר', aliases: ['agadir', 'אגדיר'], city: 'ארצי', cuisine: ['Burger', 'Bar'], categoryHe: 'המבורגרים · בר', imageEmoji: '🍔', brandColor: 'from-neutral-900 to-red-600', website: 'https://www.agadir.co.il', branchesNote: 'סניפים במרכז, בצפון ובדרום', defaultBasis: BASIS_RECIPE },
    [
      ['burger-160', 'המבורגר 160 גרם', 'Burger 160g', 'המבורגרים', '🍔', [690, 36, 50, 38, 13, 8, 1000], 300, 'burger'],
      ['burger-250', 'המבורגר 250 גרם', 'Burger 250g', 'המבורגרים', '🍔', [900, 50, 50, 56, 20, 8, 1250], 390, 'burger'],
      ['burger-350', 'המבורגר 350 גרם', 'Burger 350g', 'המבורגרים', '🍔', [1150, 68, 50, 75, 27, 8, 1500], 480, 'burger'],
      ['chicken-burger', 'צ׳יקן בורגר', 'Chicken Burger', 'המבורגרים', '🍗', [640, 36, 52, 30, 5, 6, 1100], 300, 'burger'],
      ['fries', 'צ׳יפס', 'Fries', 'תוספות', '🍟', [420, 5, 55, 20, 3, 0.5, 500], 150, 'fried'],
      ['sweet-potato-fries', 'צ׳יפס בטטה', 'Sweet Potato Fries', 'תוספות', '🍠', [400, 4, 52, 20, 3, 10, 400], 150, 'fried'],
    ],
  ),
  chain(
    { id: 'burgeranch', name: 'Burgeranch', nameHe: 'בורגראנץ׳', aliases: ['בורגרנץ', 'בורגראנץ', 'burger ranch', 'בורגר ראנץ'], city: 'ארצי', cuisine: ['Burger', 'Fast food'], categoryHe: 'המבורגרים · מזון מהיר', imageEmoji: '🍔', brandColor: 'from-red-700 to-orange-500', website: 'https://www.burgeranch.co.il', branchesNote: 'סניפים בכל הארץ', defaultBasis: BASIS_RECIPE },
    [
      ['burger-150', 'המבורגר 150 גרם', 'Burger 150g', 'המבורגרים', '🍔', [560, 30, 42, 30, 11, 7, 900], 260, 'burger'],
      ['burger-220', 'המבורגר 220 גרם', 'Burger 220g', 'המבורגרים', '🍔', [760, 44, 42, 46, 17, 7, 1100], 330, 'burger'],
      ['burger-300', 'המבורגר 300 גרם', 'Burger 300g', 'המבורגרים', '🍔', [960, 57, 42, 62, 23, 7, 1300], 410, 'burger'],
      ['chicken-burger', 'צ׳יקן בורגר', 'Chicken Burger', 'המבורגרים', '🍗', [580, 30, 50, 27, 4.5, 6, 1050], 260, 'burger'],
      ['nuggets', 'נאגטס 8 יח׳', 'Nuggets 8', 'עוף', '🍗', [380, 20, 22, 23, 4, 0, 750], 135, 'fried', { serving: 'מנה (8 יח׳)' }],
      ['fries', 'צ׳יפס בינוני', 'Medium Fries', 'תוספות', '🍟', [360, 4, 47, 17, 2.5, 0.5, 450], 125, 'fried'],
      ['onion-rings', 'טבעות בצל', 'Onion Rings', 'תוספות', '🧅', [400, 5, 46, 22, 3.5, 5, 650], 120, 'fried'],
      COKE,
    ],
  ),
  chain(
    { id: 'japanika', name: 'Japanika', nameHe: 'ג׳פניקה', aliases: ['גפניקה', "ג'פניקה", 'japanika', 'יפניקה'], city: 'ארצי', cuisine: ['Sushi', 'Asian'], categoryHe: 'סושי · אסייתי', imageEmoji: '🍣', brandColor: 'from-rose-600 to-neutral-800', website: 'https://www.japanika.net', branchesNote: 'עשרות סניפים בכל הארץ', defaultBasis: BASIS_RECIPE },
    [
      ['salmon-avocado-roll', 'סלמון אבוקדו רול (8 יח׳)', 'Salmon Avocado Roll', 'סושי', '🍣', [360, 15, 52, 10, 2, 8, 600], 230, 'sushi', { serving: 'רול (8 יח׳)', desc: 'אינסייד אאוט: סלמון, אבוקדו, אורז סושי' }],
      ['california-roll', 'קליפורניה רול (8 יח׳)', 'California Roll', 'סושי', '🍣', [360, 10, 55, 11, 2, 9, 800], 230, 'sushi', { serving: 'רול (8 יח׳)', desc: 'סורימי, מלפפון, אבוקדו' }],
      ['spicy-tuna-roll', 'ספייסי טונה רול (8 יח׳)', 'Spicy Tuna Roll', 'סושי', '🍣', [380, 16, 52, 12, 2, 8, 700], 230, 'sushi', { serving: 'רול (8 יח׳)' }],
      ['salmon-tempura-roll', 'סלמון טמפורה רול (8 יח׳)', 'Salmon Tempura Roll', 'סושי', '🍤', [480, 16, 58, 20, 4, 8, 800], 250, 'fried', { serving: 'רול (8 יח׳)' }],
      ['salmon-nigiri', 'ניגירי סלמון (2 יח׳)', 'Salmon Nigiri', 'סושי', '🍣', [130, 7, 18, 3, 0.5, 3, 200], 80, 'sushi', { serving: 'זוג' }],
      ['salmon-sashimi', 'סשימי סלמון (5 יח׳)', 'Salmon Sashimi', 'סושי', '🐟', [200, 20, 0, 13, 3, 0, 60], 100, 'grill', { serving: 'מנה (5 יח׳)' }],
      ['yakisoba', 'יאקיסובה עוף', 'Chicken Yakisoba', 'נודלס', '🍜', [650, 32, 85, 19, 3, 14, 1800], 450, 'side'],
      ['edamame', 'אדממה', 'Edamame', 'ראשונות', '🫛', [180, 17, 13, 8, 1, 3, 500], 150, 'salad'],
      ['miso', 'מרק מיסו', 'Miso Soup', 'ראשונות', '🍲', [40, 3, 5, 1, 0, 1, 800], 250, 'side', { unit: 'ml', serving: 'קערה' }],
    ],
  ),
  chain(
    { id: 'shipudei-hatikva', name: 'Shipudei Hatikva', nameHe: 'שיפודי התקווה', aliases: ['שיפודי התקוה', 'shipudei hatikva', 'שיפודי'], city: 'ארצי', cuisine: ['Grill', 'Israeli'], categoryHe: 'גריל · ישראלי', imageEmoji: '🍢', brandColor: 'from-amber-700 to-red-600', website: 'https://www.shipudei-hatikva.co.il', branchesNote: 'סניפים במרכז ובערים הגדולות', defaultBasis: BASIS_RECIPE },
    [
      ['pargit', 'שיפוד פרגית', 'Chicken Thigh Skewer', 'שיפודים', '🍢', [310, 38, 2, 16, 4.5, 1, 700], 150, 'grill', { serving: 'שיפוד (כ-150 גרם)' }],
      ['kebab', 'שיפוד קבב', 'Kebab Skewer', 'שיפודים', '🍢', [380, 25, 4, 30, 11, 1, 800], 150, 'grill', { serving: 'שיפוד (כ-150 גרם)' }],
      ['liver', 'שיפוד כבד עוף', 'Chicken Liver Skewer', 'שיפודים', '🍢', [260, 36, 1, 12, 3.5, 0, 500], 150, 'grill', { serving: 'שיפוד (כ-150 גרם)' }],
      ['hearts', 'שיפוד לבבות', 'Chicken Hearts Skewer', 'שיפודים', '🍢', [280, 40, 0, 13, 4, 0, 250], 150, 'grill', { serving: 'שיפוד (כ-150 גרם)' }],
      ['entrecote', 'שיפוד אנטריקוט', 'Entrecote Skewer', 'שיפודים', '🥩', [450, 36, 0, 34, 14, 0, 120], 150, 'grill', { serving: 'שיפוד (כ-150 גרם)' }],
      ['hummus', 'צלחת חומוס', 'Hummus Plate', 'ראשונות', '🥣', [500, 17, 40, 30, 4, 1, 900], 300, 'side', { desc: 'חומוס עם טחינה ושמן זית' }],
      ['pita', 'פיתה', 'Pita', 'לחמים', '🫓', [165, 5.5, 33, 0.7, 0.1, 1, 320], 60, 'side', { serving: 'פיתה' }],
      ['lafa', 'לאפה', 'Lafa', 'לחמים', '🫓', [300, 10, 60, 2, 0.5, 2, 600], 110, 'side', { serving: 'לאפה' }],
      ['fries', 'צ׳יפס', 'Fries', 'תוספות', '🍟', [380, 4, 50, 18, 2.5, 0.5, 450], 140, 'fried'],
      ['rice', 'אורז לבן', 'White Rice', 'תוספות', '🍚', [300, 5.5, 57, 5, 1, 0, 300], 200, 'side'],
    ],
  ),
  chain(
    { id: 'cofix', name: 'Cofix', nameHe: 'קופיקס', aliases: ['cofix', 'קופי קס'], city: 'ארצי', cuisine: ['Cafe'], categoryHe: 'בית קפה', imageEmoji: '☕', brandColor: 'from-pink-600 to-fuchsia-500', website: 'https://www.cofix.co.il', branchesNote: 'מאות סניפים בכל הארץ', defaultBasis: BASIS_RECIPE },
    [
      ['hafuch', 'הפוך', 'Cafe Latte', 'קפה', '☕', [120, 6, 9.5, 6.5, 4, 9.5, 85], 200, 'coffee', { unit: 'ml', serving: 'כוס', desc: 'אספרסו עם כ-200 מ״ל חלב 3%' }],
      ['ice-coffee', 'אייס קפה', 'Iced Coffee Slush', 'קפה', '🧋', [220, 3, 45, 3, 2, 42, 60], 350, 'coffee', { unit: 'ml', serving: 'כוס' }],
      ['croissant', 'קרואסון חמאה', 'Butter Croissant', 'מאפים', '🥐', [230, 4.5, 25, 12, 7, 4, 250], 55, 'dessert', { serving: 'יחידה' }],
      ['sandwich', 'כריך גבינה וירקות', 'Cheese & Veg Sandwich', 'כריכים', '🥪', [380, 16, 45, 14, 7, 5, 800], 190, 'sandwich'],
      ['cookie', 'עוגייה', 'Cookie', 'מאפים', '🍪', [200, 2.5, 27, 9.5, 5, 15, 150], 45, 'dessert', { serving: 'עוגייה' }],
    ],
  ),
];

/** The built-in, listed restaurants (real chains). */
export const RESTAURANTS: Restaurant[] = BUILTIN.map((b) => b.restaurant);
export const RESTAURANT_DISHES: RestaurantDish[] = BUILTIN.flatMap((b) => b.dishes);

// ---------------------------------------------------------------------------
// Lookup, merging in restaurants the user researched with AI (saved on device)
// ---------------------------------------------------------------------------

function researched() {
  return useAppStore.getState().researchedRestaurants;
}

function normName(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[\s"'׳״`’.,()\-–—]/g, '');
}

/** Every restaurant shown in the app: built-in chains plus AI-researched ones (a re-researched built-in chain is shown once, with the researched data). */
export function allRestaurants(): Restaurant[] {
  const extra = researched();
  const builtinIds = new Set(RESTAURANTS.map((r) => r.id));
  const overlays = new Map(extra.filter((x) => builtinIds.has(x.restaurant.id)).map((x) => [x.restaurant.id, x.restaurant]));
  return [
    ...RESTAURANTS.map((r) => (overlays.has(r.id) ? { ...r, ...overlays.get(r.id)!, origin: 'builtin' as const } : r)),
    ...extra.filter((x) => !builtinIds.has(x.restaurant.id)).map((x) => x.restaurant),
  ];
}

export function findRestaurantById(id: string): Restaurant | undefined {
  return allRestaurants().find((r) => r.id === id) ?? DEMO_RESTAURANTS.find((r) => r.id === id);
}

export function findDishById(id: string): RestaurantDish | undefined {
  for (const x of researched()) {
    const d = x.dishes.find((dd) => dd.id === id);
    if (d) return d;
  }
  return RESTAURANT_DISHES.find((d) => d.id === id) ?? DEMO_DISHES.find((d) => d.id === id);
}

/** A restaurant's menu. For a built-in chain that was researched, researched dishes replace built-in ones with the same name and new ones are added. */
export function dishesForRestaurant(restaurantId: string): RestaurantDish[] {
  const builtin = RESTAURANT_DISHES.filter((d) => d.restaurantId === restaurantId);
  const res = researched().find((x) => x.restaurant.id === restaurantId)?.dishes ?? [];
  if (res.length === 0) return builtin.length ? builtin : DEMO_DISHES.filter((d) => d.restaurantId === restaurantId);
  const researchedNames = new Set(res.flatMap((d) => [normName(d.nameHe), normName(d.name), ...(d.aliases ?? []).map(normName)]).filter(Boolean));
  const keptBuiltin = builtin.filter(
    (d) => !researchedNames.has(normName(d.nameHe)) && !(d.aliases ?? []).some((a) => researchedNames.has(normName(a))),
  );
  return [...res, ...keptBuiltin];
}

/** Every listed dish (for search and recommendations). */
export function allDishes(): RestaurantDish[] {
  return allRestaurants().flatMap((r) => dishesForRestaurant(r.id));
}
