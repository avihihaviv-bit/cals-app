import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { DataQualityBadge } from '@/components/ui/DataQualityBadge';
import { useAICoachData } from '@/hooks/useAICoachData';
import { RESTAURANTS, dishesForRestaurant } from '@/data/restaurants';
import { allCities, allCuisines } from '@/services/RestaurantService';
import { calculateNutrition } from '@/utils/nutritionCalculator';
import { approxRange } from '@/utils/approxRange';
import { computeMatchScore, matchReasons } from '@/utils/restaurantMatchScore';
import type { MatchPriority, MatchScoreBreakdown } from '@/utils/restaurantMatchScore';
import { requestBrowserLocation, approxDistanceToCityKm } from '@/utils/restaurantDistance';
import type { Coordinates } from '@/utils/restaurantDistance';
import type { Restaurant, RestaurantDish } from '@/types';

type LocationMode = 'any' | 'near_me' | 'city';

const PRIORITIES: { value: MatchPriority; label: string }[] = [
  { value: 'protein', label: '🥩 High Protein' },
  { value: 'calories', label: '🔥 Low Calories' },
  { value: 'balance', label: '⚖️ Balance' },
  { value: 'cheap', label: '💰 Cheap' },
  { value: 'tasty', label: '😋 Tastiest' },
  { value: 'closest', label: '📍 Closest' },
];

interface RankedResult {
  restaurant: Restaurant;
  dish: RestaurantDish;
  breakdown: MatchScoreBreakdown;
  distanceKm: number | null;
}

export function AIRestaurantFinderView() {
  const { remaining, profile } = useAICoachData();
  const cuisines = useMemo(() => ['Any', ...allCuisines()], []);
  const cities = useMemo(() => allCities(), []);

  const [locationMode, setLocationMode] = useState<LocationMode>('any');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState('Any');
  const [priority, setPriority] = useState<MatchPriority | null>(null);
  const [highProteinLowCalMode, setHighProteinLowCalMode] = useState(false);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'>('idle');
  const [searched, setSearched] = useState(false);

  async function chooseNearMe() {
    setLocationMode('near_me');
    setLocationStatus('requesting');
    const result = await requestBrowserLocation();
    if (result.status === 'granted') {
      setUserCoords(result.coords);
      setLocationStatus('granted');
    } else {
      setLocationStatus(result.status);
    }
  }

  const results = useMemo<RankedResult[]>(() => {
    if (!searched) return [];
    let candidates = RESTAURANTS;
    if (locationMode === 'city' && selectedCity) candidates = candidates.filter((r) => r.city === selectedCity);
    if (cuisine !== 'Any') candidates = candidates.filter((r) => r.cuisine.includes(cuisine));

    const effectivePriority = highProteinLowCalMode ? 'protein' : priority;

    const ranked: RankedResult[] = [];
    for (const restaurant of candidates) {
      const dishes = dishesForRestaurant(restaurant.id);
      let best: { dish: RestaurantDish; breakdown: MatchScoreBreakdown; distanceKm: number | null } | null = null;
      const distanceKm = userCoords ? approxDistanceToCityKm(userCoords, restaurant.city) : null;

      for (const dish of dishes) {
        const totals = calculateNutrition(dish.per100g, dish.defaultServing.grams);
        const meetsHighProteinLowCal = !highProteinLowCalMode || (totals.proteinG >= 25 && totals.calories <= remaining.calories);
        if (!meetsHighProteinLowCal) continue;
        const breakdown = computeMatchScore(
          {
            dish: totals,
            remaining,
            distanceKm,
            cuisineMatchesPreference: cuisine === 'Any' ? undefined : restaurant.cuisine.includes(cuisine),
          },
          effectivePriority,
          profile?.goal,
        );
        if (!best || breakdown.score > best.breakdown.score) best = { dish, breakdown, distanceKm };
      }
      if (best) ranked.push({ restaurant, ...best });
    }

    return ranked.sort((a, b) => b.breakdown.score - a.breakdown.score).slice(0, 5);
  }, [searched, locationMode, selectedCity, cuisine, priority, highProteinLowCalMode, userCoords, remaining, profile]);

  return (
    <div className="space-y-5 pb-4">
      <div className="rounded-xl2 bg-surface p-4 shadow-card">
        <p className="mb-3 text-sm font-bold text-fg">📍 Where?</p>
        <div className="flex flex-wrap gap-2">
          <Chip selected={locationMode === 'any'} onClick={() => setLocationMode('any')}>
            Anywhere
          </Chip>
          <Chip selected={locationMode === 'near_me'} onClick={chooseNearMe}>
            Near Me
          </Chip>
          {cities.map((c) => (
            <Chip
              key={c}
              selected={locationMode === 'city' && selectedCity === c}
              onClick={() => {
                setLocationMode('city');
                setSelectedCity(c);
              }}
            >
              {c}
            </Chip>
          ))}
        </div>
        {locationMode === 'near_me' && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <MapPin size={12} />
            {locationStatus === 'requesting' && 'Requesting location permission…'}
            {locationStatus === 'granted' && 'Using your location for approximate distance to each city.'}
            {locationStatus === 'denied' && "Location permission wasn't granted — results will show without distance."}
            {locationStatus === 'unavailable' && "This browser doesn't support location — results will show without distance."}
          </p>
        )}

        <p className="mb-2 mt-4 text-sm font-bold text-fg">🍽️ What cuisine?</p>
        <div className="flex flex-wrap gap-2">
          {cuisines.map((c) => (
            <Chip key={c} selected={cuisine === c} onClick={() => setCuisine(c)}>
              {c}
            </Chip>
          ))}
        </div>

        <p className="mb-2 mt-4 text-sm font-bold text-fg">🎯 What's your priority?</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <Chip key={p.value} selected={priority === p.value && !highProteinLowCalMode} onClick={() => { setPriority(p.value); setHighProteinLowCalMode(false); }}>
              {p.label}
            </Chip>
          ))}
        </div>

        <button
          onClick={() => setHighProteinLowCalMode((v) => !v)}
          className={`mt-4 flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition ${
            highProteinLowCalMode ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-default bg-surface text-fg'
          }`}
        >
          🥩 High Protein / 🔥 Lower Calories mode
          <span className={`h-5 w-9 rounded-full transition ${highProteinLowCalMode ? 'bg-primary-500' : 'bg-surface-alt3'}`}>
            <span className={`block h-4 w-4 translate-y-0.5 rounded-full bg-surface transition ${highProteinLowCalMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>

        <Button fullWidth size="lg" className="mt-4" onClick={() => setSearched(true)}>
          🏪 Find Restaurants
        </Button>
      </div>

      {searched && results.length === 0 && (
        <p className="rounded-xl2 bg-surface p-6 text-center text-sm text-muted shadow-card">
          No matches for those filters — try a different cuisine or location.
        </p>
      )}

      {results.map((r, i) => (
        <ResultCard key={r.restaurant.id} rank={i} result={r} remaining={remaining} />
      ))}
    </div>
  );
}

const RANK_LABELS = ['🥇 BEST MATCH', '🥈 GREAT OPTION', '🥉 GOOD OPTION'];

function ResultCard({ rank, result, remaining }: { rank: number; result: RankedResult; remaining: { calories: number; proteinG: number; carbsG: number; fatG: number } }) {
  const { restaurant, dish, breakdown, distanceKm } = result;
  const totals = calculateNutrition(dish.per100g, dish.defaultServing.grams);
  const reasons = matchReasons(breakdown, totals, remaining);
  const showApprox = dish.dataQuality !== 'verified';
  const calRange = approxRange(totals.calories);
  const proteinRange = approxRange(totals.proteinG);

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <p className="text-xs font-bold text-primary-600">{RANK_LABELS[rank] ?? `#${rank + 1} MATCH`}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-base font-bold text-fg">
            <span>{restaurant.imageEmoji}</span>
            {restaurant.name}
          </p>
          {distanceKm != null && (
            <p className="text-xs text-muted">
              📍 ~{distanceKm}km from you <span className="text-faint">(approximate distance to {restaurant.city})</span>
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">⭐ {breakdown.score}% Match</span>
      </div>

      <div className="mt-3 rounded-xl bg-surface-alt p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          <span>{dish.imageEmoji}</span>
          {dish.name}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <DataQualityBadge quality={dish.dataQuality} compact />
          {!dish.nutritionReliable && <span className="text-[10px] text-muted">Restaurant nutrition varies by branch/chef</span>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <span>
            🔥 {showApprox ? `Approximately ${calRange.min}–${calRange.max} kcal` : `${totals.calories} kcal`}
          </span>
          <span>
            🥩 {showApprox ? `Approximately ${proteinRange.min}–${proteinRange.max}g protein` : `${Math.round(totals.proteinG)}g protein`}
          </span>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-fg">Why this fits you:</p>
          <ul className="mt-1 space-y-0.5">
            {reasons.map((r) => (
              <li key={r} className="text-xs text-muted">
                ✓ {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Link
          to={`/add/restaurants/${restaurant.id}`}
          className="flex-1 rounded-lg bg-surface-alt py-2 text-center text-xs font-semibold text-fg transition hover:bg-surface-alt2"
        >
          View Restaurant
        </Link>
        <Link
          to={`/add/restaurants/${restaurant.id}`}
          className="flex-1 rounded-lg bg-primary-500 py-2 text-center text-xs font-semibold text-white transition hover:bg-primary-600"
        >
          View Dish
        </Link>
      </div>
    </div>
  );
}
