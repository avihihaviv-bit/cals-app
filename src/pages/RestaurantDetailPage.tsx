import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ExternalLink, KeyRound, MapPin, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { dishesForRestaurant, findRestaurantById } from '@/data/restaurants';
import { researchRestaurant, ResearchError, menuDishNames } from '@/services/restaurantResearch';
import { normalizeText } from '@/services/restaurantSearch';
import { useAddContext } from '@/hooks/useAddContext';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DishCard } from '@/components/restaurants/DishCard';
import { DishSheet } from '@/components/restaurants/DishSheet';
import { ResearchProgress } from '@/components/restaurants/ResearchProgress';
import type { MealType, RestaurantDish } from '@/types';

type ResearchState =
  | { status: 'idle' }
  | { status: 'running'; label: string }
  | { status: 'done'; message: string }
  | { status: 'error'; error: ResearchError; retry: () => void };

export function RestaurantDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ? decodeURIComponent(rawId) : '';
  const { date, meal, queryString } = useAddContext();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const researchedList = useAppStore((s) => s.researchedRestaurants);
  const deleteResearched = useAppStore((s) => s.deleteResearchedRestaurant);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const restaurant = useMemo(() => findRestaurantById(id), [id, researchedList]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dishes = useMemo(() => dishesForRestaurant(id), [id, researchedList]);
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [activeDish, setActiveDish] = useState<RestaurantDish | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchState>(
    params.get('researched') ? { status: 'done', message: 'המחקר הושלם ונשמר במאגר — בפעם הבאה הוא כבר כאן.' } : { status: 'idle' },
  );

  const categories = useMemo(() => [...new Set(dishes.map((d) => d.menuCategory || 'מנות'))], [dishes]);
  const visible = dishes.filter((d) => {
    if (category && (d.menuCategory || 'מנות') !== category) return false;
    if (!filter.trim()) return true;
    const hay = normalizeText(`${d.nameHe ?? ''} ${d.name} ${(d.aliases ?? []).join(' ')} ${d.description ?? ''}`);
    return normalizeText(filter)
      .split(' ')
      .every((w) => hay.includes(w));
  });
  const grouped = categories
    .map((c) => ({ c, items: visible.filter((d) => (d.menuCategory || 'מנות') === c) }))
    .filter((g) => g.items.length > 0);

  const counts = {
    official: dishes.filter((d) => d.reliability === 'official').length,
    estimated: dishes.filter((d) => (d.reliability ?? 'estimated') === 'estimated').length,
    low: dishes.filter((d) => d.reliability === 'low').length,
  };

  if (!restaurant) {
    return (
      <div dir="rtl" className="text-right">
        <EmptyState icon={<span>🏪</span>} title="המסעדה לא נמצאה" description="ייתכן שהיא נמחקה מהמאגר." />
      </div>
    );
  }
  const r = restaurant;
  const name = r.nameHe ?? r.name;

  async function run(label: string, fn: () => Promise<{ dishes: RestaurantDish[] }>, doneText: (n: number) => string) {
    setResearch({ status: 'running', label });
    try {
      const res = await fn();
      setResearch({ status: 'done', message: doneText(res.dishes.length) });
    } catch (err) {
      const error = err instanceof ResearchError ? err : new ResearchError('משהו השתבש במחקר — נסו שוב.', String(err));
      setResearch({ status: 'error', error, retry: () => run(label, fn, doneText) });
    }
  }

  const verify = () =>
    run(
      `${name} — מחפש ערכים רשמיים`,
      () => researchRestaurant({ query: r.name, restaurant: r }),
      (n) => `עודכנו ${n} מנות. מנות שנמצא להן מידע רשמי מסומנות 🟢.`,
    );
  const loadMore = () =>
    run(
      `עוד מנות ב${name}`,
      () => researchRestaurant({ query: r.name, restaurant: r, excludeDishNames: menuDishNames(r.id) }),
      (n) => `נוספו ${n} מנות לתפריט.`,
    );
  const findDish = (dish: string) =>
    run(
      `${dish} ב${name}`,
      () => researchRestaurant({ query: r.name, restaurant: r, dishFocus: dish }),
      (n) => `נמצאו ${n} מנות תואמות ונוספו לתפריט.`,
    );

  function onAdded(_d: RestaurantDish, m: MealType) {
    setActiveDish(null);
    const names: Record<MealType, string> = { breakfast: 'ארוחת הבוקר', lunch: 'ארוחת הצהריים', dinner: 'ארוחת הערב', snacks: 'הנשנושים' };
    setToast(`נוסף ל${names[m]} ✓`);
    window.setTimeout(() => setToast(null), 2600);
  }

  const busy = research.status === 'running';

  return (
    <div dir="rtl" className="space-y-5 pb-6 text-right">
      <Link to={`/add/restaurants?${queryString}`} onClick={(e) => { e.preventDefault(); navigate(-1); }} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
        <ChevronRight size={16} /> חזרה למסעדות
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-xl2 bg-surface shadow-card">
        <div className={`flex items-center gap-4 bg-gradient-to-br ${r.brandColor ?? 'from-primary-600 to-primary-400'} p-5 text-white`}>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-4xl backdrop-blur-sm">{r.imageEmoji}</div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold drop-shadow-sm">{name}</h1>
            <p className="truncate text-sm text-white/85">
              {r.categoryHe ?? r.cuisine.join(' · ')}
              {r.nameHe && r.nameHe !== r.name ? ` · ${r.name}` : ''}
            </p>
          </div>
        </div>
        <div className="space-y-2 p-4 text-sm">
          {r.branchesNote && (
            <p className="flex items-center gap-1.5 text-muted">
              <MapPin size={14} className="shrink-0" /> {r.branchesNote}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {r.website && (
              <a href={r.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1 text-xs font-semibold text-fg hover:bg-surface-alt2">
                <ExternalLink size={12} /> האתר הרשמי
              </a>
            )}
            <a
              href={`https://www.google.com/maps/search/${encodeURIComponent(`${name} סניף`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-3 py-1 text-xs font-semibold text-fg hover:bg-surface-alt2"
            >
              <MapPin size={12} /> סניפים במפה
            </a>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted">
            <span>🟢 {counts.official} רשמי</span>
            <span>🟡 {counts.estimated} משוער</span>
            <span>🔴 {counts.low} לא אמין</span>
          </div>
          {counts.official < dishes.length && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              ערכים משוערים – לא אומתו מול המסעדה (בכל מנה שמסומנת 🟡 או 🔴).
            </p>
          )}
        </div>
      </motion.div>

      {/* AI actions */}
      {!busy && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="secondary" icon={<ShieldCheck size={16} />} onClick={verify}>
            🔍 אמת ערכים רשמיים עם AI
          </Button>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={loadMore}>
            טען עוד מנות עם AI
          </Button>
        </div>
      )}

      {research.status === 'running' && <ResearchProgress title={research.label} />}
      {research.status === 'done' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start justify-between gap-2 rounded-xl2 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          <span>✓ {research.message}</span>
          <button onClick={() => setResearch({ status: 'idle' })} className="text-xs font-semibold underline">
            סגור
          </button>
        </motion.div>
      )}
      {research.status === 'error' && (
        <div className="space-y-2">
          <ErrorState title="המחקר לא הושלם" description={research.error.message} onRetry={research.retry} />
          {research.error.detail && <p className="break-words px-2 text-center text-[11px] text-faint">פרטים: {research.error.detail}</p>}
          {research.error.needsApiKey && (
            <Button fullWidth icon={<KeyRound size={16} />} onClick={() => navigate('/settings')}>
              להגדרות — הוספת מפתח Gemini
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={() => setResearch({ status: 'idle' })}>
            סגור
          </Button>
        </div>
      )}

      {/* Menu */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-base font-bold text-fg">
            התפריט <span className="text-sm font-normal text-muted">({dishes.length} מנות)</span>
          </h2>
        </div>
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} dir="auto" placeholder={`חיפוש בתפריט של ${name}…`} className="input py-2.5 ps-10" />
        </div>
        {categories.length > 1 && (
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chip selected={!category} onClick={() => setCategory(null)}>
              הכל
            </Chip>
            {categories.map((c) => (
              <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}

        {grouped.length === 0 && (
          <div className="space-y-2.5 rounded-xl2 bg-surface p-5 text-center shadow-card">
            <p className="text-sm text-muted">{filter ? `“${filter}” לא נמצא בתפריט השמור.` : 'אין מנות בקטגוריה הזו.'}</p>
            {filter.trim() && !busy && (
              <Button onClick={() => findDish(filter.trim())}>
                🔍 חפש את “{filter.trim()}” ב{name} עם AI
              </Button>
            )}
          </div>
        )}

        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.c}>
              {categories.length > 1 && !category && <h3 className="mb-2 text-sm font-semibold text-muted">{g.c}</h3>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.items.map((d, i) => (
                  <DishCard key={d.id} dish={d} onAdd={() => setActiveDish(d)} index={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sources */}
      {r.researchedAt && (
        <section className="rounded-xl2 bg-surface p-4 shadow-card">
          <h2 className="text-sm font-bold text-fg">מקורות המחקר</h2>
          <p className="mt-0.5 text-xs text-muted">נחקר ב-{new Date(r.researchedAt).toLocaleDateString('he-IL')}</p>
          {r.grounded && r.sources && r.sources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {r.sources.slice(0, 12).map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-700 underline" dir="auto">
                    <ExternalLink size={11} /> {s.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              החיפוש באינטרנט לא היה זמין במחקר הזה, ולכן כל הערכים מסומנים כמשוערים.
            </p>
          )}
          {r.origin === 'ai' && (
            <button
              onClick={() => {
                if (window.confirm(`למחוק את ${name} מהמאגר השמור? רישומים קיימים ביומן יישארו.`)) {
                  deleteResearched(r.id);
                  navigate(`/add/restaurants?${queryString}`);
                }
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
            >
              <Trash2 size={12} /> מחק מסעדה שמורה
            </button>
          )}
        </section>
      )}

      <DishSheet dish={activeDish} restaurant={r} date={date} defaultMeal={meal} onClose={() => setActiveDish(null)} onAdded={onAdded} />

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
