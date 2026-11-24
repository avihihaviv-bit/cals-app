import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Search, Sparkles, Telescope, X } from 'lucide-react';
import { allRestaurants, findRestaurantById } from '@/data/restaurants';
import { searchRestaurants, looksLikeRestaurantName } from '@/services/restaurantSearch';
import { researchRestaurant, ResearchError } from '@/services/restaurantResearch';
import { useAddContext } from '@/hooks/useAddContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/store/useAppStore';
import { markUpdateBusy } from '@/hooks/useAutoUpdate';
import { getAiAccessKey } from '@/utils/geminiKey';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { DishCard } from '@/components/restaurants/DishCard';
import { DishSheet } from '@/components/restaurants/DishSheet';
import { ResearchProgress } from '@/components/restaurants/ResearchProgress';
import type { MealType, Restaurant, RestaurantDish } from '@/types';

const EXAMPLES = ['Big Mac', 'ארומה', 'פיצה האט', 'המבורגר 200 גרם', 'סושי סלמון', 'בורגר עם צ׳יפס'];

export function RestaurantsPage() {
  const { date, meal, queryString } = useAddContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const debounced = useDebounce(query, 120);
  const [focused, setFocused] = useState(false);
  const [activeDish, setActiveDish] = useState<RestaurantDish | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [research, setResearch] = useState<{ status: 'idle' } | { status: 'running'; label: string } | { status: 'error'; error: ResearchError; retry: () => void }>({ status: 'idle' });
  const researched = useAppStore((s) => s.researchedRestaurants);
  const researchRunning = research.status === 'running';
  useEffect(() => {
    if (!researchRunning) return;
    markUpdateBusy(true);
    return () => markUpdateBusy(false);
  }, [researchRunning]);

  const inputRef = useRef<HTMLInputElement>(null);
  const hasKey = !!getAiAccessKey();

  // Keep the query in the URL so "back" from a restaurant returns to the same results.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debounced.trim()) next.set('q', debounced.trim());
    else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // A new search clears a previous research error.
  useEffect(() => {
    setResearch((r) => (r.status === 'error' ? { status: 'idle' } : r));
  }, [debounced]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => searchRestaurants(debounced), [debounced, researched]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const restaurants = useMemo(() => allRestaurants(), [researched]);
  const builtin = restaurants.filter((r) => r.origin !== 'ai');
  const mine = restaurants.filter((r) => r.origin === 'ai');
  const q = debounced.trim();
  const topRestaurant = results.restaurants[0]?.restaurant;

  // What the AI could research for this query.
  const showResearchRestaurant = !!q && (results.restaurants.length === 0 || (looksLikeRestaurantName(q) && results.restaurants[0].score < 0.85));
  const dishPartForTop = topRestaurant ? leftoverWords(q, topRestaurant) : '';
  const showResearchDish = !!q && !!topRestaurant && !!dishPartForTop && !results.dishes.some((d) => d.dish.restaurantId === topRestaurant.id && d.score >= 0.9);

  async function runResearch(label: string, run: () => Promise<Restaurant>) {
    setResearch({ status: 'running', label });
    try {
      const r = await run();
      setResearch({ status: 'idle' });
      navigate(`/add/restaurants/${encodeURIComponent(r.id)}?${queryString}&researched=1`);
    } catch (err) {
      const error = err instanceof ResearchError ? err : new ResearchError('משהו השתבש במחקר — נסו שוב.', String(err));
      setResearch({ status: 'error', error, retry: () => runResearch(label, run) });
    }
  }

  function researchNewRestaurant() {
    runResearch(`“${q}”`, async () => (await researchRestaurant({ query: q })).restaurant);
  }

  function researchDish(r: Restaurant, dish: string) {
    runResearch(`${dish} ב${r.nameHe ?? r.name}`, async () => (await researchRestaurant({ query: q, restaurant: r, dishFocus: dish })).restaurant);
  }

  function onAdded(_dish: RestaurantDish, m: MealType) {
    setActiveDish(null);
    const names: Record<MealType, string> = { breakfast: 'ארוחת הבוקר', lunch: 'ארוחת הצהריים', dinner: 'ארוחת הערב', snacks: 'הנשנושים' };
    setToast(`נוסף ל${names[m]} ✓`);
    window.setTimeout(() => setToast(null), 2600);
  }

  const suggestions = focused && q ? [...results.restaurants.slice(0, 3).map((h) => ({ kind: 'r' as const, r: h.restaurant })), ...results.dishes.slice(0, 4).map((h) => ({ kind: 'd' as const, d: h.dish, r: h.restaurant }))] : [];

  return (
    <div dir="rtl" className="space-y-5 pb-6 text-right">
      <header>
        <h1 className="text-2xl font-bold text-fg">מסעדות ומנות</h1>
        <p className="mt-1 text-sm text-muted">חפשו מסעדה או מנה — ואם היא לא במאגר, ה-AI יחקור אותה בשבילכם.</p>
      </header>

      {/* Search with autocomplete */}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          placeholder="שם מסעדה, מנה או סוג אוכל…"
          className="input pe-10 ps-11"
          aria-label="חיפוש מסעדות ומנות"
          aria-autocomplete="list"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="נקה חיפוש"
            className="absolute end-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-faint hover:bg-surface-alt2"
          >
            <X size={15} />
          </button>
        )}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              role="listbox"
              className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl2 bg-surface shadow-floating"
            >
              {suggestions.map((s) => (
                <li key={s.kind === 'r' ? `r-${s.r.id}` : `d-${s.d.id}`}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setFocused(false);
                      if (s.kind === 'r') navigate(`/add/restaurants/${encodeURIComponent(s.r.id)}?${queryString}`);
                      else setActiveDish(s.d);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition hover:bg-surface-alt"
                  >
                    <span className="text-lg">{s.kind === 'r' ? s.r.imageEmoji : s.d.imageEmoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{s.kind === 'r' ? (s.r.nameHe ?? s.r.name) : (s.d.nameHe ?? s.d.name)}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {s.kind === 'r' ? (s.r.categoryHe ?? 'מסעדה') : `${s.r?.nameHe ?? s.r?.name ?? ''} · ${Math.round(s.d.perServing?.calories ?? 0)} קק״ל`}
                      </span>
                    </span>
                    <span className="text-[10px] font-semibold text-faint">{s.kind === 'r' ? 'מסעדה' : 'מנה'}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {!q && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuery(ex)}
              className="rounded-full border border-default bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-primary-300 hover:text-primary-700"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {research.status === 'running' && <ResearchProgress title={research.label} />}
      {research.status === 'error' && (
        <div className="space-y-2">
          <ErrorState title="המחקר לא הושלם" description={research.error.message} onRetry={research.retry} />
          {research.error.detail && <p className="break-words px-2 text-center text-[11px] text-faint">פרטים: {research.error.detail}</p>}
          {research.error.needsApiKey && (
            <Button fullWidth icon={<KeyRound size={16} />} onClick={() => navigate('/settings')}>
              להגדרות — הוספת מפתח Gemini
            </Button>
          )}
          <Button fullWidth variant="secondary" onClick={() => setResearch({ status: 'idle' })}>
            סגור
          </Button>
        </div>
      )}

      {research.status === 'idle' && q && (
        <>
          {results.restaurants.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-bold text-fg">מסעדות</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.restaurants.map((h, i) => (
                  <RestaurantCard key={h.restaurant.id} restaurant={h.restaurant} to={`/add/restaurants/${encodeURIComponent(h.restaurant.id)}?${queryString}`} index={i} />
                ))}
              </div>
            </section>
          )}

          {results.dishes.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-bold text-fg">
                מנות <span className="font-normal text-muted">({results.dishes.length})</span>
                {results.parsed.grams ? <span className="ms-1 text-xs font-normal text-muted">· קרוב ל-{results.parsed.grams} גרם קודם</span> : null}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.dishes.map((h, i) => (
                  <DishCard key={h.dish.id} dish={h.dish} restaurant={h.restaurant} onAdd={() => setActiveDish(h.dish)} index={i} />
                ))}
              </div>
            </section>
          )}

          {results.restaurants.length === 0 && results.dishes.length === 0 && (
            <div className="rounded-xl2 bg-surface p-5 text-center shadow-card">
              <p className="text-3xl">🔎</p>
              <p className="mt-1 font-semibold text-fg">“{q}” עוד לא במאגר</p>
              <p className="mt-1 text-sm text-muted">זה לא סוף הדרך — ה-AI יכול לחקור את המסעדה ולמצוא את התפריט והערכים.</p>
            </div>
          )}

          {/* AI actions */}
          <section className="space-y-2.5">
            {showResearchRestaurant && (
              <AiAction
                icon={<Telescope size={18} />}
                title={`🔍 חקור מסעדה באמצעות AI: “${q}”`}
                subtitle="חיפוש באינטרנט: אתר רשמי, תפריט, אתרי משלוחים ומידע תזונתי. התוצאות יישמרו במאגר."
                onClick={researchNewRestaurant}
                primary
              />
            )}
            {showResearchDish && topRestaurant && (
              <AiAction
                icon={<Telescope size={18} />}
                title={`🔍 חפש את “${dishPartForTop}” ב${topRestaurant.nameHe ?? topRestaurant.name} עם AI`}
                subtitle="ה-AI יחפש את המנה הזו ואת הערכים שלה ויוסיף אותה לתפריט."
                onClick={() => researchDish(topRestaurant, dishPartForTop)}
              />
            )}
            <AiAction
              icon={<Sparkles size={18} />}
              title={`✨ חשב את “${q}” כמנה עם AI`}
              subtitle="מתאים למנה ביתית או כללית — כתבו גם כמות, למשל “המבורגר 200 גרם עם צ׳יפס”."
              onClick={() => navigate(`/add/scan?${queryString}&text=${encodeURIComponent(q)}`)}
            />
            {!hasKey && (
              <p className="flex items-center gap-1.5 px-1 text-[11px] text-amber-800">
                <KeyRound size={12} /> פעולות ה-AI צריכות מפתח Gemini חינמי —{' '}
                <Link to="/settings" className="font-semibold underline">
                  הוסיפו בהגדרות
                </Link>
              </p>
            )}
          </section>
        </>
      )}

      {research.status === 'idle' && !q && (
        <>
          {mine.length > 0 && (
            <section>
              <h2 className="mb-2.5 text-sm font-bold text-fg">מסעדות שחקרתם</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {mine.map((r, i) => (
                  <RestaurantCard key={r.id} restaurant={r} to={`/add/restaurants/${encodeURIComponent(r.id)}?${queryString}`} index={i} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2.5 text-sm font-bold text-fg">רשתות במאגר</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {builtin.map((r, i) => (
                <RestaurantCard key={r.id} restaurant={r} to={`/add/restaurants/${encodeURIComponent(r.id)}?${queryString}`} index={i} />
              ))}
            </div>
          </section>
        </>
      )}

      <DishSheet
        dish={activeDish}
        restaurant={activeDish ? findRestaurantById(activeDish.restaurantId) : undefined}
        date={date}
        defaultMeal={meal}
        onClose={() => setActiveDish(null)}
        onAdded={onAdded}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl2 bg-ink px-4 py-3 text-sm text-white shadow-floating lg:bottom-8"
            role="status"
          >
            <span>{toast}</span>
            <Link to={`/diary?date=${date}`} className="font-semibold underline">
              ליומן
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Words of the query that aren't part of the restaurant's name — the likely dish ("מקדונלדס מקראפ" → "מקראפ"). */
function leftoverWords(q: string, r: Restaurant): string {
  const nameText = [r.name, r.nameHe, ...(r.aliases ?? [])].join(' ').toLowerCase().replace(/["'׳״`’]/g, '');
  return q
    .split(/\s+/)
    .filter((w) => {
      const x = w.toLowerCase().replace(/["'׳״`’]/g, '');
      return x && !nameText.includes(x);
    })
    .join(' ')
    .trim();
}

export function RestaurantCard({ restaurant: r, to, index = 0 }: { restaurant: Restaurant; to: string; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: Math.min(index, 12) * 0.03 }}>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-xl2 bg-surface p-3.5 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated active:scale-[0.98]"
      >
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${r.brandColor ?? 'from-primary-600 to-primary-400'} text-2xl shadow-sm`}>
          <span className="drop-shadow">{r.imageEmoji ?? '🍽️'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-fg">{r.nameHe ?? r.name}</p>
          <p className="truncate text-xs text-muted">
            {r.categoryHe ?? r.cuisine.join(' · ')}
            {r.nameHe && r.nameHe !== r.name ? ` · ${r.name}` : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            {r.origin === 'ai' ? (r.grounded ? '🔍 נחקר באינטרנט' : '🤖 נחקר ע״י AI') : r.researchedAt ? '🔍 אומת חלקית עם AI' : '📋 ערכים משוערים'}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

function AiAction({ icon, title, subtitle, onClick, primary }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl2 p-4 text-right transition active:scale-[0.99] ${
        primary ? 'bg-ink text-white shadow-elevated hover:opacity-95' : 'border border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${primary ? 'bg-white/15' : 'bg-primary-500 text-white'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold" dir="auto">
          {title}
        </span>
        <span className={`block text-xs ${primary ? 'text-white/70' : 'text-primary-700'}`}>{subtitle}</span>
      </span>
    </button>
  );
}
