import { useSearchParams } from 'react-router-dom';
import { todayISO } from '@/utils/date';
import type { MealType } from '@/types';

const VALID_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

/** Reads the ?date=&meal= context carried between /add/* routes. */
export function useAddContext() {
  const [params] = useSearchParams();
  const date = params.get('date') || todayISO();
  const mealParam = params.get('meal');
  const meal = VALID_MEALS.includes(mealParam as MealType) ? (mealParam as MealType) : undefined;

  const queryString = `date=${date}${meal ? `&meal=${meal}` : ''}`;

  return { date, meal, queryString };
}
