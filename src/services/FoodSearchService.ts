import { FOODS, findFoodById } from '@/data/foods';
import type { FoodItem, FoodSearchQuery } from '@/types';

/**
 * Abstraction over "search the food database". The mock implementation
 * searches the local demo dataset; swap MockFoodSearchService for a real
 * implementation backed by a nutrition API (e.g. USDA, Open Food Facts,
 * Edamam) without touching any calling code — everything consumes this
 * interface, never the mock data directly.
 */
export interface FoodSearchService {
  search(query: FoodSearchQuery): Promise<FoodItem[]>;
  getById(id: string): Promise<FoodItem | undefined>;
}

const NETWORK_DELAY_MS = 260;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

class MockFoodSearchService implements FoodSearchService {
  async search({ text, limit = 20 }: FoodSearchQuery): Promise<FoodItem[]> {
    await delay(NETWORK_DELAY_MS);
    const q = normalize(text);
    if (!q) return [];
    const results = FOODS.filter(
      (f) => normalize(f.name).includes(q) || (f.nameHe && f.nameHe.includes(q)) || (f.category && normalize(f.category).includes(q)),
    );
    return results.slice(0, limit);
  }

  async getById(id: string): Promise<FoodItem | undefined> {
    await delay(80);
    return findFoodById(id);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const foodSearchService: FoodSearchService = new MockFoodSearchService();
