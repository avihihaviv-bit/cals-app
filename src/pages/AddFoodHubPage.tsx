import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Camera, ChevronRight, Clock3, Heart, Search, Sparkles, Store, Trash2 } from 'lucide-react';
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
  const customFoods = useAppStore((s) => s.customFoods);
  const deleteCustomFood = useAppStore((s) => s.deleteCustomFood);
  const [activeRef, setActiveRef] = useState<FoodRef | null>(null);
  const [quickText, setQuickText] = useState('');
  const [showAllMine, setShowAllMine] = useState(false);

  function submitQuickText() {
    const text = quickText.trim();
    if (!text) return;
    navigate(`/add/scan?${queryString}&text=${encodeURIComponent(text)}`);
  }

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

  const myFoods = customFoods
    .slice()
    .reverse()
    .map((f) => resolveFoodRef({ refId: f.id, refType: 'food' }))
    .filter((f): f is NonNullable<typeof f> => !!f);
  const shownMyFoods = showAllMine ? myFoods : myFoods.slice(0, 5);

  return (
    <div className="space-y-7 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Add Food</h1>
        <p className="mt-1 text-sm text-muted">
          {meal ? `Adding to ${meal}` : 'Choose how you want to log food'}
          {!isToday(date) && ` · ${date}`}
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitQuickText();
        }}
        className="rounded-xl2 bg-surface p-4 shadow-card"
      >
        <label htmlFor="quick-add" className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Sparkles size={15} className="text-primary-500" /> What did you eat?
        </label>
        <div className="mt-2.5 flex gap-2">
          <input
            id="quick-add"
            dir="auto"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="2 ביצים, פרוסת לחם, 150g קוטג׳"
            className="input flex-1 py-2.5"
          />
          <button
            type="submit"
            disabled={!quickText.trim()}
            className="shrink-0 rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:opacity-50"
          >
            Go
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Write it in any words — AI works out the calories and macros.</p>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AddOptionCard
          to={`/add/scan?${queryString}`}
          icon={<Camera size={22} />}
          emoji="📸"
          title="Scan Food"
          description="Photo of your meal or a nutrition label"
        />
        <AddOptionCard
          to={`/add/search?${queryString}`}
          icon={<Search size={22} />}
          emoji="🔎"
          title="Search Food"
          description="Built-in foods + everything you've saved"
        />
        <AddOptionCard
          to={`/add/restaurants?${queryString}`}
          icon={<Store size={22} />}
          emoji="🍽️"
          title="Restaurants"
          description="Any restaurant or dish — AI researches new ones"
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

      {myFoods.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-fg">
            <Bookmark size={15} className="text-primary-500" /> My foods
            <span className="font-normal text-muted">({myFoods.length})</span>
          </h2>
          <div className="space-y-2">
            {shownMyFoods.map((food) => (
              <div key={food.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <FoodRow food={food} onClick={() => setActiveRef({ refId: food.id, refType: 'food' })} />
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove "${food.name}" from My foods? Diary entries stay.`)) deleteCustomFood(food.id);
                  }}
                  aria-label={`Remove ${food.name} from My foods`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {myFoods.length > 5 && (
            <button onClick={() => setShowAllMine((v) => !v)} className="mt-2 text-xs font-semibold text-primary-700">
              {showAllMine ? 'Show less' : `Show all ${myFoods.length}`}
            </button>
          )}
        </section>
      )}

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
