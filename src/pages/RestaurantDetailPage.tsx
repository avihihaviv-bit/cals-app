import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { restaurantService } from '@/services/RestaurantService';
import { useAddContext } from '@/hooks/useAddContext';
import { FoodDetailModal } from '@/components/food/FoodDetailModal';
import { DataQualityBadge } from '@/components/ui/DataQualityBadge';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Restaurant, RestaurantDish } from '@/types';

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { date } = useAddContext();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<RestaurantDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDishId, setActiveDishId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([restaurantService.getRestaurantById(id), restaurantService.getDishes(id)]).then(([r, d]) => {
      if (cancelled) return;
      setRestaurant(r ?? null);
      setDishes(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (!restaurant) {
    return <EmptyState icon={<span>🏪</span>} title="Restaurant not found" description="This restaurant may have been removed." />;
  }

  return (
    <div className="space-y-5 pb-6">
      <Link to={`/add/restaurants?date=${date}`} className="flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronLeft size={16} /> Back to Restaurants
      </Link>

      <div className="flex items-center gap-4 rounded-xl2 bg-surface p-5 shadow-card">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-3xl">{restaurant.imageEmoji}</div>
        <div>
          <h1 className="text-xl font-bold text-fg">{restaurant.name}</h1>
          <p className="text-sm text-muted">
            {restaurant.cuisine.join(' · ')} · {restaurant.city}
          </p>
          {restaurant.rating && <p className="mt-0.5 text-sm text-amber-600">★ {restaurant.rating.toFixed(1)}</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2.5 text-sm font-bold text-fg">Menu</h2>
        <div className="space-y-2.5">
          {dishes.map((dish) => (
            <button
              key={dish.id}
              onClick={() => setActiveDishId(dish.id)}
              className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-3.5 text-left shadow-card transition hover:shadow-elevated active:scale-[0.99]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-alt text-2xl">{dish.imageEmoji}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{dish.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span>~{Math.round((dish.per100g.calories * dish.defaultServing.grams) / 100)} kcal</span>
                  <span>· {dish.defaultServing.label}</span>
                  {!dish.nutritionReliable ? <span className="text-amber-600">Nutrition estimated</span> : <DataQualityBadge quality={dish.dataQuality} compact />}
                  <NaturalnessBadge score={dish.naturalness.score} compact />
                </div>
              </div>
              {dish.price && (
                <span className="shrink-0 text-sm font-bold text-fg">
                  {dish.currency}
                  {dish.price}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <FoodDetailModal
        open={!!activeDishId}
        onClose={() => setActiveDishId(null)}
        addRef={activeDishId ? { refId: activeDishId, refType: 'dish' } : undefined}
        addDate={date}
        addSource="restaurant"
        onAdded={() => navigate(`/diary?date=${date}`)}
      />
    </div>
  );
}
