import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Clock3, Heart, Search, Store } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useAddContext } from '@/hooks/useAddContext';
import { resolveFoodRef } from '@/utils/resolveFoodRef';
import { FoodRow } from '@/components/food/FoodRow';
import { FoodDetailModal } from '@/components/food/FoodDetailModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { isToday } from '@/utils/date';
import type { FoodRef } from '@/types';

export function AddFoodHubPage() {
  const { date, meal, queryString } = useAddContext();
  const navigate = useNavigate();
  const favorites = useAppStore((s) => s.favorites);
  const recentItems = useAppStore((s) => s.recentItems);
  const [activeRef, setActiveRef] = useState<FoodRef | null>(null);

  function handleAdded() {
    navigate(isToday(date) ? '/' : `/diary?date=${date}`);
  }

  const resolvedFavorites = favorites
    .slice()
    .reverse()
    .map((f) => resolveFoodRef(f))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .slice(0, 6);

  const resolvedRecent = recentItems
    .map((r) => resolveFoodRef(r))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .slice(0, 6);

  return (
    <div className="space-y-7 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Add Food</h1>
        <p className="mt-1 text-sm text-muted">
          {meal ? `Adding to ${meal}` : 'Choose how you want to log food'}
          {!isToday(date) && ` · ${date}`}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AddOptionCard
          to={`/add/scan?${queryString}`}
          icon={<Camera size={22} />}
          emoji="📸"
          title="Scan Food"
          description="Snap a photo, AI estimates the nutrition"
        />
        <AddOptionCard
          to={`/add/search?${queryString}`}
          icon={<Search size={22} />}
          emoji="🔎"
          title="Search Food"
          description="Search our nutrition database"
        />
        <AddOptionCard
          to={`/add/restaurants?${queryString}`}
          icon={<Store size={22} />}
          emoji="🍽️"
          title="Restaurants"
          description="Find dishes from local restaurants"
        />
      </div>

      <section>
        <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-fg">
          <Heart size={15} className="text-red-400" /> Favorites
        </h2>
        {resolvedFavorites.length > 0 ? (
          <div className="space-y-2">
            {resolvedFavorites.map((food) => (
              <FoodRow key={`${food.refType}-${food.id}`} food={food} onClick={() => setActiveRef({ refId: food.id, refType: food.refType })} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Heart size={22} />}
            title="No favorites yet"
            description="Tap the heart on any food to save it here for one-tap logging."
          />
        )}
      </section>

      <section>
        <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-fg">
          <Clock3 size={15} className="text-muted" /> Recently Added
        </h2>
        {resolvedRecent.length > 0 ? (
          <div className="space-y-2">
            {resolvedRecent.map((food) => (
              <FoodRow key={`${food.refType}-${food.id}`} food={food} onClick={() => setActiveRef({ refId: food.id, refType: food.refType })} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Clock3 size={22} />} title="Nothing logged yet" description="Foods you add will show up here for quick re-logging." />
        )}
      </section>

      <FoodDetailModal
        open={!!activeRef}
        onClose={() => setActiveRef(null)}
        addRef={activeRef ?? undefined}
        addDate={date}
        addSource="favorite"
        onAdded={handleAdded}
      />
    </div>
  );
}

function AddOptionCard({ to, icon, emoji, title, description }: { to: string; icon: React.ReactNode; emoji: string; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl2 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.98] sm:flex-col sm:items-start sm:gap-2 sm:p-5"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-2xl text-primary-600 sm:h-14 sm:w-14">
        <span className="sm:hidden">{icon}</span>
        <span className="hidden sm:block">{emoji}</span>
      </div>
      <div className="flex-1 sm:mt-1">
        <div className="flex items-center justify-between">
          <p className="font-bold text-fg">{title}</p>
          <ChevronRight size={16} className="text-faint transition group-hover:translate-x-0.5 sm:hidden" />
        </div>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
    </Link>
  );
}
