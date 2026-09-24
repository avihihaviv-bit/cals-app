import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Info, ShieldAlert, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { OptionCard } from '@/components/ui/OptionCard';
import { Chip } from '@/components/ui/Chip';
import { useAppStore, type BackupData } from '@/store/useAppStore';
import { generateId } from '@/utils/id';
import { calculateFullTargets, calculateTargetRanges } from '@/utils/nutritionCalculator';
import type { TargetRanges } from '@/utils/nutritionCalculator';
import type { ActivityLevel, Goal, GoalPace, Sex, TrainingType, UserProfile } from '@/types';

const ACTIVITY_OPTIONS: { value: ActivityLevel; title: string; description: string; icon: string }[] = [
  { value: 'sedentary', title: 'Barely active', description: 'Little to no exercise, desk job', icon: '🛋️' },
  { value: 'light', title: 'Lightly active', description: 'Light exercise 1-3 days/week', icon: '🚶' },
  { value: 'moderate', title: 'Moderately active', description: 'Moderate exercise 3-5 days/week', icon: '🏃' },
  { value: 'high', title: 'Very active', description: 'Hard exercise 6-7 days/week', icon: '🏋️' },
  { value: 'very_high', title: 'Extremely active', description: 'Very hard training + physical job', icon: '🔥' },
];

const TRAINING_TYPES: { value: TrainingType; label: string; icon: string }[] = [
  { value: 'gym', label: 'Gym', icon: '🏋️' },
  { value: 'football', label: 'Football', icon: '⚽' },
  { value: 'running', label: 'Running', icon: '🏃' },
  { value: 'swimming', label: 'Swimming', icon: '🏊' },
  { value: 'cycling', label: 'Cycling', icon: '🚴' },
  { value: 'walking', label: 'Walking', icon: '🚶' },
  { value: 'other', label: 'Other sport', icon: '🤸' },
];

const GOAL_OPTIONS: { value: Goal; title: string; description: string; icon: string }[] = [
  { value: 'maintain', title: 'Maintain weight', description: 'Stay around your current weight', icon: '⚖️' },
  { value: 'lose', title: 'Lose weight', description: 'Gradual, sustainable fat loss', icon: '📉' },
  { value: 'gain', title: 'Gain weight', description: 'Gradual, healthy weight gain', icon: '📈' },
  { value: 'recomposition', title: 'Build muscle / Recomposition', description: 'Build muscle while staying lean', icon: '💪' },
  { value: 'performance', title: 'Sports performance', description: 'Fuel training & performance', icon: '🏆' },
];

interface FormData {
  age: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number;
  trainingTypes: TrainingType[];
  goal: Goal | null;
  goalPace: GoalPace;
}

const STEPS = ['Welcome', 'About you', 'Activity', 'Training', 'Goal', 'Your plan'];

export function OnboardingPage() {
  const setProfile = useAppStore((s) => s.setProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const importBackup = useAppStore((s) => s.importBackup);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function handleRestoreFile(file: File | undefined) {
    if (!file) return;
    setRestoreError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as BackupData;
        if (!data.profile) {
          setRestoreError("That file doesn't have a saved profile in it — make sure it's a Nutrition AI backup.");
          return;
        }
        importBackup(data);
      } catch {
        setRestoreError("Couldn't read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
  }

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    age: '',
    sex: null,
    heightCm: '',
    weightKg: '',
    activityLevel: null,
    trainingDaysPerWeek: 0,
    trainingTypes: [],
    goal: null,
    goalPace: 'moderate',
  });

  const age = Number(form.age);
  const isMinor = form.age !== '' && age > 0 && age < 18;

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return true;
      case 1:
        return form.age !== '' && age >= 10 && age <= 100 && form.sex !== null && form.heightCm !== '' && form.weightKg !== '';
      case 2:
        return form.activityLevel !== null;
      case 3:
        return true;
      case 4:
        return form.goal !== null;
      default:
        return true;
    }
  }, [step, form, age]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTrainingType(t: TrainingType) {
    setForm((f) => ({
      ...f,
      trainingTypes: f.trainingTypes.includes(t) ? f.trainingTypes.filter((x) => x !== t) : [...f.trainingTypes, t],
    }));
  }

  function buildProfile(): UserProfile {
    const now = new Date().toISOString();
    return {
      id: generateId('profile'),
      age,
      sex: form.sex as Sex,
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      activityLevel: form.activityLevel as ActivityLevel,
      trainingDaysPerWeek: form.trainingDaysPerWeek,
      trainingTypes: form.trainingTypes,
      goal: form.goal as Goal,
      goalPace: isMinor ? undefined : form.goalPace,
      isMinor,
      createdAt: now,
      updatedAt: now,
    };
  }

  const previewProfile = step >= 5 ? buildProfile() : null;
  const preview = previewProfile ? calculateFullTargets(previewProfile) : null;
  const previewRanges = previewProfile ? calculateTargetRanges(previewProfile) : null;

  function finish() {
    const profile = buildProfile();
    setProfile(profile);
    completeOnboarding();
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="mx-auto w-full max-w-lg flex-1 px-5 pb-10 pt-8 sm:pt-14">
        {step > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-fg shadow-card transition active:scale-90"
              aria-label="Back"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt3">
              <motion.div
                className="h-full rounded-full bg-primary-500"
                animate={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {step === 0 && <WelcomeStep />}
            {step === 1 && <PersonalStep form={form} update={update} isMinor={isMinor} />}
            {step === 2 && <ActivityStep form={form} update={update} />}
            {step === 3 && <TrainingStep form={form} update={update} toggleTrainingType={toggleTrainingType} />}
            {step === 4 && <GoalStep form={form} update={update} isMinor={isMinor} />}
            {step === 5 && preview && previewProfile && previewRanges && (
              <ReviewStep
                profile={previewProfile}
                calorieResult={preview.calorieResult}
                macros={preview.macros}
                ranges={previewRanges}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 border-t border-subtle bg-surface/95 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg">
          <div className="flex gap-3">
            {step < STEPS.length - 1 ? (
              <Button fullWidth size="lg" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
                {step === 0 ? "Let's start" : 'Continue'}
              </Button>
            ) : (
              <Button fullWidth size="lg" icon={<Sparkles size={18} />} onClick={finish}>
                Get Started
              </Button>
            )}
          </div>
          {step === 0 && (
            <div className="mt-3 text-center">
              <button
                onClick={() => restoreInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary-600"
              >
                <Upload size={12} /> Already used this app? Restore from a backup file
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  handleRestoreFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {restoreError && <p className="mt-1.5 text-xs text-red-600">{restoreError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-500 text-4xl shadow-elevated">🥗</div>
      <h1 className="text-2xl font-bold text-fg">Welcome to Nutrition AI</h1>
      <p className="mt-3 max-w-sm text-muted">
        Let&apos;s set up your profile so we can estimate how many calories and macros you need each day. It only takes a minute.
      </p>
      <div className="mt-8 grid w-full grid-cols-1 gap-2.5 text-left">
        <FeatureRow emoji="📸" text="Scan your food for an instant estimate" />
        <FeatureRow emoji="🎯" text="Get a personalized daily calorie & macro target" />
        <FeatureRow emoji="📊" text="Track progress with clean, simple charts" />
      </div>
    </div>
  );
}

function FeatureRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-card">
      <span className="text-xl">{emoji}</span>
      <span className="text-sm font-medium text-fg">{text}</span>
    </div>
  );
}

function PersonalStep({
  form,
  update,
  isMinor,
}: {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  isMinor: boolean;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-fg">A few details about you</h2>
      <p className="mt-1 text-sm text-muted">We use this to estimate your energy needs.</p>

      <div className="mt-6 space-y-4">
        <Field label="Age">
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 28"
            value={form.age}
            onChange={(e) => update('age', e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Sex">
          <div className="grid grid-cols-2 gap-2.5">
            <Chip selected={form.sex === 'male'} onClick={() => update('sex', 'male')}>
              Male
            </Chip>
            <Chip selected={form.sex === 'female'} onClick={() => update('sex', 'female')}>
              Female
            </Chip>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (cm)">
            <input
              type="number"
              inputMode="numeric"
              placeholder="175"
              value={form.heightCm}
              onChange={(e) => update('heightCm', e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Weight (kg)">
            <input
              type="number"
              inputMode="numeric"
              placeholder="70"
              value={form.weightKg}
              onChange={(e) => update('weightKg', e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {isMinor && (
          <div className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <span>
              Since you&apos;re under 18, we&apos;ll use gentler, growth-safe numbers for whatever goal you choose, and
              recommend involving a parent, dietitian, or doctor for any weight-related goals.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityStep({
  form,
  update,
}: {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-fg">How active are you?</h2>
      <p className="mt-1 text-sm text-muted">Outside of dedicated workouts — think about your daily routine.</p>
      <div className="mt-6 space-y-2.5">
        {ACTIVITY_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            selected={form.activityLevel === opt.value}
            onClick={() => update('activityLevel', opt.value)}
            title={opt.title}
            description={opt.description}
            icon={opt.icon}
          />
        ))}
      </div>
    </div>
  );
}

function TrainingStep({
  form,
  update,
  toggleTrainingType,
}: {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  toggleTrainingType: (t: TrainingType) => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-fg">Tell us about your training</h2>
      <p className="mt-1 text-sm text-muted">This helps fine-tune your protein and energy needs.</p>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-fg">Workouts per week: {form.trainingDaysPerWeek}</p>
        <input
          type="range"
          min={0}
          max={7}
          value={form.trainingDaysPerWeek}
          onChange={(e) => update('trainingDaysPerWeek', Number(e.target.value))}
          className="w-full accent-primary-500"
        />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>0</span>
          <span>7</span>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-fg">Type of training</p>
        <div className="flex flex-wrap gap-2">
          {TRAINING_TYPES.map((t) => (
            <Chip key={t.value} selected={form.trainingTypes.includes(t.value)} onClick={() => toggleTrainingType(t.value)}>
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function GoalStep({
  form,
  update,
  isMinor,
}: {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  isMinor: boolean;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-fg">What&apos;s your goal?</h2>
      <p className="mt-1 text-sm text-muted">We&apos;ll never suggest an extreme or unsafe target.</p>

      {isMinor && (
        <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <span>
            Every goal below is available to you. Since you&apos;re under 18, we&apos;ll use gentler, growth-safe numbers
            regardless of which one you pick — and we&apos;d still recommend looping in a parent, dietitian, or doctor.
          </span>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {GOAL_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            selected={form.goal === opt.value}
            onClick={() => update('goal', opt.value)}
            title={opt.title}
            description={opt.description}
            icon={opt.icon}
          />
        ))}
      </div>

      {!isMinor && (form.goal === 'lose' || form.goal === 'gain') && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-fg">Pace</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Chip selected={form.goalPace === 'moderate'} onClick={() => update('goalPace', 'moderate')}>
              Moderate
            </Chip>
            <Chip selected={form.goalPace === 'fast'} onClick={() => update('goalPace', 'fast')}>
              Faster
            </Chip>
          </div>
          <p className="mt-2 text-xs text-muted">
            Even &quot;faster&quot; stays within a safe, sustainable range — we never generate extreme deficits or surpluses.
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  profile,
  calorieResult,
  macros,
  ranges,
}: {
  profile: UserProfile;
  calorieResult: ReturnType<typeof calculateFullTargets>['calorieResult'];
  macros: ReturnType<typeof calculateFullTargets>['macros'];
  ranges: TargetRanges;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-fg">Your daily plan</h2>
      <p className="mt-1 text-sm text-muted">An estimate based on the Harris-Benedict formula — everyone&apos;s metabolism varies.</p>

      {calorieResult.minorGuardrail && (
        <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <span>
            Since you&apos;re under 18, these numbers use gentler, growth-safe adjustments rather than a full adult target.
            Please involve a parent, dietitian, or doctor for any weight-related goal.
          </span>
        </div>
      )}

      <div className="mt-5 rounded-xl2 bg-gradient-to-br from-primary-500 to-primary-600 p-5 text-white shadow-elevated">
        <p className="text-sm font-medium text-primary-50">Estimated daily target</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">~{macros.calories.toLocaleString()}</p>
        <p className="text-sm text-primary-50">kcal / day</p>
        <p className="mt-1 text-xs text-primary-50">
          Range: {ranges.calories.min.toLocaleString()}–{ranges.calories.max.toLocaleString()} kcal
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <MacroPreview label="Protein" emoji="🥩" value={macros.proteinG} range={`${ranges.protein.min}–${ranges.protein.max}g`} />
        <MacroPreview label="Carbs" emoji="🍚" value={macros.carbsG} range="From remaining calories" />
        <MacroPreview label="Fat" emoji="🥑" value={macros.fatG} range={`${ranges.fat.min}–${ranges.fat.max}g`} />
      </div>

      {calorieResult.wasCapped && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Your target was adjusted to stay within a safe calorie range for your profile.
        </p>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        These are estimated ranges, not numbers you need to hit exactly — real metabolism and needs vary. Not medical advice.
        You can fine-tune everything later in your profile.
      </p>
    </div>
  );
}

function MacroPreview({ label, emoji, value, range }: { label: string; emoji: string; value: number; range?: string }) {
  return (
    <div className="rounded-xl bg-surface p-3 text-center shadow-card">
      <p className="text-lg">{emoji}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-fg">{value}g</p>
      <p className="text-xs text-muted">{label}</p>
      {range && <p className="mt-0.5 text-[10px] text-faint">{range}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-fg">{label}</span>
      {children}
    </label>
  );
}
