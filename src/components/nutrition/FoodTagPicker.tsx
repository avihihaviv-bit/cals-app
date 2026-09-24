import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { foodSearchService } from '@/services/FoodSearchService';
import { findFoodById } from '@/data/foods';
import { useDebounce } from '@/hooks/useDebounce';
import type { FoodItem } from '@/types';

export function FoodTagPicker({
  selectedIds,
  onChange,
  tone,
  placeholder,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  tone: 'like' | 'avoid';
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<FoodItem[]>([]);

  useEffect(() => {
    let active = true;
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    foodSearchService.search({ text: debouncedQuery, limit: 6 }).then((r) => {
      if (active) setResults(r.filter((f) => !selectedIds.includes(f.id)));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  function add(id: string) {
    onChange([...selectedIds, id]);
    setQuery('');
    setResults([]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  const tagClass =
    tone === 'like'
      ? 'bg-primary-50 text-primary-700'
      : 'bg-red-50 text-red-700';

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const food = findFoodById(id);
            if (!food) return null;
            return (
              <span key={id} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}>
                {food.imageEmoji} {food.name}
                <button onClick={() => remove(id)} aria-label={`Remove ${food.name}`}>
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg bg-surface-alt px-2.5 py-1.5">
        <Search size={13} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {results.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => add(f.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-alt"
              >
                <span>{f.imageEmoji}</span>
                {f.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
