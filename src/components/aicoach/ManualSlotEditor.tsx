import { useEffect, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { foodSearchService } from '@/services/FoodSearchService';
import { useDebounce } from '@/hooks/useDebounce';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import type { FoodItem } from '@/types';

export function ManualSlotEditor({ onAdd, onClose }: { onAdd: (foodId: string, grams: number) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState(150);

  useEffect(() => {
    let active = true;
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    foodSearchService.search({ text: debouncedQuery, limit: 6 }).then((r) => {
      if (active) setResults(r);
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  if (selected) {
    return (
      <div className="mt-2 rounded-xl bg-surface p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-fg">
            {selected.imageEmoji} {selected.name}
          </p>
          <button onClick={() => setSelected(null)} aria-label="Change food" className="text-faint hover:text-muted">
            <X size={14} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center">
          <QuantityStepper value={grams} onChange={setGrams} />
        </div>
        <button
          onClick={() => {
            onAdd(selected.id, grams);
            setSelected(null);
            setQuery('');
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-500 py-1.5 text-xs font-semibold text-white"
        >
          <Plus size={13} /> Add to this meal
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl bg-surface p-3">
      <div className="flex items-center gap-2 rounded-lg bg-surface-alt px-2.5 py-1.5">
        <Search size={13} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a food to add…"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
          autoFocus
        />
        <button onClick={onClose} aria-label="Close" className="text-faint hover:text-muted">
          <X size={14} />
        </button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 space-y-1">
          {results.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => setSelected(f)}
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
