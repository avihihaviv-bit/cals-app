import { FOODS, findFoodById } from '@/data/foods';
import { calculateNutrition, sumNutrition } from '@/utils/nutritionCalculator';
import { generateId } from '@/utils/id';
import type { NutritionFacts, Recipe, RecipeIngredient, RecipeMealType, RecipeStyle } from '@/types';

/**
 * AI Recipe Creator engine. Like every other "AI" feature in this app, this
 * is deterministic, rule-based logic over the local food database — never a
 * live LLM call. It assembles a recipe from role-tagged ingredients (a
 * protein, a carb, a vegetable, a topping) sized to fit the requested
 * calorie window and protein minimum, then generates plain-language
 * instructions from templates. "Regenerate" buttons re-run generation with
 * adjusted constraints rather than trying to invent genuinely new dishes.
 */

type Role = 'protein' | 'carb' | 'veg' | 'topping' | 'fruit';

interface CatalogEntry {
  foodId: string;
  role: Role;
  cookMinutes: number;
  cheap: boolean;
  vegetarian: boolean;
  cookVerb: string; // used to build the instruction line
}

const CATALOG: CatalogEntry[] = [
  { foodId: 'chicken-breast', role: 'protein', cookMinutes: 15, cheap: false, vegetarian: false, cookVerb: 'Season and cook' },
  { foodId: 'salmon', role: 'protein', cookMinutes: 15, cheap: false, vegetarian: false, cookVerb: 'Season and cook' },
  { foodId: 'ground-beef', role: 'protein', cookMinutes: 12, cheap: true, vegetarian: false, cookVerb: 'Brown and cook' },
  { foodId: 'eggs', role: 'protein', cookMinutes: 8, cheap: true, vegetarian: true, cookVerb: 'Scramble or boil' },
  { foodId: 'tofu', role: 'protein', cookMinutes: 10, cheap: true, vegetarian: true, cookVerb: 'Pan-fry' },
  { foodId: 'lentils', role: 'protein', cookMinutes: 20, cheap: true, vegetarian: true, cookVerb: 'Simmer' },
  { foodId: 'greek-yogurt', role: 'protein', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Spoon' },
  { foodId: 'cottage-cheese', role: 'protein', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Spoon' },
  { foodId: 'protein-yogurt', role: 'protein', cookMinutes: 0, cheap: false, vegetarian: true, cookVerb: 'Spoon' },

  { foodId: 'white-rice', role: 'carb', cookMinutes: 20, cheap: true, vegetarian: true, cookVerb: 'Cook' },
  { foodId: 'pasta', role: 'carb', cookMinutes: 12, cheap: true, vegetarian: true, cookVerb: 'Boil' },
  { foodId: 'oatmeal', role: 'carb', cookMinutes: 5, cheap: true, vegetarian: true, cookVerb: 'Simmer' },
  { foodId: 'quinoa', role: 'carb', cookMinutes: 18, cheap: false, vegetarian: true, cookVerb: 'Cook' },
  { foodId: 'whole-wheat-bread', role: 'carb', cookMinutes: 3, cheap: true, vegetarian: true, cookVerb: 'Toast' },
  { foodId: 'sweet-potato', role: 'carb', cookMinutes: 25, cheap: true, vegetarian: true, cookVerb: 'Roast or microwave' },
  { foodId: 'pita', role: 'carb', cookMinutes: 3, cheap: true, vegetarian: true, cookVerb: 'Warm' },

  { foodId: 'mixed-salad', role: 'veg', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Wash and toss' },
  { foodId: 'broccoli', role: 'veg', cookMinutes: 8, cheap: true, vegetarian: true, cookVerb: 'Steam' },

  { foodId: 'almonds', role: 'topping', cookMinutes: 0, cheap: false, vegetarian: true, cookVerb: 'Sprinkle' },
  { foodId: 'peanut-butter', role: 'topping', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Spread' },
  { foodId: 'avocado', role: 'topping', cookMinutes: 0, cheap: false, vegetarian: true, cookVerb: 'Slice' },
  { foodId: 'hummus', role: 'topping', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Spread' },
  { foodId: 'olive-oil', role: 'topping', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Drizzle' },

  { foodId: 'banana', role: 'fruit', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Slice' },
  { foodId: 'apple', role: 'fruit', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Slice' },
  { foodId: 'orange', role: 'fruit', cookMinutes: 0, cheap: true, vegetarian: true, cookVerb: 'Peel and segment' },
  { foodId: 'chocolate', role: 'fruit', cookMinutes: 0, cheap: false, vegetarian: true, cookVerb: 'Break into squares' },
];

export interface RecipeConstraints {
  mealType: RecipeMealType;
  calorieMin: number;
  calorieMax: number;
  minProteinG: number;
  maxCookMinutes: number; // use Infinity for "Any"
  styles: RecipeStyle[];
  availableIngredientNames: string[];
}

function rolesForMealType(mealType: RecipeMealType, styles: RecipeStyle[], quick: boolean): Role[] {
  if (styles.includes('sweet') || mealType === 'dessert') {
    return quick ? ['fruit', 'topping'] : ['protein', 'fruit', 'topping'];
  }
  if (mealType === 'snacks') {
    return quick ? ['protein', 'fruit'] : ['protein', 'fruit', 'topping'];
  }
  if (mealType === 'breakfast') {
    return quick ? ['protein', 'fruit'] : ['carb', 'protein', 'fruit'];
  }
  // lunch / dinner
  return quick ? ['protein', 'carb'] : ['protein', 'carb', 'veg'];
}

function matchAvailableIngredient(name: string): CatalogEntry | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const entry of CATALOG) {
    const food = findFoodById(entry.foodId);
    if (!food) continue;
    const words = food.name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    let score = 0;
    if (food.name.toLowerCase() === q) score = 3;
    else if (words.some((w) => w === q)) score = 2;
    else if (words.some((w) => w.length >= 3 && (w.startsWith(q) || q.startsWith(w)))) score = 1;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

function pickForRole(
  role: Role,
  candidates: CatalogEntry[],
  used: Set<string>,
  styles: RecipeStyle[],
  availableMatches: CatalogEntry[],
): CatalogEntry | null {
  const pool = candidates.filter((c) => c.role === role && !used.has(c.foodId));
  if (pool.length === 0) return null;

  const availableForRole = availableMatches.find((m) => m.role === role && pool.some((p) => p.foodId === m.foodId));
  if (availableForRole) return availableForRole;

  const sorted = [...pool].sort((a, b) => {
    if (styles.includes('cheap')) return Number(b.cheap) - Number(a.cheap);
    if (styles.includes('healthy')) {
      const na = findFoodById(a.foodId)?.naturalness.score ?? 0;
      const nb = findFoodById(b.foodId)?.naturalness.score ?? 0;
      return nb - na;
    }
    if (styles.includes('high_protein') && role === 'protein') {
      const pa = findFoodById(a.foodId)?.per100g.proteinG ?? 0;
      const pb = findFoodById(b.foodId)?.per100g.proteinG ?? 0;
      return pb - pa;
    }
    return 0;
  });

  // Light rotation so repeated generations don't always land on the exact
  // same first candidate — pick among the top matches, not strictly random.
  const topSlice = sorted.slice(0, Math.min(3, sorted.length));
  return topSlice[Math.floor(Math.random() * topSlice.length)];
}

interface RecipeItem {
  entry: CatalogEntry;
  grams: number;
}

function computeTotals(items: RecipeItem[]): NutritionFacts {
  const parts = items
    .map(({ entry, grams }) => {
      const food = findFoodById(entry.foodId);
      return food ? calculateNutrition(food.per100g, grams) : null;
    })
    .filter((n): n is NutritionFacts => !!n);
  return sumNutrition(parts);
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function generateRecipe(constraints: RecipeConstraints): Recipe {
  const { mealType, calorieMin, calorieMax, minProteinG, maxCookMinutes, styles } = constraints;
  const isVegetarian = styles.includes('vegetarian');
  const quick = styles.includes('quick') || maxCookMinutes <= 5;

  let candidates = CATALOG.filter((c) => c.cookMinutes <= maxCookMinutes);
  if (isVegetarian) candidates = candidates.filter((c) => c.vegetarian);
  if (candidates.length === 0) candidates = CATALOG; // constraints too tight — fall back rather than fail

  const availableMatches = constraints.availableIngredientNames
    .map(matchAvailableIngredient)
    .filter((m): m is CatalogEntry => !!m && (!isVegetarian || m.vegetarian) && m.cookMinutes <= maxCookMinutes);

  const roles = rolesForMealType(mealType, styles, quick);
  const used = new Set<string>();
  const items: RecipeItem[] = [];

  for (const role of roles) {
    const entry = pickForRole(role, candidates, used, styles, availableMatches);
    if (!entry) continue;
    used.add(entry.foodId);
    const food = findFoodById(entry.foodId);
    items.push({ entry, grams: food?.defaultServing.grams ?? 100 });
  }

  if (items.length === 0) {
    // Nothing matched at all (extremely tight constraints) — fall back to a simple, always-available combo.
    const fallbackFood = findFoodById('greek-yogurt');
    const entry = CATALOG.find((c) => c.foodId === 'greek-yogurt')!;
    items.push({ entry, grams: fallbackFood?.defaultServing.grams ?? 200 });
  }

  // Scale portions to land inside the calorie window.
  let totals = computeTotals(items);
  if (totals.calories > 0 && totals.calories < calorieMin) {
    const factor = Math.min(2, calorieMin / totals.calories);
    for (const item of items) item.grams = roundTo5(item.grams * factor);
    totals = computeTotals(items);
  } else if (totals.calories > calorieMax) {
    const factor = Math.max(0.5, calorieMax / totals.calories);
    for (const item of items) item.grams = roundTo5(item.grams * factor);
    totals = computeTotals(items);
  }

  // Boost protein toward the minimum by growing the protein item specifically.
  let proteinBumps = 0;
  const proteinItem = items.find((i) => i.entry.role === 'protein');
  while (proteinItem && totals.proteinG < minProteinG && proteinBumps < 6) {
    proteinItem.grams = roundTo5(proteinItem.grams + 20);
    totals = computeTotals(items);
    proteinBumps += 1;
  }

  const ingredients: RecipeIngredient[] = items.map(({ entry, grams }) => {
    const food = findFoodById(entry.foodId);
    return { foodId: entry.foodId, grams, label: `${grams}g ${food?.name ?? entry.foodId}` };
  });
  ingredients.push({ label: 'Salt, pepper, and herbs or spices to taste' });

  const instructions = buildInstructions(items);
  const cookMinutes = Math.max(0, ...items.map((i) => i.entry.cookMinutes));
  const prepMinutes = Math.min(15, 4 + items.length * 2);

  const inferredStyles: RecipeStyle[] = [...styles];
  if (items.some((i) => i.entry.role === 'protein') && items.some((i) => i.entry.role === 'carb') && items.some((i) => i.entry.role === 'veg') && !inferredStyles.includes('balanced')) {
    inferredStyles.push('balanced');
  }

  return {
    id: generateId('recipe'),
    name: buildRecipeName(items, mealType),
    mealType,
    nutrition: totals,
    ingredients,
    instructions,
    prepMinutes,
    cookMinutes,
    whyItFits: buildWhyItFits(totals, constraints),
    styles: inferredStyles,
  };
}

function buildRecipeName(items: RecipeItem[], mealType: RecipeMealType): string {
  const names = items
    .map((i) => findFoodById(i.entry.foodId)?.name.replace(/\s*\(.*\)$/, ''))
    .filter((n): n is string => !!n);
  if (names.length === 0) return mealType === 'dessert' ? 'Simple Treat' : 'Simple Bowl';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

function buildInstructions(items: RecipeItem[]): string[] {
  const steps: string[] = [];
  const cookSteps = items.filter((i) => i.entry.cookMinutes > 0);
  const noCookSteps = items.filter((i) => i.entry.cookMinutes === 0);

  for (const { entry, grams } of cookSteps) {
    const food = findFoodById(entry.foodId);
    steps.push(`${entry.cookVerb} the ${food?.name.toLowerCase() ?? 'ingredient'} (about ${grams}g) for roughly ${entry.cookMinutes} minutes, until done.`);
  }
  for (const { entry, grams } of noCookSteps) {
    const food = findFoodById(entry.foodId);
    steps.push(`${entry.cookVerb} the ${food?.name.toLowerCase() ?? 'ingredient'} (about ${grams}g).`);
  }
  steps.push('Combine everything and season to taste with salt, pepper, and your preferred herbs or spices.');
  return steps;
}

function buildWhyItFits(totals: NutritionFacts, constraints: RecipeConstraints): string {
  const parts: string[] = [
    `Provides about ${Math.round(totals.proteinG)}g protein and fits your ${constraints.calorieMin}-${constraints.calorieMax} kcal range.`,
  ];
  if (constraints.styles.includes('quick')) parts.push('Minimal prep with little to no cooking.');
  if (constraints.styles.includes('cheap')) parts.push('Built from affordable, everyday staples.');
  if (constraints.styles.includes('vegetarian')) parts.push('Fully vegetarian.');
  if (constraints.styles.includes('filling')) parts.push('Leans on higher-fiber ingredients to help keep you satisfied.');
  if (constraints.styles.includes('healthy')) parts.push('Built mostly from minimally processed ingredients.');
  return parts.join(' ');
}

export type RegenerateModifier = 'faster' | 'more_protein' | 'fewer_calories' | 'tastier' | 'cheaper' | 'vegetarian';

const FLAVOR_INGREDIENT = 'A squeeze of lemon and fresh herbs';

export function applyRegenerateModifier(
  recipe: Recipe,
  constraints: RecipeConstraints,
  modifier: RegenerateModifier,
): { recipe: Recipe; constraints: RecipeConstraints } {
  if (modifier === 'tastier') {
    // A flavor tweak doesn't change nutrition — mutate in place rather than regenerate the whole recipe.
    const nextRecipe: Recipe = {
      ...recipe,
      ingredients: [...recipe.ingredients, { label: FLAVOR_INGREDIENT }],
      instructions: [...recipe.instructions, 'Finish with a squeeze of lemon and fresh herbs for extra flavor.'],
    };
    return { recipe: nextRecipe, constraints };
  }

  let nextConstraints: RecipeConstraints = constraints;
  if (modifier === 'faster') {
    nextConstraints = { ...constraints, maxCookMinutes: 5, styles: addStyle(constraints.styles, 'quick') };
  } else if (modifier === 'more_protein') {
    nextConstraints = { ...constraints, minProteinG: constraints.minProteinG + 15, styles: addStyle(constraints.styles, 'high_protein') };
  } else if (modifier === 'fewer_calories') {
    nextConstraints = {
      ...constraints,
      calorieMin: Math.max(150, Math.round(constraints.calorieMin * 0.8)),
      calorieMax: Math.max(200, Math.round(constraints.calorieMax * 0.8)),
    };
  } else if (modifier === 'cheaper') {
    nextConstraints = { ...constraints, styles: addStyle(constraints.styles, 'cheap') };
  } else if (modifier === 'vegetarian') {
    nextConstraints = { ...constraints, styles: addStyle(constraints.styles, 'vegetarian') };
  }

  return { recipe: generateRecipe(nextConstraints), constraints: nextConstraints };
}

function addStyle(styles: RecipeStyle[], style: RecipeStyle): RecipeStyle[] {
  return styles.includes(style) ? styles : [...styles, style];
}

export const RECIPE_CATALOG_FOOD_NAMES = FOODS.map((f) => f.name);
