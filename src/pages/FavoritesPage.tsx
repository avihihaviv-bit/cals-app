import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Heart } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { resolveFoodRef } from '@/utils/resolveFoodRef';
import { FoodRow } from '@/components/food/FoodRow';
import { FoodDetailModal } from '@/components/food/FoodDetailModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { todayISO } from '@/utils/date';
import type { FoodRef } from '@/types';

type Tab = 'favorites' | 'recent';

export function FavoritesPage() {
  const navigate = useNavigate();
  const favorites = useAppStore((s) => s.favorites);
  const recentItems = useAppStore((s) => s.recentItems);
  const [tab, setTab] = useState<Tab>('favorites');
  const [activeRef, setActiveRef] = useState<FoodRef | null>(null);

  const resolvedFavorites = favorites
    .slice()
    .reverse()
    .map((f) => resolveFoodRef(f))
    .filter((f): f is NonNullable<typeof f> => !!f);

  const resolvedRecent = recentItems.map((r) => resolveFoodRef(r)).filter((f): f is NonNullable<typeof f> => !!f);

  const list = tab === 'favorites' ? resolvedFavorites : resolvedRecent;

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Favorites</h1>
        <p className="mt-1 text-sm text-muted">One-tap logging for the foods you eat often.</p>
      </header>

      <div className="flex gap-2 rounded-xl bg-surface-alt2 p-1">
        <TabButton active={tab === 'favorites'} onClick={() => setTab('favorites')} icon={<Heart size={14} />} label="Favorites" />
        <TabButton active={tab === 'recent'} onClick={() => setTab('recent')} icon={<Clock3 size={14} />} label="Recent" />
      </div>

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map((food) => (
            <FoodRow key={`${food.refType}-${food.id}`} food={food} onClick={() => setActiveRef({ refId: food.id, refType: food.refType })} />
          ))}
        </div>
      ) : tab === 'favorites' ? (
        <EmptyState icon={<Heart size={22} />} title="No favorites yet" description="Tap the heart icon on any food's details to save it here." />
      ) : (
        <EmptyState icon={<Clock3 size={22} />} title="Nothing logged yet" description="Foods you log will appear here for quick re-adding." />
      )}

      <FoodDetailModal
        open={!!activeRef}
        onClose={() => setActiveRef(null)}
        addRef={activeRef ?? undefined}
        addDate={todayISO()}
        addSource={tab === 'favorites' ? 'favorite' : 'recent'}
        onAdded={() => navigate('/')}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
        active ? 'bg-surface text-fg shadow-card' : 'text-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
