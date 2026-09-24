import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, Store } from 'lucide-react';
import { restaurantService, allCuisines, matchRestaurants } from '@/services/RestaurantService';
import { useDebounce } from '@/hooks/useDebounce';
import { useAddContext } from '@/hooks/useAddContext';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { RestaurantMatchList } from '@/components/assistant/RestaurantMatchList';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import type { Restaurant } from '@/types';

const CUISINE_PRESETS = ['Pizza', 'Burger', 'Sushi', 'Israeli', 'Italian', 'Asian'];

export function RestaurantsPage() {
  const { queryString } = useAddContext();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    restaurantService
      .search({ text: debounced || undefined, cuisine: cuisine ?? undefined })
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, cuisine]);

  const cuisines = allCuisines().length ? CUISINE_PRESETS : [];

  const assistantCtx = useAssistantContext();
  const remaining = {
    calories: Math.max(assistantCtx.targets.calories - assistantCtx.totals.calories, 0),
    proteinG: Math.max(assistantCtx.targets.proteinG - assistantCtx.totals.proteinG, 0),
    carbsG: Math.max(assistantCtx.targets.carbsG - assistantCtx.totals.carbsG, 0),
    fatG: Math.max(assistantCtx.targets.fatG - assistantCtx.totals.fatG, 0),
  };
  const bestMatches = useMemo(() => matchRestaurants(remaining, undefined, 2), [remaining.calories, remaining.proteinG]);
  const showAiPicks = !query && !cuisine && bestMatches.length > 0;

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Restaurants</h1>
        <p className="mt-1 text-sm text-muted">Search by restaurant, city, or cuisine.</p>
      </header>

      {showAiPicks && (
        <div className="rounded-xl2 bg-ink p-4 text-white shadow-card">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <Sparkles size={15} className="text-white/70" />
            Best options for you
          </h3>
          <RestaurantMatchList matches={bestMatches} />
        </div>
      )}

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search restaurants or dishes…"
          className="input pl-11"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {cuisines.map((c) => (
          <Chip key={c} selected={cuisine === c} onClick={() => setCuisine(cuisine === c ? null : c)}>
            {c}
          </Chip>
        ))}
      </div>

      {error && <ErrorState title="Couldn't load restaurants" description="Please check your connection and try again." onRetry={() => setQuery((q) => q)} />}

      {!error && loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!error && !loading && results.length === 0 && (
        <EmptyState icon={<Store size={22} />} title="No restaurants found" description="Try a different search term or cuisine." />
      )}

      {!error && !loading && results.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {results.map((r) => (
            <Link
              key={r.id}
              to={`/add/restaurants/${r.id}?${queryString}`}
              className="flex items-center gap-3 rounded-xl2 bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.98]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-2xl">{r.imageEmoji}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{r.name}</p>
                <p className="truncate text-xs text-muted">
                  {r.cuisine.join(' · ')} · {r.city}
                </p>
                {r.rating && <p className="mt-0.5 text-xs text-amber-600">★ {r.rating.toFixed(1)}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
