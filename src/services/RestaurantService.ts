import { RESTAURANTS, RESTAURANT_DISHES, dishesForRestaurant, findDishById, findRestaurantById } from '@/data/restaurants';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { scoreNutritionAgainstRemaining } from '@/services/RecommendationService';
import type { MacroTargets, Restaurant, RestaurantDish, RestaurantSearchQuery } from '@/types';

/**
 * Abstraction over restaurant + menu lookup. Mock implementation searches a
 * small local dataset; a real implementation would call a restaurant/menu
 * API (e.g. Google Places + a nutrition-mapping service) behind this same
 * interface.
 */
export interface RestaurantServiceInterface {
  search(query: RestaurantSearchQuery): Promise<Restaurant[]>;
  getDishes(restaurantId: string): Promise<RestaurantDish[]>;
  getDishById(id: string): Promise<RestaurantDish | undefined>;
  getRestaurantById(id: string): Promise<Restaurant | undefined>;
}

const NETWORK_DELAY_MS = 320;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

class MockRestaurantService implements RestaurantServiceInterface {
  async search({ text, city, cuisine }: RestaurantSearchQuery): Promise<Restaurant[]> {
    await delay(NETWORK_DELAY_MS);
    let results = [...RESTAURANTS];

    if (text && text.trim()) {
      const q = normalize(text);
      results = results.filter((r) => {
        if (normalize(r.name).includes(q)) return true;
        if (r.cuisine.some((c) => normalize(c).includes(q))) return true;
        const dishes = dishesForRestaurant(r.id);
        return dishes.some((d) => normalize(d.name).includes(q));
      });
    }
    if (city) {
      results = results.filter((r) => normalize(r.city) === normalize(city));
    }
    if (cuisine) {
      results = results.filter((r) => r.cuisine.some((c) => normalize(c) === normalize(cuisine)));
    }
    return results;
  }

  async getDishes(restaurantId: string): Promise<RestaurantDish[]> {
    await delay(150);
    return dishesForRestaurant(restaurantId);
  }

  async getDishById(id: string): Promise<RestaurantDish | undefined> {
    await delay(80);
    return findDishById(id);
  }

  async getRestaurantById(id: string): Promise<Restaurant | undefined> {
    await delay(80);
    return findRestaurantById(id);
  }
}

export const restaurantService: RestaurantServiceInterface = new MockRestaurantService();

export function allCuisines(): string[] {
  const set = new Set<string>();
  RESTAURANTS.forEach((r) => r.cuisine.forEach((c) => set.add(c)));
  return Array.from(set).sort();
}

export function allCities(): string[] {
  return Array.from(new Set(RESTAURANTS.map((r) => r.city))).sort();
}

export interface RestaurantMatch {
  restaurant: Restaurant;
  bestDish: RestaurantDish;
  matchScore: number;
  reasons: string[];
}

/**
 * Scores each restaurant's best-fitting dish against the user's remaining
 * macros for today — the same honest, data-driven scoring used for meal
 * recommendations. Never claims proximity/distance: this app has no real
 * location data, so "close to you" is deliberately never shown.
 */
export function matchRestaurants(remaining: MacroTargets, restaurants: Restaurant[] = RESTAURANTS, limit = 3): RestaurantMatch[] {
  const matches: RestaurantMatch[] = restaurants.map((restaurant) => {
    const dishes = dishesForRestaurant(restaurant.id);
    let best: { dish: RestaurantDish; score: number } | null = null;
    for (const dish of dishes) {
      const totals = calculateNutrition(dish.per100g, dish.defaultServing.grams);
      const score = scoreNutritionAgainstRemaining(totals, remaining);
      if (!best || score > best.score) best = { dish, score };
    }
    const reasons: string[] = [];
    if (best) {
      const totals = calculateNutrition(best.dish.per100g, best.dish.defaultServing.grams);
      if (totals.calories <= remaining.calories * 1.1) reasons.push('Fits your remaining calories');
      if (remaining.proteinG > 0 && totals.proteinG >= remaining.proteinG * 0.5) reasons.push('High protein option');
      if (dishes.some((d) => calculateNutrition(d.per100g, d.defaultServing.grams).proteinG >= 20)) {
        reasons.push('Has high-protein choices on the menu');
      }
    }
    return { restaurant, bestDish: best?.dish ?? dishes[0], matchScore: best?.score ?? 0, reasons };
  });

  return matches.filter((m) => m.bestDish).sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
}

export { RESTAURANT_DISHES };
