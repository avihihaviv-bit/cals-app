import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { ReliabilityBadge } from './ReliabilityBadge';
import type { Restaurant, RestaurantDish } from '@/types';

export function dishServingNutrition(dish: RestaurantDish) {
  if (dish.perServing) return dish.perServing;
  const k = dish.defaultServing.grams / 100;
  return {
    calories: Math.round(dish.per100g.calories * k),
    proteinG: dish.per100g.proteinG * k,
    carbsG: dish.per100g.carbsG * k,
    fatG: dish.per100g.fatG * k,
  };
}

export function DishCard({
  dish,
  restaurant,
  onAdd,
  index = 0,
}: {
  dish: RestaurantDish;
  restaurant?: Restaurant;
  onAdd: () => void;
  index?: number;
}) {
  const n = dishServingNutrition(dish);
  const r1 = (x: number) => Math.round(x);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index, 10) * 0.025 }}
      className="rounded-xl2 bg-surface p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-2xl">{dish.imageEmoji ?? '🍽️'}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold text-fg">{dish.nameHe ?? dish.name}</p>
            <ReliabilityBadge reliability={dish.reliability} compact />
          </div>
          <p className="truncate text-xs text-muted">
            {restaurant ? `${restaurant.nameHe ?? restaurant.name} · ` : ''}
            {dish.defaultServing.label}
            {dish.aliases?.[0] ? ` · ${dish.aliases[0]}` : ''}
          </p>
          {dish.description && <p className="mt-1 line-clamp-2 text-xs text-fg/70">{dish.description}</p>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg bg-surface-alt py-1.5">
          <p className="text-sm font-bold tabular-nums text-fg">{r1(n.calories)}</p>
          <p className="text-[10px] text-muted">קק״ל</p>
        </div>
        <div className="rounded-lg bg-surface-alt py-1.5">
          <p className="text-sm font-bold tabular-nums text-protein">{r1(n.proteinG)}g</p>
          <p className="text-[10px] text-muted">חלבון</p>
        </div>
        <div className="rounded-lg bg-surface-alt py-1.5">
          <p className="text-sm font-bold tabular-nums text-carbs">{r1(n.carbsG)}g</p>
          <p className="text-[10px] text-muted">פחמימות</p>
        </div>
        <div className="rounded-lg bg-surface-alt py-1.5">
          <p className="text-sm font-bold tabular-nums text-fat">{r1(n.fatG)}g</p>
          <p className="text-[10px] text-muted">שומן</p>
        </div>
      </div>

      <button
        onClick={onAdd}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-50 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 active:scale-[0.98]"
      >
        <Plus size={15} /> הוסף ליומן
      </button>
    </motion.div>
  );
}
