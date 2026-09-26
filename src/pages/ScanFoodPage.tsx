import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, NotebookPen, RotateCcw, ScanLine, Search, X } from 'lucide-react';
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
import type { FoodAlternative, FoodItem, HiddenIngredientEntry, MealType, ScanResult, ScannedFoodCandidate } from '@/types';

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<ScanStage>('capture');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [candidates, setCandidates] = useState<ScannedFoodCandidate[]>([]);
  const [mealType, setMealType] = useState<MealType>(mealFromUrl ?? suggestMealType());
  const [detailsOpenFor, setDetailsOpenFor] = useState<string | null>(null);
  const [swapSearchFor, setSwapSearchFor] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageDataUrl(dataUrl);
      runRecognition(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function runRecognition(dataUrl: string) {
    setStage('analyzing');
    try {
      const result = await foodRecognitionService.recognize(dataUrl);
      setScan(result);
      if (result.recognitionAvailable && result.candidates.length > 0) {
        setCandidates(result.candidates);
        setStage('review');
      } else {
        setCandidates([]);
        setStage('error');
      }
    } catch {
      setScan(null);
      setStage('error');
    }
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
    setStage('capture');
    setImageDataUrl(null);
    setScan(null);
    setCandidates([]);
    setSwapSearchFor(null);
  }

  function confirmAdd() {
    for (const c of candidates) {
      const quantityLabel =
        c.unitCount && c.unitLabel
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
        dataQuality: 'ai_estimate',
        source: 'scan',
        aiConfidence: c.confidence,
        naturalness: findFoodById(c.foodId)?.naturalness,
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
        <p className="mt-1 text-sm text-muted">Take a photo and let AI estimate the nutrition.</p>
      </header>

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

      {stage === 'analyzing' && imageDataUrl && (
        <div className="overflow-hidden rounded-xl2 bg-surface shadow-card">
          <div className="relative aspect-square w-full overflow-hidden bg-surface-alt2">
            <img src={imageDataUrl} alt="Captured food" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/35" />
            <ScanAnimation />
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="space-y-3">
          <ErrorState
            title={scan?.unavailableReason ? "Couldn't analyze this photo" : "AI couldn't recognize any food"}
            description={scan?.unavailableReason ?? 'Try a clearer, well-lit photo, or search for the food manually instead.'}
            onRetry={retake}
          />
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

          <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-800">
            <div className="flex items-center justify-between">
              <span>⚠️ AI estimate — review and adjust before adding.</span>
              <button onClick={retake} className="flex items-center gap-1 font-semibold underline underline-offset-2">
                <RotateCcw size={13} /> Retake
              </button>
            </div>
            <p className="mt-1 text-xs text-orange-700">
              The AI can&apos;t reliably see things like oil, butter, sauces or dressings in a photo — use &quot;Add details&quot; below for anything mixed in that isn&apos;t visible.
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
            <h2 className="mb-2 text-base font-bold text-fg">What we detected</h2>
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
                            {c.addedDetails && c.addedDetails.length > 0 ? 'Updated estimate' : 'Estimated'}: ~{Math.round(c.nutrition.calories)} kcal
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
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">👁️ What we saw</p>
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
                        📏 Our estimate{c.estimatedGramsRange ? ` (~${c.estimatedGramsRange[0]}–${c.estimatedGramsRange[1]}g)` : ''}
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

                    <p className="mt-2 text-center text-[10px] text-faint">
                      Per-100g data: {c.nutritionSource}
                      {!c.matchedLocalFood && ' (not yet in our verified database — treat as approximate)'}
                    </p>

                    {findFoodById(c.foodId)?.naturalness && (
                      <div className="mt-2 flex justify-center">
                        <NaturalnessBadge score={findFoodById(c.foodId)!.naturalness.score} />
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
                  <p className="text-sm font-semibold text-fg">Estimated total</p>
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
