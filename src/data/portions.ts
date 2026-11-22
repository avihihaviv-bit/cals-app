import type { FoodItem } from '@/types';

/**
 * Standard household measures, so amounts come from a fixed table instead of
 * the AI's weight guess. The AI only has to say WHAT and HOW MANY ("2
 * tablespoons of hummus", "an omelette from 1 egg"); this table turns that
 * into grams the same way every time. Values follow USDA household-measure
 * weights; "tablespoon" of cooked food / dips is the heaped serving spoon
 * dietitians use (~20 g), not a level measuring spoon.
 */

export type MeasureUnit = 'tablespoon' | 'teaspoon' | 'cup' | 'handful';

export const MEASURE_CLASSES = [
  'fat',
  'sugar',
  'syrup',
  'spread',
  'dip',
  'cooked',
  'liquid',
  'powder',
  'nuts',
  'cereal',
  'fruitveg',
  'leafy',
  'other',
] as const;
export type MeasureClass = (typeof MEASURE_CLASSES)[number];

export const MEASURE_GRAMS: Record<MeasureClass, Record<MeasureUnit, number>> = {
  fat: { tablespoon: 14, teaspoon: 5, cup: 218, handful: 14 }, // oil, butter, margarine
  sugar: { tablespoon: 12, teaspoon: 4, cup: 200, handful: 30 },
  syrup: { tablespoon: 21, teaspoon: 7, cup: 330, handful: 21 }, // honey, silan, jam, maple
  spread: { tablespoon: 16, teaspoon: 5, cup: 250, handful: 16 }, // peanut butter, raw tahini, chocolate spread
  dip: { tablespoon: 20, teaspoon: 7, cup: 240, handful: 20 }, // hummus, prepared tahini, labneh, cottage, yogurt, cream cheese
  cooked: { tablespoon: 20, teaspoon: 7, cup: 160, handful: 30 }, // rice, pasta, couscous, legumes, cooked veg, diced salad
  liquid: { tablespoon: 15, teaspoon: 5, cup: 240, handful: 15 }, // milk, juice, soup, thin sauces
  powder: { tablespoon: 8, teaspoon: 3, cup: 125, handful: 20 }, // flour, cocoa, grated cheese, breadcrumbs
  nuts: { tablespoon: 9, teaspoon: 3, cup: 140, handful: 28 }, // nuts, seeds
  cereal: { tablespoon: 5, teaspoon: 2, cup: 80, handful: 25 }, // oats, granola, cornflakes
  fruitveg: { tablespoon: 10, teaspoon: 3, cup: 150, handful: 40 }, // berries, grapes, raw chopped vegetables
  leafy: { tablespoon: 3, teaspoon: 1, cup: 30, handful: 20 }, // lettuce, spinach, herbs
  other: { tablespoon: 15, teaspoon: 5, cup: 200, handful: 30 },
};

/** Built-in foods → their household-measure class. */
const FOOD_CLASS: Record<string, MeasureClass> = {
  'olive-oil': 'fat',
  butter: 'fat',
  sugar: 'sugar',
  honey: 'syrup',
  tahini: 'spread',
  'peanut-butter': 'spread',
  hummus: 'dip',
  'cottage-cheese': 'dip',
  'greek-yogurt': 'dip',
  'protein-yogurt': 'dip',
  milk: 'liquid',
  'orange-juice': 'liquid',
  'white-rice': 'cooked',
  pasta: 'cooked',
  couscous: 'cooked',
  bulgur: 'cooked',
  quinoa: 'cooked',
  lentils: 'cooked',
  chickpeas: 'cooked',
  oatmeal: 'cooked',
  broccoli: 'cooked',
  'ground-beef': 'cooked',
  'tuna-water': 'cooked',
  'egg-scrambled': 'cooked',
  'oats-dry': 'cereal',
  almonds: 'nuts',
  walnuts: 'nuts',
  cashews: 'nuts',
  'protein-powder': 'powder',
  strawberries: 'fruitveg',
  grapes: 'fruitveg',
  mango: 'fruitveg',
  'corn-boiled': 'fruitveg',
  'mixed-salad': 'leafy',
};

export const MEASURE_LABEL: Record<MeasureUnit, [string, string]> = {
  tablespoon: ['tbsp', 'tbsp'],
  teaspoon: ['tsp', 'tsp'],
  cup: ['cup', 'cups'],
  handful: ['handful', 'handfuls'],
};

export function measureClassOf(food: FoodItem | undefined, aiClass?: string): MeasureClass | undefined {
  if (food && FOOD_CLASS[food.id]) return FOOD_CLASS[food.id];
  if (food?.measureClass) return food.measureClass;
  return (MEASURE_CLASSES as readonly string[]).includes(aiClass ?? '') ? (aiClass as MeasureClass) : undefined;
}

/** Grams in one household measure of this food, or undefined if the food has no sensible spoon/cup measure. */
export function gramsPerMeasure(food: FoodItem | undefined, unit: MeasureUnit, aiClass?: string): number | undefined {
  const cls = measureClassOf(food, aiClass);
  return cls ? MEASURE_GRAMS[cls][unit] : undefined;
}

/** Turns a unit word ("tablespoons", "כפות", "tsp") into a measure, if it is one. */
export function measureFromWord(word: string | undefined): MeasureUnit | undefined {
  if (!word) return undefined;
  const w = word.toLowerCase().trim();
  if (/^(?:tbsp|tbs|tablespoons?|כפ|כף|כפות)$/.test(w) || /tablespoon/.test(w)) return 'tablespoon';
  if (/^(?:tsp|teaspoons?|כפית|כפיות)$/.test(w) || /teaspoon/.test(w)) return 'teaspoon';
  if (/^(?:cups?|כוס|כוסות)$/.test(w)) return 'cup';
  if (/^(?:handfuls?|חופנ|חופן|חופנים|חופנימ)$/.test(w) || /handful/.test(w)) return 'handful';
  return undefined;
}

// ---- Eggs ----

/** Built-in plain egg dishes; their "piece" serving is the weight per egg as served. */
export const EGG_FOOD_IDS = new Set(['eggs', 'egg-fried', 'egg-scrambled', 'omelette']);

const NOT_PLAIN =
  /\b(with|and|cheese|veg|vegetables?|mushrooms?|onions?|tomato(es)?|ham|bacon|herbs?|spinach|peppers?|sausage|white|whites|potato|spanish|tortilla|tofu|shakshuka)\b|עם|גבינה|ירקות|בצל|פטריות|עגבני|נקניק|פלפל|שקשוקה|חלבון|תפוח/i;
const EGG_WORD = /\beggs?\b|ביצ/i;

/** Maps a plain egg preparation to its built-in food id ("1-egg omelette" → omelette). Mixed dishes return undefined. */
export function plainEggDishId(name: string, hebrewName?: string): string | undefined {
  const text = `${name} ${hebrewName ?? ''}`;
  if (NOT_PLAIN.test(text)) return undefined;
  if (/\bomelet(te)?s?\b|חביתה/i.test(text) && !/מקושקש|scrambl/i.test(text)) return 'omelette';
  if (!EGG_WORD.test(text)) return undefined;
  if (/scrambl|מקושקש/i.test(text)) return 'egg-scrambled';
  if (/\bfried\b|sunny|over easy|ביצת עין|ביצי עין/i.test(text)) return 'egg-fried';
  if (/\b(boiled|hard|soft|poached)\b|קשה|קשות|רכה|רכות|עלומה/i.test(text)) return 'eggs';
  return undefined;
}

export function isEggUnit(label: string | undefined): boolean {
  return !!label && EGG_WORD.test(label);
}

/**
 * Typical weights shown to the AI so its photo and "no amount given"
 * estimates are anchored to the same numbers the app uses.
 */
export const PORTION_REFERENCE = `Standard weights the app uses (use them; do not inflate portions):
- 1 tablespoon (heaped serving spoon) of cooked food (rice, pasta, legumes, diced salad) or a dip/spread like hummus, prepared tahini, labneh, cottage or yogurt ≈ 20 g; oil/butter 14 g; sugar 12 g; honey/silan/jam 21 g; peanut butter/raw tahini 16 g; milk/liquid 15 g; nuts/seeds 9 g; flour 8 g; oats 5 g. 1 teaspoon ≈ one third of a tablespoon.
- 1 cup: cooked rice/pasta ≈ 160 g, liquid 240 ml, dip/yogurt 240 g, berries/chopped vegetables 150 g, leafy greens 30 g, oats 80 g.
- Eggs: 1 egg ≈ 50 g; a plain omelette ≈ 60 g per egg (a 1-egg omelette ≈ 60 g, a 2-egg one ≈ 120 g); scrambled ≈ 60 g per egg; fried egg ≈ 46 g.
- Bread slice 30–32 g; pita 60 g; chicken breast fillet (cooked) 120–150 g; schnitzel 120–150 g; medium apple 182 g; medium banana 118 g; tomato 123 g; small cucumber 100 g; date 24 g; falafel ball 17 g; cheese slice 20 g.
- A typical home dinner plate holds 300–550 g of food in total; close-up photos make food look bigger than it is.`;
