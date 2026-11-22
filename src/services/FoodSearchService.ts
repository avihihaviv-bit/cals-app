import { FOODS, findFoodById } from '@/data/foods';
import { useAppStore } from '@/store/useAppStore';
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


function normalize(text: string): string {
  return text.trim().toLowerCase();
}

class MockFoodSearchService implements FoodSearchService {
  async search({ text, limit = 20 }: FoodSearchQuery): Promise<FoodItem[]> {
    const q = normalize(text);
    if (!q) return [];
    const matches = (f: FoodItem) =>
      normalize(f.name).includes(q) || (!!f.nameHe && f.nameHe.includes(q)) || (!!f.category && normalize(f.category).includes(q));
    // The user's own saved foods (AI lookups, scanned labels) come first — they're what they actually eat.
    const mine = useAppStore.getState().customFoods.filter(matches);
    return [...mine, ...FOODS.filter(matches)].slice(0, limit);
  }

  async getById(id: string): Promise<FoodItem | undefined> {
    return findFoodById(id);
  }
}


export const foodSearchService: FoodSearchService = new MockFoodSearchService();
