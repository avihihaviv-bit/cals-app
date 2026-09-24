import { findFoodById } from '@/data/foods';
import { findDishById, findRestaurantById } from '@/data/restaurants';
import type { DataQuality, FoodRef, NaturalnessInfo, NutritionFacts, ServingOption } from '@/types';

export interface ResolvedFood {
  id: string;
  refType: 'food' | 'dish';
  name: string;
  emoji: string;
  per100g: NutritionFacts;
  servingOptions: ServingOption[];
  defaultServing: ServingOption;
  dataQuality: DataQuality;
  naturalness: NaturalnessInfo;
  subtitle?: string; // e.g. restaurant name for dishes
}

export function resolveFoodRef(ref: FoodRef): ResolvedFood | undefined {
  if (ref.refType === 'food') {
    const food = findFoodById(ref.refId);
    if (!food) return undefined;
    return {
      id: food.id,
      refType: 'food',
      name: food.name,
      emoji: food.imageEmoji ?? '🍽️',
      per100g: food.per100g,
      servingOptions: food.servingOptions,
      defaultServing: food.defaultServing,
      dataQuality: food.dataQuality,
      naturalness: food.naturalness,
    };
  }
  const dish = findDishById(ref.refId);
  if (!dish) return undefined;
  const restaurant = findRestaurantById(dish.restaurantId);
  return {
    id: dish.id,
    refType: 'dish',
    name: dish.name,
    emoji: dish.imageEmoji ?? '🍽️',
    per100g: dish.per100g,
    servingOptions: dish.servingOptions,
    defaultServing: dish.defaultServing,
    dataQuality: dish.dataQuality,
    naturalness: dish.naturalness,
    subtitle: restaurant?.name,
  };
}
