import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { RestaurantMatch } from '@/services/RestaurantService';

const RANK_EMOJI = ['🥇', '🥈', '🥉'];

export function RestaurantMatchList({ matches }: { matches: RestaurantMatch[] }) {
  return (
    <div className="space-y-2">
      {matches.map((m, i) => (
        <div key={m.restaurant.id} className="rounded-xl bg-surface-alt p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg">
              {RANK_EMOJI[i] ?? '🍽️'} {m.restaurant.name}
            </span>
            <span className="text-[10px] font-bold text-primary-600">{m.matchScore}% match</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            Try: {m.bestDish.name} · ~{Math.round((m.bestDish.per100g.calories * m.bestDish.defaultServing.grams) / 100)} kcal · 🌿{' '}
            {m.bestDish.naturalness.score}% natural
          </p>
          {m.reasons.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {m.reasons.map((r) => (
                <li key={r} className="flex items-center gap-1 text-[11px] text-muted">
                  <Check size={11} className="text-primary-500" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          <Link
            to={`/add/restaurants/${m.restaurant.id}`}
            className="mt-1.5 block w-full rounded-lg bg-primary-500 py-1.5 text-center text-[11px] font-semibold text-white transition hover:bg-primary-600"
          >
            View Menu
          </Link>
        </div>
      ))}
    </div>
  );
}
