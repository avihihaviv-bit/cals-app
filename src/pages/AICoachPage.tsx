import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  ChefHat,
  ChevronLeft,
  Flame,
  Mic,
  Search,
  Send,
  Settings2,
  Sparkles,
  Store,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { DailyAnalysisView } from '@/components/aicoach/DailyAnalysisView';
import { WhatToEatView } from '@/components/aicoach/WhatToEatView';
import { RecipeCreatorView } from '@/components/aicoach/RecipeCreatorView';
import { MealPlanAnalyzerView } from '@/components/aicoach/MealPlanAnalyzerView';
import { MealPlanBuilderView } from '@/components/aicoach/MealPlanBuilderView';
import { AIRestaurantFinderView } from '@/components/aicoach/AIRestaurantFinderView';
import { BiasedMealView } from '@/components/aicoach/BiasedMealView';
import { CalculationDebugView } from '@/components/aicoach/CalculationDebugView';
import { renderCard } from '@/components/assistant/AIAssistantPanel';
import { answerAssistant, getQuickActions } from '@/services/AssistantService';
import { useAssistantContext } from '@/hooks/useAssistantContext';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAICoachData } from '@/hooks/useAICoachData';
import { useLocaleStore, isRTL } from '@/store/useLocaleStore';
import { useCoachT } from '@/i18n/coachStrings';
import type { AssistantCard } from '@/services/AssistantService';

type CoachView = 'hub' | 'eat' | 'analyze' | 'recipe' | 'plan' | 'restaurant' | 'protein' | 'calories' | 'debug';

const VALID_VIEWS: CoachView[] = ['eat', 'analyze', 'recipe', 'plan', 'restaurant', 'protein', 'calories', 'debug'];

const VIEW_META: Record<Exclude<CoachView, 'hub'>, { titleKey: 'titleEat' | 'titleAnalyze' | 'titleRecipe' | 'titlePlan' | 'titleRestaurant' | 'titleProtein' | 'titleCalories' | 'titleDebug'; icon: typeof Utensils }> = {
  eat: { titleKey: 'titleEat', icon: Utensils },
  analyze: { titleKey: 'titleAnalyze', icon: TrendingUp },
  recipe: { titleKey: 'titleRecipe', icon: ChefHat },
  plan: { titleKey: 'titlePlan', icon: Sparkles },
  restaurant: { titleKey: 'titleRestaurant', icon: Store },
  protein: { titleKey: 'titleProtein', icon: Flame },
  calories: { titleKey: 'titleCalories', icon: Flame },
  debug: { titleKey: 'titleDebug', icon: Settings2 },
};

export function AICoachPage() {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const initialView = VALID_VIEWS.includes(requestedView as CoachView) ? (requestedView as CoachView) : 'hub';
  const [view, setView] = useState<CoachView>(initialView);
  const [planMode, setPlanMode] = useState<'build' | 'analyze'>('build');

  // Re-sync when arriving via a fresh link/navigation (e.g. from another page's "view=plan"
  // shortcut, or the bare /coach link resetting back to the hub) — internal in-page setView
  // calls never touch the URL's query string, so this never fights with those.
  useEffect(() => {
    setView(VALID_VIEWS.includes(requestedView as CoachView) ? (requestedView as CoachView) : 'hub');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView]);

  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);
  const rtl = isRTL(language);
  const t = useCoachT();

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="pb-6">
      <AnimatePresence mode="wait" initial={false}>
        {view === 'hub' ? (
          <motion.div
            key="hub"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <header>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
                  <Sparkles className="text-primary-500" size={24} />
                  {t('title')}
                </h1>
                <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
              </header>
              <div className="flex shrink-0 gap-1 rounded-lg bg-surface-alt2 p-0.5">
                <button
                  onClick={() => setLanguage('en')}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition ${language === 'en' ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('he')}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition ${language === 'he' ? 'bg-surface text-fg shadow-sm' : 'text-muted'}`}
                >
                  עברית
                </button>
              </div>
            </div>

            <LiveMacroStrip t={t} />

            <div>
              <p className="mb-2.5 text-sm font-bold text-fg">⚡ {t('quickActions')}</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <QuickButton icon={Utensils} label={t('whatToEat')} onClick={() => setView('eat')} delay={0} />
                <QuickButton icon={TrendingUp} label={t('howDidIEat')} onClick={() => setView('analyze')} delay={1} />
                <QuickButton icon={Flame} label={t('highProtein')} onClick={() => setView('protein')} delay={2} />
                <QuickButton icon={Flame} label={t('lowCalorie')} onClick={() => setView('calories')} delay={3} />
                <QuickButton icon={Store} label={t('findRestaurant')} onClick={() => setView('restaurant')} delay={4} />
                <QuickButton icon={ChefHat} label={t('createRecipe')} onClick={() => setView('recipe')} delay={5} />
                <QuickButton icon={Sparkles} label={t('checkPlan')} onClick={() => setView('plan')} delay={6} />
                <QuickButton
                  icon={Bot}
                  label={t('askAi')}
                  delay={7}
                  onClick={() => {
                    const el = document.getElementById('coach-ask-input');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el as HTMLInputElement | null)?.focus();
                  }}
                />
              </div>
            </div>

            <RecommendationCard onOpen={() => setView('eat')} label={t('recommendationForYou')} />

            <EmbeddedAskAI t={t} language={language} />

            <button
              onClick={() => setView('debug')}
              className="flex w-full items-center justify-center gap-1 text-center text-[11px] text-faint transition hover:text-muted"
            >
              <Search size={11} />
              {t('debugLink')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={view}
            initial={{ opacity: 0, x: rtl ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: rtl ? 10 : -10 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="space-y-5"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('hub')}
                aria-label="Back to AI Coach"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg shadow-card transition active:scale-90"
              >
                <ChevronLeft size={18} className={rtl ? 'rotate-180' : ''} />
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                {(() => {
                  const Icon = VIEW_META[view as Exclude<CoachView, 'hub'>].icon;
                  return <Icon size={17} />;
                })()}
              </div>
              <h1 className="text-xl font-bold text-fg">{t(VIEW_META[view as Exclude<CoachView, 'hub'>].titleKey)}</h1>
            </div>

            {view === 'eat' && <WhatToEatView />}
            {view === 'analyze' && <DailyAnalysisView />}
            {view === 'recipe' && <RecipeCreatorView />}
            {view === 'restaurant' && <AIRestaurantFinderView />}
            {view === 'protein' && <BiasedMealView bias="protein" />}
            {view === 'calories' && <BiasedMealView bias="calories" />}
            {view === 'debug' && <CalculationDebugView />}
            {view === 'plan' && (
              <div>
                <div className="mb-4 flex gap-2 rounded-xl bg-surface-alt2 p-1">
                  <ModeTab active={planMode === 'build'} onClick={() => setPlanMode('build')} label={t('buildPlan')} />
                  <ModeTab active={planMode === 'analyze'} onClick={() => setPlanMode('analyze')} label={t('analyzePlan')} />
                </div>
                {planMode === 'build' ? <MealPlanBuilderView /> : <MealPlanAnalyzerView />}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LiveMacroStrip({ t }: { t: ReturnType<typeof useCoachT> }) {
  const { remaining } = useAICoachData();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MacroPill emoji="🔥" value={Math.round(remaining.calories)} label={t('caloriesLeft')} valueClass="text-fg" />
      <MacroPill emoji="🥩" value={Math.round(remaining.proteinG)} label={t('proteinLeft')} valueClass="text-protein" />
      <MacroPill emoji="🍚" value={Math.round(remaining.carbsG)} label={t('carbsLeft')} valueClass="text-carbs" />
      <MacroPill emoji="🥑" value={Math.round(remaining.fatG)} label={t('fatLeft')} valueClass="text-fat" />
    </div>
  );
}

function MacroPill({ emoji, value, label, valueClass }: { emoji: string; value: number; label: string; valueClass: string }) {
  return (
    <div className="rounded-xl2 bg-surface p-3 text-center shadow-card">
      <p className="text-base leading-none">{emoji}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`} dir="ltr">
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function QuickButton({
  icon: Icon,
  label,
  onClick,
  delay,
}: {
  icon: typeof Utensils;
  label: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: delay * 0.03, ease: 'easeOut' }}
      className="flex flex-col items-center gap-2 rounded-xl2 bg-surface p-3.5 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated active:scale-95"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon size={16} />
      </span>
      <span className="text-xs font-semibold leading-tight text-fg">{label}</span>
    </motion.button>
  );
}

function RecommendationCard({ onOpen, label }: { onOpen: () => void; label: string }) {
  const { remaining, profile, entries } = useAICoachData();
  if (entries.length === 0) return null;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-xl2 bg-ink p-4 text-left text-white shadow-card transition hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">✨ {label}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug">
          {remaining.calories > 0
            ? `You have about ${Math.round(remaining.calories)} kcal and ${Math.round(remaining.proteinG)}g protein left — tap for a matching meal.`
            : "You're close to today's targets — tap for a light option that still fits."}
        </p>
        {profile?.goal && <p className="mt-1 text-xs text-white/60">Tailored to your {profile.goal.replace('_', ' ')} goal.</p>}
      </div>
    </button>
  );
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: AssistantCard;
}

function EmbeddedAskAI({ t, language }: { t: ReturnType<typeof useCoachT>; language: 'en' | 'he' }) {
  const ctx = useAssistantContext();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition((finalText) => {
    setInput('');
    send(finalText);
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  function send(text: string) {
    if (!text.trim()) return;
    const userTurn: ChatTurn = { id: `u${Date.now()}`, role: 'user', text };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setThinking(true);
    // A brief, deliberate pause before the (instant, on-device, rule-based) answer appears —
    // a zero-delay reply reads as robotic; this reads as considered without being slow.
    window.setTimeout(() => {
      const answer = answerAssistant(text, ctx);
      setTurns((prev) => [...prev, { id: `a${Date.now()}`, role: 'assistant', text: answer.text, card: answer.card }]);
      setThinking(false);
    }, 380);
  }

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
        <Sparkles size={14} className="text-primary-500" />
        💬 {t('askAi')}
      </p>

      {turns.length > 0 && (
        <div ref={scrollRef} className="mb-3 max-h-72 space-y-2 overflow-y-auto">
          {turns.map((turn) => (
            <div key={turn.id} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[88%]">
                <div
                  className={`rounded-xl px-3 py-2 text-sm ${
                    turn.role === 'user' ? 'bg-primary-500 text-white' : 'bg-surface-alt text-fg'
                  }`}
                >
                  {turn.text}
                </div>
                {turn.card && <div className="mt-1.5">{renderCard(turn.card, () => {})}</div>}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-xl bg-surface-alt px-3 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" />
              </div>
            </div>
          )}
        </div>
      )}

      {turns.length === 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] text-muted">{t('tryAsking')}:</p>
          <div className="flex flex-wrap gap-1.5">
            {getQuickActions(language).map((qa) => (
              <button
                key={qa}
                onClick={() => send(qa)}
                className="rounded-full border border-default bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-primary-300 hover:text-primary-700"
              >
                {qa}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2"
      >
        {speech.supported && (
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-label="Voice input"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
              speech.listening ? 'bg-red-500 text-white animate-pulse' : 'bg-surface-alt2 text-fg hover:bg-surface-alt3'
            }`}
          >
            <Mic size={17} />
          </button>
        )}
        <input
          id="coach-ask-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('typeSomething')}
          className="input flex-1 py-2.5"
        />
        <button
          type="submit"
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 active:scale-90"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${active ? 'bg-surface text-fg shadow-card' : 'text-muted'}`}
    >
      {label}
    </button>
  );
}
