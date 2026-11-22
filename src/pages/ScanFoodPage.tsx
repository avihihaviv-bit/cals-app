import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, KeyRound, Loader2, NotebookPen, PencilLine, RotateCcw, ScanLine, Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import { getGeminiKey } from '@/utils/geminiKey';
import { markUpdateBusy } from '@/hooks/useAutoUpdate';
import { foodRecognitionService, IDENTIFICATION_CONFIDENCE_THRESHOLD } from '@/services/FoodRecognitionService';
import { foodSearchService } from '@/services/FoodSearchService';
import { useAppStore } from '@/store/useAppStore';
import { useAddContext } from '@/hooks/useAddContext';
import { suggestMealType, MEAL_LABELS } from '@/utils/mealTime';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ErrorState } from '@/components/ui/ErrorState';
import { NaturalnessBadge } from '@/components/ui/NaturalnessBadge';
import { ScanAnimation } from '@/components/food/ScanAnimation';
import { AddDetailsPanel } from '@/components/food/AddDetailsPanel';
import { ScanCoachOpinion } from '@/components/food/ScanCoachOpinion';
import { calculateNutrition, sumNutrition } from '@/utils/nutritionCalculator';
import { findFoodById } from '@/data/foods';
import type { FoodAlternative, FoodItem, HiddenIngredientEntry, MealType, NutritionFacts, ScanResult, ScannedFoodCandidate } from '@/types';

type ScanStage = 'capture' | 'analyzing' | 'review' | 'error';

const CONFIDENCE_LABEL: Record<ScannedFoodCandidate['confidence'], { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-primary-50 text-primary-700' },
  medium: { label: 'Medium confidence', className: 'bg-amber-50 text-amber-700' },
  low: { label: 'Not sure', className: 'bg-orange-50 text-orange-700' },
};

export function ScanFoodPage() {
  const { date, meal: mealFromUrl, queryString } = useAddContext();
  const navigate = useNavigate();
  const addDiaryEntry = useAppStore((s) => s.addDiaryEntry);
  const touchRecent = useAppStore((s) => s.touchRecent);
  const saveCustomFoods = useAppStore((s) => s.saveCustomFoods);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<ScanStage>('capture');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [candidates, setCandidates] = useState<ScannedFoodCandidate[]>([]);
  const [mealType, setMealType] = useState<MealType>(mealFromUrl ?? suggestMealType());
  const [detailsOpenFor, setDetailsOpenFor] = useState<string | null>(null);
  const [editValuesFor, setEditValuesFor] = useState<string | null>(null);
  const [swapSearchFor, setSwapSearchFor] = useState<string | null>(null);
  const [hasGeminiKey] = useState(() => !!getGeminiKey());
  const [searchParams] = useSearchParams();
  const initialText = searchParams.get('text') ?? '';
  const [typedText, setTypedText] = useState(initialText);
  const autoRanText = useRef(false);
  const isText = scan?.inputKind === 'text' || (stage === 'analyzing' && !imageDataUrl);
  const [labelMode, setLabelMode] = useState(false);
  const isLabel = scan?.inputKind === 'label' || (stage === 'analyzing' && labelMode);

  // Arriving with ?text= (from food search or the AI chat) looks it up right away.
  useEffect(() => {
    if (autoRanText.current || !initialText.trim()) return;
    autoRanText.current = true;
    runTextLookup(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(file: File | undefined, asLabel = false) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageDataUrl(dataUrl);
      if (asLabel) runLabel(dataUrl);
      else runRecognition(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // Each analysis gets an id; "Cancel" (or starting another) makes a late answer be ignored.
  const runIdRef = useRef(0);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (stage !== 'analyzing') return;
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - analyzeStartedAt) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [stage, analyzeStartedAt]);

  async function track(run: () => Promise<ScanResult>) {
    const id = ++runIdRef.current;
    setAnalyzeStartedAt(Date.now());
    setStage('analyzing');
    try {
      const result = await run();
      if (id === runIdRef.current) applyResult(result);
    } catch {
      if (id !== runIdRef.current) return;
      setScan(null);
      setStage('error');
    }
  }

  // Don't let an automatic update reload the app while a scan is running or waiting to be added.
  useEffect(() => {
    if (stage !== 'analyzing' && stage !== 'review') return;
    markUpdateBusy(true);
    return () => markUpdateBusy(false);
  }, [stage]);

  function cancelAnalysis() {
    runIdRef.current++;
    retake();
  }

  async function runLabel(dataUrl: string, fresh = false) {
    setLabelMode(true);
    await track(() => foodRecognitionService.recognizeLabel(dataUrl, { fresh }));
  }

  async function runTextLookup(text: string, fresh = false) {
    setImageDataUrl(null);
    await track(() => foodRecognitionService.recognizeText(text, { fresh }));
  }

  function applyResult(result: ScanResult) {
    setScan(result);
    if (result.recognitionAvailable && result.candidates.length > 0) {
      setCandidates(result.candidates);
      setStage('review');
    } else {
      setCandidates([]);
      setStage('error');
    }
  }

  async function runRecognition(dataUrl: string, fresh = false) {
    setLabelMode(false);
    await track(() => foodRecognitionService.recognize(dataUrl, { fresh }));
  }

  function analyzeAgainFresh() {
    if (!scan) return;
    if (scan.inputKind === 'text') runTextLookup(typedText, true);
    else if (imageDataUrl && scan.inputKind === 'label') runLabel(imageDataUrl, true);
    else if (imageDataUrl) runRecognition(imageDataUrl, true);
  }

  function recomputeCandidate(c: ScannedFoodCandidate, grams: number, addedDetails: HiddenIngredientEntry[]): ScannedFoodCandidate {
    const base = calculateNutrition(c.per100gUsed, grams);
    const nutrition = addedDetails.length > 0 ? sumNutrition([base, ...addedDetails.map((d) => d.nutrition)]) : base;
    return { ...c, estimatedGrams: grams, addedDetails, nutrition };
  }

  function updateCandidateGrams(id: string, grams: number) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? recomputeCandidate(c, grams, c.addedDetails ?? []) : c)));
  }

  function addHiddenIngredient(id: string, entry: HiddenIngredientEntry) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? recomputeCandidate(c, c.estimatedGrams, [...(c.addedDetails ?? []), entry]) : c)),
    );
  }

  function removeHiddenIngredient(id: string, entryId: string) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id ? recomputeCandidate(c, c.estimatedGrams, (c.addedDetails ?? []).filter((d) => d.id !== entryId)) : c,
      ),
    );
  }

  /** The user corrected the per-100g values (e.g. from the package): use theirs, and save them as their own food. */
  function updateCandidatePer100g(id: string, per100g: NutritionFacts) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const base = c.customFood ?? findFoodById(c.foodId);
        const foodId = c.matchedLocalFood ? `my-${c.foodId}` : c.foodId;
        const customFood: FoodItem | undefined = base
          ? { ...base, id: foodId, per100g, category: 'My foods', dataQuality: 'estimated', source: 'Values you entered' }
          : undefined;
        const updated = recomputeCandidate({ ...c, per100gUsed: per100g }, c.estimatedGrams, c.addedDetails ?? []);
        return { ...updated, foodId, customFood, matchedLocalFood: false, nutritionSource: 'Values you entered' };
      }),
    );
    setEditValuesFor(null);
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  function applyFoodSwap(id: string, food: FoodItem) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const base = calculateNutrition(food.per100g, c.estimatedGrams);
        const nutrition = c.addedDetails && c.addedDetails.length > 0 ? sumNutrition([base, ...c.addedDetails.map((d) => d.nutrition)]) : base;
        return {
          ...c,
          foodId: food.id,
          name: food.name,
          imageEmoji: food.imageEmoji,
          per100gUsed: food.per100g,
          nutrition,
          identificationConfidence: 100,
          confidence: 'high',
          alternatives: undefined,
          matchedLocalFood: true,
          nutritionSource: food.source,
        };
      }),
    );
    setSwapSearchFor(null);
  }

  function confirmPrimaryGuess(id: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, identificationConfidence: 100, confidence: 'high', alternatives: undefined } : c)),
    );
  }

  function chooseAlternative(id: string, alt: FoodAlternative) {
    if (alt.foodId) {
      const food = findFoodById(alt.foodId);
      if (food) {
        applyFoodSwap(id, food);
        return;
      }
    }
    setSwapSearchFor(id);
  }

  function retake() {
    setLabelMode(false);
    setStage('capture');
    setImageDataUrl(null);
    setScan(null);
    setCandidates([]);
    setSwapSearchFor(null);
  }

  function confirmAdd() {
    // Foods that aren't in the built-in database get saved to "My foods" so they can be searched and re-logged.
    const newFoods = candidates.filter((c) => !c.matchedLocalFood && c.customFood).map((c) => c.customFood!);
    if (newFoods.length > 0) saveCustomFoods(newFoods);
    for (const c of candidates) {
      const quantityLabel = isLabel
        ? `${c.estimatedGrams}g`
        : c.unitCount && c.unitLabel
          ? `~${c.unitCount} ${c.unitLabel} (estimated)`
          : `~${c.estimatedGrams}g (estimated)`;
      addDiaryEntry({
        date,
        mealType,
        foodId: c.foodId,
        foodName: c.name,
        foodImageEmoji: c.imageEmoji ?? findFoodById(c.foodId)?.imageEmoji,
        quantityGrams: c.estimatedGrams,
        servingLabel: `${quantityLabel}${c.addedDetails && c.addedDetails.length > 0 ? ' + added details' : ''}`,
        nutrition: c.nutrition,
        dataQuality: isLabel ? 'estimated' : c.matchedLocalFood ? (findFoodById(c.foodId)?.dataQuality ?? 'ai_estimate') : 'ai_estimate',
        source: 'scan',
        aiConfidence: isLabel ? undefined : c.confidence,
        naturalness: findFoodById(c.foodId)?.naturalness ?? c.customFood?.naturalness,
      });
      touchRecent({ refId: c.foodId, refType: 'food' });
    }
    navigate(date && date !== undefined ? `/diary?date=${date}` : '/');
  }

  const totals = candidates.length > 0 ? sumNutrition(candidates.map((c) => c.nutrition)) : null;

  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-2xl font-bold text-fg">Scan Food</h1>
        <p className="mt-1 text-sm text-muted">Take a photo — or just type what you ate — and let AI work out the nutrition.</p>
      </header>

      {stage === 'capture' && !hasGeminiKey && (
        <div className="flex items-start gap-3 rounded-xl2 bg-amber-50 p-4 text-amber-900">
          <KeyRound size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Set up AI scanning first</p>
            <p className="mt-0.5 text-xs text-amber-800">
              Add your own free Gemini key once in Settings — then photos are analyzed directly by Google&apos;s AI from your phone.
            </p>
            <Button size="sm" className="mt-2.5" onClick={() => navigate('/settings')}>
              Set up now
            </Button>
          </div>
        </div>
      )}

      {stage === 'capture' && (
        <div className="flex flex-col items-center gap-5 rounded-xl2 bg-surface p-8 text-center shadow-card">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <ScanLine size={34} />
          </div>
          <div>
            <p className="font-semibold text-fg">Photograph your meal</p>
            <p className="mt-1 max-w-xs text-sm text-muted">Center the food in frame with good lighting for the best estimate.</p>
          </div>
          <div className="flex w-full flex-col gap-2.5 sm:flex-row">
            <Button fullWidth size="lg" icon={<Camera size={18} />} onClick={() => cameraInputRef.current?.click()}>
              Open Camera
            </Button>
            <Button fullWidth size="lg" variant="secondary" icon={<ImagePlus size={18} />} onClick={() => fileInputRef.current?.click()}>
              Upload Photo
            </Button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {stage === 'capture' && (
        <div className="rounded-xl2 bg-surface p-5 shadow-card">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <PencilLine size={17} className="text-primary-600" /> Or type what you ate
          </p>
          <p className="mt-1 text-xs text-muted">Any food, with your own amounts — e.g. &quot;150g chicken breast, 200g cooked rice, 2 eggs&quot;. Hebrew works too.</p>
          <textarea
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            rows={3}
            placeholder="150g חזה עוף, 200g אורז..."
            className="mt-3 w-full resize-none rounded-xl border border-default bg-surface-alt px-3 py-2.5 text-sm text-fg outline-none focus:border-primary-400"
          />
          <Button
            fullWidth
            className="mt-3"
            disabled={!typedText.trim()}
            onClick={() => runTextLookup(typedText)}
          >
            Calculate nutrition
          </Button>
        </div>
      )}

      {stage === 'capture' && (
        <button
          onClick={() => labelInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl2 bg-surface p-5 text-left shadow-card transition hover:bg-surface-alt"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <Tag size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-fg">Scan a nutrition label</span>
            <span className="block text-xs text-muted">
              Packaged food? Photograph the nutrition table (ערכים תזונתיים) for exact values instead of an estimate.
            </span>
          </span>
          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0], true);
              e.target.value = '';
            }}
          />
        </button>
      )}

      {stage === 'analyzing' && imageDataUrl && (
        <div className="overflow-hidden rounded-xl2 bg-surface shadow-card">
          <div className="relative aspect-square w-full overflow-hidden bg-surface-alt2">
            <img src={imageDataUrl} alt="Captured food" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/35" />
            <ScanAnimation />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-muted">
              {isLabel ? 'Reading the label' : 'Analyzing your meal'}… <span className="tabular-nums">{elapsed}s</span>
            </p>
            <button onClick={cancelAnalysis} className="text-sm font-semibold text-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === 'analyzing' && !imageDataUrl && (
        <div className="flex flex-col items-center gap-3 rounded-xl2 bg-surface p-10 text-center shadow-card">
          <Loader2 size={30} className="animate-spin text-primary-600" />
          <p className="font-semibold text-fg">Looking up your foods…</p>
          <p className="text-xs text-muted">
            Finding the nutrition values for what you typed · <span className="tabular-nums">{elapsed}s</span>
          </p>
          <button onClick={cancelAnalysis} className="text-sm font-semibold text-muted hover:text-fg">
            Cancel
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-3">
          <ErrorState
            title={
              scan?.unavailableReason
                ? isLabel
                  ? "Couldn't read this label"
                  : isText
                    ? "Couldn't look that up"
                    : "Couldn't analyze this photo"
                : "AI couldn't recognize any food"
            }
            description={scan?.unavailableReason ?? 'Try a clearer, well-lit photo, or search for the food manually instead.'}
            onRetry={
              imageDataUrl
                ? () => (isLabel ? runLabel(imageDataUrl) : runRecognition(imageDataUrl))
                : typedText.trim()
                  ? () => runTextLookup(typedText)
                  : retake
            }
          />
          {scan?.unavailableDetail && (
            <p className="break-words px-2 text-center text-[11px] text-faint">Details: {scan.unavailableDetail} · v{__BUILD_ID__.split(' ')[0]}</p>
          )}
          {scan?.needsApiKey && (
            <Button fullWidth icon={<KeyRound size={16} />} onClick={() => navigate('/settings')}>
              {hasGeminiKey ? 'Fix my Gemini key in Settings' : 'Set up AI scanning'}
            </Button>
          )}
          <Button fullWidth variant="secondary" icon={<RotateCcw size={16} />} onClick={retake}>
            {isText ? 'Edit what I typed' : isLabel ? 'Try another label photo' : 'Take a different photo'}
          </Button>
          <Button fullWidth variant="secondary" icon={<Search size={16} />} onClick={() => navigate(`/add/search?${queryString}`)}>
            Search for food manually
          </Button>
        </div>
      )}

      {stage === 'review' && scan && (
        <div className="space-y-5">
          {imageDataUrl && (
            <div className="overflow-hidden rounded-xl2 shadow-card">
              <div className="relative aspect-video w-full">
                <img src={imageDataUrl} alt="Captured food" className="h-full w-full object-cover" />
                {candidates.map(
                  (c) =>
                    c.boundingBox && (
                      <div
                        key={`box-${c.id}`}
                        className="pointer-events-none absolute rounded-lg border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                        style={{
                          left: `${c.boundingBox.xPct}%`,
                          top: `${c.boundingBox.yPct}%`,
                          width: `${c.boundingBox.wPct}%`,
                          height: `${c.boundingBox.hPct}%`,
                        }}
                      >
                        <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {c.name} · ~{c.estimatedGrams}g
                        </span>
                      </div>
                    ),
                )}
              </div>
            </div>
          )}

          {scan.resultSource === 'local' && (
            <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-2.5 text-xs font-medium text-primary-800">
              <span aria-hidden>⚡</span> Instant — exact match in the built-in food list (verified values, no AI needed).
            </div>
          )}
          {scan.resultSource === 'cache' && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-50 px-4 py-2.5 text-xs font-medium text-primary-800">
              <span>
                <span aria-hidden>⚡</span> Same answer as last time — {isText ? 'you typed this before' : 'this exact photo was analyzed before'}.
              </span>
              <button onClick={analyzeAgainFresh} className="shrink-0 font-semibold underline">
                Analyze again
              </button>
            </div>
          )}

          <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-800">
            <div className="flex items-center justify-between">
              <span>
                {isLabel
                  ? '🏷️ Check the numbers match the package, then set how much you ate.'
                  : isText
                    ? '✍️ Check the amounts and values before adding.'
                    : '⚠️ AI estimate — review and adjust before adding.'}
              </span>
              <button onClick={retake} className="flex items-center gap-1 font-semibold underline underline-offset-2">
                <RotateCcw size={13} /> {isText ? 'Edit' : 'Retake'}
              </button>
            </div>
            <p className="mt-1 text-xs text-orange-700">
              {isLabel
                ? 'Values come from the label you photographed. The product is saved to My foods, so next time just search for it.'
                : isText
                ? 'Values are per-100g reference data scaled to the grams you typed. Add oil, butter or sauces with "Add details" if they were mixed in.'
                : 'The AI can’t reliably see things like oil, butter, sauces or dressings in a photo — use "Add details" below for anything mixed in that isn’t visible.'}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-fg">Meal</p>
            <div className="flex flex-wrap gap-2">
              {(['breakfast', 'lunch', 'dinner', 'snacks'] as MealType[]).map((mt) => (
                <Chip key={mt} selected={mealType === mt} onClick={() => setMealType(mt)}>
                  <span className="mr-1">{MEAL_LABELS[mt].emoji}</span>
                  {MEAL_LABELS[mt].label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-base font-bold text-fg">{isLabel ? 'What we read' : isText ? 'What we understood' : 'What we detected'}</h2>
            <div className="space-y-3">
              {candidates.map((c) => {
                const identificationCertain = c.identificationConfidence >= IDENTIFICATION_CONFIDENCE_THRESHOLD;
                return (
                  <div key={c.id} className="rounded-xl2 bg-surface p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-lg">
                          {c.imageEmoji ?? '🍽️'}
                        </span>
                        <div>
                          <p className="font-semibold text-fg">{c.name}</p>
                          <p className="text-xs text-muted">
                            {isLabel ? '' : c.addedDetails && c.addedDetails.length > 0 ? 'Updated estimate: ~' : 'Estimated: ~'}
                            {Math.round(c.nutrition.calories)} kcal
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_LABEL[c.confidence].className}`}>
                          {CONFIDENCE_LABEL[c.confidence].label}
                        </span>
                        <button onClick={() => removeCandidate(c.id)} className="text-xs font-medium text-red-500 hover:underline">
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-surface-alt px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{isLabel ? '🏷️ From the label' : isText ? '✍️ What you wrote' : '👁️ What we saw'}</p>
                      <p className="mt-0.5 text-xs text-fg/80">{c.seenDescription}</p>
                      {c.visibleExtras && c.visibleExtras.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {c.visibleExtras.map((extra) => (
                            <span key={extra} className="rounded-full bg-surface-alt2 px-2 py-0.5 text-[10px] font-medium text-muted">
                              visible: {extra}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {!identificationCertain && (
                      <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-800">Not sure which this is — which looks right?</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button
                            onClick={() => confirmPrimaryGuess(c.id)}
                            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-300"
                          >
                            This is {c.name}
                          </button>
                          {(c.alternatives ?? []).map((alt) => (
                            <button
                              key={alt.label}
                              onClick={() => chooseAlternative(c.id, alt)}
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-50"
                            >
                              This is {alt.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setSwapSearchFor(c.id)}
                            className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-inset ring-default hover:bg-surface-alt"
                          >
                            Something else…
                          </button>
                        </div>
                        {swapSearchFor === c.id && (
                          <InlineFoodSwapSearch onSelect={(food) => applyFoodSwap(c.id, food)} onCancel={() => setSwapSearchFor(null)} />
                        )}
                      </div>
                    )}

                    {c.addedDetails && c.addedDetails.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.addedDetails.map((d) => (
                          <span key={d.id} className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                            {d.emoji} {d.label}
                            <button onClick={() => removeHiddenIngredient(c.id, d.id)} aria-label={`Remove ${d.label}`}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {isText || isLabel ? '📏 How much you ate' : '📏 Our estimate'}{c.estimatedGramsRange ? ` (~${c.estimatedGramsRange[0]}–${c.estimatedGramsRange[1]}g)` : ''}
                        {c.unitCount && c.unitLabel ? ` · ~${c.unitCount} ${c.unitLabel}` : ''}
                      </p>
                      <div className="flex items-center justify-center rounded-xl bg-surface-alt py-3">
                        <QuantityStepper value={c.estimatedGrams} onChange={(g) => updateCandidateGrams(c.id, g)} />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
                      <span>
                        <b className="text-protein">{Math.round(c.nutrition.proteinG)}g</b> protein
                      </span>
                      <span>
                        <b className="text-carbs">{Math.round(c.nutrition.carbsG)}g</b> carbs
                      </span>
                      <span>
                        <b className="text-fat">{Math.round(c.nutrition.fatG)}g</b> fat
                      </span>
                    </div>

                    {editValuesFor === c.id ? (
                      <Per100gEditor
                        initial={c.per100gUsed}
                        onSave={(v) => updateCandidatePer100g(c.id, v)}
                        onCancel={() => setEditValuesFor(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setEditValuesFor(c.id)}
                        className="mx-auto mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary-700 hover:underline"
                      >
                        <SlidersHorizontal size={11} /> Fix values (per 100g)
                      </button>
                    )}

                    <p className="mt-2 text-center text-[10px] text-faint">
                      Per-100g data: {c.nutritionSource}
                      {!c.matchedLocalFood && !isLabel && c.nutritionSource !== 'Values you entered' && ' — approximate'}
                    </p>

                    {(findFoodById(c.foodId)?.naturalness ?? c.customFood?.naturalness) && (
                      <div className="mt-2 flex justify-center">
                        <NaturalnessBadge score={(findFoodById(c.foodId)?.naturalness ?? c.customFood!.naturalness).score} />
                      </div>
                    )}

                    {detailsOpenFor === c.id ? (
                      <AddDetailsPanel
                        onAdd={(entry) => addHiddenIngredient(c.id, entry)}
                        onClose={() => setDetailsOpenFor(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setDetailsOpenFor(c.id)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-default py-2 text-xs font-semibold text-muted transition hover:border-primary-300 hover:text-primary-700"
                      >
                        <NotebookPen size={13} /> Add details (oil, sauce, cheese…)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {candidates.length === 0 ? (
            <ErrorState title="No items left" description="You removed every detected item — retake or search manually." onRetry={retake} />
          ) : (
            <>
              {totals && (
                <div className="rounded-xl2 bg-surface p-4 shadow-card">
                  <p className="text-sm font-semibold text-fg">{isLabel ? 'Total' : 'Estimated total'}</p>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold tabular-nums text-fg">{Math.round(totals.calories)}</p>
                      <p className="text-[11px] text-muted">kcal</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-protein">{Math.round(totals.proteinG)}g</p>
                      <p className="text-[11px] text-muted">protein</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-carbs">{Math.round(totals.carbsG)}g</p>
                      <p className="text-[11px] text-muted">carbs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold tabular-nums text-fat">{Math.round(totals.fatG)}g</p>
                      <p className="text-[11px] text-muted">fat</p>
                    </div>
                  </div>
                </div>
              )}
              {scan.modelUsed && <p className="text-center text-[10px] text-faint">Analyzed by {scan.modelUsed}</p>}
              <ScanCoachOpinion candidates={candidates} />
              <Button fullWidth size="lg" onClick={confirmAdd}>
                Add {candidates.length} item{candidates.length > 1 ? 's' : ''} to {MEAL_LABELS[mealType].label}
              </Button>
            </>
          )}
        </div>
      )}

      {/* keep query context available if user backs out */}
      <div className="hidden">{queryString}</div>
    </div>
  );
}

function InlineFoodSwapSearch({ onSelect, onCancel }: { onSelect: (food: FoodItem) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);

  useEffect(() => {
    if (!text.trim()) {
      setResults([]);
      return;
    }
    let active = true;
    foodSearchService.search({ text, limit: 6 }).then((r) => {
      if (active) setResults(r);
    });
    return () => {
      active = false;
    };
  }, [text]);

  return (
    <div className="mt-2 rounded-xl border border-default bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search for the right food…"
          className="flex-1 rounded-lg border border-default bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary-400"
        />
        <button onClick={onCancel} className="text-xs font-semibold text-muted">
          Cancel
        </button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {results.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(f)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-alt"
            >
              <span>{f.imageEmoji ?? '🍽️'}</span> {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Per100gEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: NutritionFacts;
  onSave: (v: NutritionFacts) => void;
  onCancel: () => void;
}) {
  const [vals, setVals] = useState({
    calories: String(Math.round(initial.calories)),
    proteinG: String(initial.proteinG),
    carbsG: String(initial.carbsG),
    fatG: String(initial.fatG),
  });
  const num = (v: string) => {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const parsed = { calories: num(vals.calories), proteinG: num(vals.proteinG), carbsG: num(vals.carbsG), fatG: num(vals.fatG) };
  const valid = Object.values(parsed).every((n) => !Number.isNaN(n));
  const fields: { key: keyof typeof vals; label: string }[] = [
    { key: 'calories', label: 'kcal' },
    { key: 'proteinG', label: 'Protein g' },
    { key: 'carbsG', label: 'Carbs g' },
    { key: 'fatG', label: 'Fat g' },
  ];
  return (
    <div className="mt-3 rounded-xl border border-default bg-surface-alt p-3">
      <p className="text-[11px] font-semibold text-muted">Per 100g — copy from the package if you have it</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {fields.map((f) => (
          <label key={f.key} className="text-center">
            <input
              inputMode="decimal"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-label={f.label}
              className="w-full rounded-lg border border-default bg-surface px-1.5 py-1.5 text-center text-sm tabular-nums text-fg outline-none focus:border-primary-400"
            />
            <span className="mt-0.5 block text-[10px] text-muted">{f.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" icon={<Check size={14} />} disabled={!valid} onClick={() => onSave({ ...initial, ...parsed })}>
          Use these values
        </Button>
      </div>
    </div>
  );
}
