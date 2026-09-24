import type { DietaryRestriction } from '@/types';

/**
 * Restriction filtering derived directly from each template's actual
 * ingredient foodIds — never a fabricated per-recipe certification. 'kosher'
 * is intentionally NOT enforced here: this dataset has no per-food
 * certification data, so we can't honestly claim to filter for it.
 */
export const GLUTEN_FOOD_IDS = new Set(['pasta', 'whole-wheat-bread', 'pita']);
export const DAIRY_FOOD_IDS = new Set(['milk', 'greek-yogurt', 'cottage-cheese', 'protein-yogurt', 'protein-powder']);
export const EGG_FOOD_IDS = new Set(['eggs']);

export function templateMatchesRestrictions(
  items: { foodId: string }[],
  isVegetarianTemplate: boolean,
  restrictions: DietaryRestriction[] | undefined,
): boolean {
  if (!restrictions || restrictions.length === 0) return true;
  const ids = items.map((i) => i.foodId);
  const hasDairy = ids.some((id) => DAIRY_FOOD_IDS.has(id));
  const hasEgg = ids.some((id) => EGG_FOOD_IDS.has(id));
  const hasGluten = ids.some((id) => GLUTEN_FOOD_IDS.has(id));

  if (restrictions.includes('vegetarian') && !isVegetarianTemplate) return false;
  if (restrictions.includes('vegan') && (!isVegetarianTemplate || hasDairy || hasEgg)) return false;
  if (restrictions.includes('gluten_free') && hasGluten) return false;
  if (restrictions.includes('dairy_free') && hasDairy) return false;
  return true;
}

/** Small, honest scoring nudge toward foods the user has said they like — never a hard filter. */
export function likedFoodBonus(items: { foodId: string }[], likedFoodIds: string[] | undefined): number {
  if (!likedFoodIds || likedFoodIds.length === 0) return 0;
  const liked = new Set(likedFoodIds);
  return items.some((i) => liked.has(i.foodId)) ? 8 : 0;
}
