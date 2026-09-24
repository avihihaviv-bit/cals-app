import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SearchX } from 'lucide-react';
import { foodSearchService } from '@/services/FoodSearchService';
import { FOODS } from '@/data/foods';
import { resolveFoodRef, type ResolvedFood } from '@/utils/resolveFoodRef';
import { FoodRow } from '@/components/food/FoodRow';
import { FoodDetailModal } from '@/components/food/FoodDetailModal';
import { FoodRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Chip } from '@/components/ui/Chip';
import { useDebounce } from '@/hooks/useDebounce';
import { useAddContext } from '@/hooks/useAddContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { FoodRef } from '@/types';

type NutrientFilter = 'high_protein' | 'low_calorie' | 'low_fat' | 'high_carb' | 'popular';

const FILTERS: { value: NutrientFilter; label: string }[] = [
  { value: 'high_protein', label: '🔥 High Protein' },
  { value: 'low_calorie', label: '⬇️ Low Calorie' },
  { value: 'low_fat', label: '🥑 Low Fat' },
  { value: 'high_carb', label: '🍚 High Carb' },
  { value: 'popular', label: '⭐ Popular' },
];

const POPULAR_IDS = new Set(['chicken-breast', 'banana', 'white-rice', 'eggs', 'greek-yogurt', 'oatmeal', 'avocado', 'salmon']);

function matchesFilter(food: ResolvedFood, filter: NutrientFilter | null): boolean {
  if (!filter) return true;
  switch (filter) {
    case 'high_protein':
      return food.per100g.proteinG >= 15;
    case 'low_calorie':
      return food.per100g.calories <= 100;
    case 'low_fat':
      return food.per100g.fatG <= 3;
    case 'high_carb':
      return food.per100g.carbsG >= 20;
    case 'popular':
      return POPULAR_IDS.has(food.id);
  }
}

export function FoodSearchPage() {
  const { date, meal, queryString } = useAddContext();
  const navigate = useNavigate();
  const online = useOnlineStatus();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [results, setResults] = useState<ResolvedFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeRef, setActiveRef] = useState<FoodRef | null>(null);
  const [filter, setFilter] = useState<NutrientFilter | null>(null);

  const allFoods = useMemo(
    () => FOODS.map((f) => resolveFoodRef({ refId: f.id, refType: 'food' })).filter((f): f is ResolvedFood => !!f),
    [],
  );

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setError(false);
      return;
    }
    if (!online) {
      setError(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    foodSearchService
      .search({ text: debouncedQuery })
      .then((foods) => {
        if (cancelled) return;
        const resolved = foods
          .map((f) => resolveFoodRef({ refId: f.id, refType: 'food' }))
          .filter((f): f is ResolvedFood => !!f);
        setResults(resolved);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, online]);

  function handleAdded() {
    navigate(`/diary?date=${date}`);
  }

  const browsing = !debouncedQuery.trim() && !!filter;
  const baseResults = debouncedQuery.trim() ? results : browsing ? allFoods : [];
  const displayedResults = baseResults.filter((f) => matchesFilter(f, filter));

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Search Food</h1>
        <p className="mt-1 text-sm text-muted">{meal ? `Adding to ${meal} · ${date}` : `Adding for ${date}`}</p>
      </header>

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods e.g. chicken breast, banana, פסטה"
          className="input pl-11"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(filter === f.value ? null : f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {!online && !query && (
        <ErrorState offline title="You're offline" description="Food search needs a connection. Try favorites or recent foods instead." />
      )}

      {error && query && <ErrorState offline={!online} title="Couldn't load results" description="Please check your connection and try again." onRetry={() => setQuery((q) => q + ' ')} />}

      {!error && loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <FoodRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!error && !loading && (debouncedQuery.trim() || browsing) && displayedResults.length === 0 && (
        <EmptyState
          icon={<SearchX size={22} />}
          title="No results"
          description={
            debouncedQuery.trim()
              ? `We couldn't find "${debouncedQuery}" matching this filter.`
              : "No foods match this filter yet."
          }
        />
      )}

      {!error && !loading && displayedResults.length > 0 && (
        <div className="space-y-2">
          {displayedResults.map((food) => (
            <FoodRow key={food.id} food={food} onClick={() => setActiveRef({ refId: food.id, refType: 'food' })} />
          ))}
        </div>
      )}

      {!query && !filter && (
        <p className="pt-4 text-center text-xs text-muted">Try &quot;chicken&quot;, &quot;rice&quot;, &quot;banana&quot;, or &quot;פסטה&quot;</p>
      )}

      <FoodDetailModal
        open={!!activeRef}
        onClose={() => setActiveRef(null)}
        addRef={activeRef ?? undefined}
        addDate={date}
        addSource="search"
        onAdded={handleAdded}
      />
    </div>
  );
}
