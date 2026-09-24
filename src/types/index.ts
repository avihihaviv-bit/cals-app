// ---------------------------------------------------------------------------
// Core domain types for Nutrition AI
// ---------------------------------------------------------------------------

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary' // כמעט לא פעיל
  | 'light' // פעילות קלה
  | 'moderate' // פעילות בינונית
  | 'high' // פעילות גבוהה
  | 'very_high'; // פעילות גבוהה מאוד

export type TrainingType =
  | 'gym'
  | 'football'
  | 'running'
  | 'swimming'
  | 'cycling'
  | 'walking'
  | 'other';

export type Goal =
  | 'maintain'
  | 'lose'
  | 'gain'
  | 'recomposition'
  | 'performance';

export type GoalPace = 'moderate' | 'fast';

export type DataQuality = 'verified' | 'estimated' | 'ai_estimate';

export type DietaryRestriction = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'kosher';

export interface UserProfile {
  id: string;
  name?: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  trainingTypes: TrainingType[];
  goal: Goal;
  goalPace?: GoalPace;
  isMinor: boolean;
  /** Manual protein override in grams/day — replaces the computed target when set. */
  customProteinTargetG?: number;
  /** Food ids the user has said they like — used to bias AI recipe/meal-plan suggestions, never to restrict search. */
  likedFoodIds?: string[];
  /** Food ids the user has said they dislike — the AI Coach avoids these in recipes and meal plans. */
  dislikedFoodIds?: string[];
  dietaryRestrictions?: DietaryRestriction[];
  /** Free-text allergy notes entered by the user — surfaced to the AI Coach as context, never auto-detected. */
  allergyNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionFacts {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
}

/** Units a food serving can be expressed in. */
export type ServingUnit = 'g' | 'ml' | 'serving' | 'piece';

export interface ServingOption {
  label: string; // e.g. "1 serving", "1 piece", "100g"
  unit: ServingUnit;
  grams: number; // gram-equivalent weight of this serving option
}

/** A food item as it exists in a nutrition database (per 100g/ml baseline). */
/**
 * A measure of how close a food is to its whole/unprocessed form — NOT a
 * health or "good/bad" judgment. Score 1-100, see utils/naturalness.ts for
 * the tier bands. `reasons` are short, factual bullets explaining the score
 * (e.g. "Single-ingredient food", "Added sweeteners").
 */
export interface NaturalnessInfo {
  score: number;
  reasons: string[];
}

export interface FoodItem {
  id: string;
  name: string;
  nameHe?: string;
  category?: string;
  imageEmoji?: string;
  imageUrl?: string;
  /** Nutrition per 100 g (or 100 ml for liquids) — the canonical baseline. */
  per100g: NutritionFacts;
  servingOptions: ServingOption[];
  defaultServing: ServingOption;
  dataQuality: DataQuality;
  source: string; // e.g. "USDA FoodData Central", "AI Vision Estimate"
  naturalness: NaturalnessInfo;
}

export interface RestaurantDish {
  id: string;
  name: string;
  restaurantId: string;
  imageEmoji?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  per100g: NutritionFacts;
  servingOptions: ServingOption[];
  defaultServing: ServingOption;
  dataQuality: DataQuality;
  nutritionReliable: boolean;
  naturalness: NaturalnessInfo;
}

export interface Restaurant {
  id: string;
  name: string;
  city: string;
  cuisine: string[];
  imageEmoji?: string;
  imageUrl?: string;
  rating?: number;
  priceLevel?: 1 | 2 | 3;
  dishIds: string[];
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

/** A logged food entry inside the diary. */
export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD (local)
  mealType: MealType;
  foodId: string;
  foodName: string;
  foodImageEmoji?: string;
  quantityGrams: number;
  servingLabel: string; // display label of chosen serving, e.g. "150g" or "1 slice"
  nutrition: NutritionFacts; // computed for the logged quantity
  dataQuality: DataQuality;
  source: 'search' | 'scan' | 'restaurant' | 'favorite' | 'recent' | 'ai_coach';
  loggedAt: string; // ISO timestamp
  aiConfidence?: 'low' | 'medium' | 'high';
  notes?: string;
  /** Optional: absent on entries logged before this field existed. */
  naturalness?: NaturalnessInfo;
}

export interface WeightLogEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

// ---------------------------------------------------------------------------
// Body measurements & progress photos — private, on-device only.
// ---------------------------------------------------------------------------

export type MeasurementType =
  | 'waist'
  | 'abdomen'
  | 'chest'
  | 'shoulders'
  | 'rightArm'
  | 'leftArm'
  | 'rightThigh'
  | 'leftThigh'
  | 'hips'
  | 'neck'
  | 'calf';

export interface MeasurementEntry {
  id: string;
  type: MeasurementType;
  /** Always stored in centimeters — display converts via the units preference. */
  valueCm: number;
  date: string; // YYYY-MM-DD
  loggedAt: string; // ISO timestamp
}

export type PhotoCategory = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  category: PhotoCategory;
  dataUrl: string;
  date: string; // YYYY-MM-DD
  loggedAt: string; // ISO timestamp
}

export interface ScannedFoodCandidate {
  id: string;
  foodId: string;
  name: string;
  estimatedGrams: number;
  nutrition: NutritionFacts; // for the estimated grams, including any addedDetails below
  confidence: 'low' | 'medium' | 'high';
  /** Hidden ingredients (oil, sauce, etc.) the user manually added because the AI can't see them in the photo. */
  addedDetails?: HiddenIngredientEntry[];
}

/** A manually-added hidden ingredient (e.g. cooking oil) not visible in the scanned photo. */
export interface HiddenIngredientEntry {
  id: string;
  label: string;
  emoji: string;
  nutrition: NutritionFacts;
}

export interface ScanResult {
  id: string;
  imageDataUrl?: string;
  candidates: ScannedFoodCandidate[];
  createdAt: string;
}

export interface FoodSearchQuery {
  text: string;
  limit?: number;
}

export interface RestaurantSearchQuery {
  text?: string;
  city?: string;
  cuisine?: string;
}

export type FoodRefType = 'food' | 'dish';

export interface FoodRef {
  refId: string;
  refType: FoodRefType;
}

export interface FavoriteItem extends FoodRef {
  addedAt: string;
}

export interface RecentItem extends FoodRef {
  lastUsedAt: string;
  useCount: number;
}

// ---------------------------------------------------------------------------
// Health / activity integration (Apple Health, Health Connect, etc.)
// ---------------------------------------------------------------------------

/**
 * 'unavailable' = this platform has no way to read health data at all (e.g.
 * a web browser, which has no HealthKit bridge). 'not_connected' = available
 * in principle but the user hasn't granted access yet. 'connected' /
 * 'denied' are the post-permission-prompt outcomes.
 */
export type HealthAuthStatus = 'unavailable' | 'not_connected' | 'connected' | 'denied';

export interface ActivityData {
  date: string; // YYYY-MM-DD
  steps: number;
  activeCalories: number;
  exerciseMinutes: number;
  distanceKm: number;
  flightsClimbed?: number;
}

// ---------------------------------------------------------------------------
// AI Nutrition Coach: recipes and meal plans. Every recipe/plan here is
// assembled deterministically from the local food database (see
// utils/recipeGenerator.ts, utils/mealPlanBuilder.ts) — there is no live LLM
// call, consistent with the rest of the app's "AI" features.
// ---------------------------------------------------------------------------

export type RecipeStyle =
  | 'high_protein'
  | 'healthy'
  | 'quick'
  | 'cheap'
  | 'filling'
  | 'sweet'
  | 'vegetarian'
  | 'balanced';

export type RecipeMealType = MealType | 'dessert';

export interface RecipeIngredient {
  foodId?: string; // absent for a flavor-only add-in (herbs, lemon, spices) that carries no tracked nutrition
  label: string; // e.g. "150g chicken breast" or "A pinch of black pepper"
  grams?: number;
}

export interface Recipe {
  id: string;
  name: string;
  mealType: RecipeMealType;
  nutrition: NutritionFacts;
  ingredients: RecipeIngredient[];
  instructions: string[];
  prepMinutes: number;
  cookMinutes: number;
  whyItFits: string;
  styles: RecipeStyle[];
}

/** A single meal within a generated multi-day plan — reuses the same {foodId, grams} shape as a recommended meal. */
export interface MealPlanSlot {
  id: string;
  mealType: MealType;
  name: string;
  emoji: string;
  items: { foodId: string; grams: number }[];
}

export interface MealPlanDay {
  dayIndex: number;
  date: string; // YYYY-MM-DD
  slots: MealPlanSlot[];
}

export interface SavedMealPlan {
  id: string;
  name: string;
  createdAt: string;
  days: MealPlanDay[];
  /** 'ai' = generated by the AI Meal Plan Builder; 'user' = manually assembled by the user. Never mixed within one plan. */
  origin: 'user' | 'ai';
}
