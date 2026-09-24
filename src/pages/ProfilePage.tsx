import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Info, LogOut, Settings, ShieldAlert, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useLocaleStore } from '@/store/useLocaleStore';
import { healthService } from '@/services/HealthService';
import { HealthConnectModal } from '@/components/health/HealthConnectModal';
import { useTargets } from '@/hooks/useTargets';
import { useDiaryForDate } from '@/hooks/useDiary';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { computeAchievements } from '@/utils/achievements';
import { kgToLb, lbToKg, cmToFtIn, ftInToCm } from '@/utils/units';
import { todayISO } from '@/utils/date';
import { exportBackup } from '@/utils/backup';
import { calculateFullTargets, calculateTargetRanges, recommendedProteinRange } from '@/utils/nutritionCalculator';
import { ProteinRangeWarningModal } from '@/components/profile/ProteinRangeWarningModal';
import type { ActivityLevel, Goal, TrainingType, UserProfile } from '@/types';

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Barely active',
  light: 'Lightly active',
  moderate: 'Moderately active',
  high: 'Very active',
  very_high: 'Extremely active',
};

const GOAL_LABELS: Record<Goal, string> = {
  maintain: 'Maintain weight',
  lose: 'Lose weight',
  gain: 'Gain weight',
  recomposition: 'Build muscle / Recomp',
  performance: 'Sports performance',
};

const TRAINING_LABELS: Record<TrainingType, string> = {
  gym: '🏋️ Gym',
  football: '⚽ Football',
  running: '🏃 Running',
  swimming: '🏊 Swimming',
  cycling: '🚴 Cycling',
  walking: '🚶 Walking',
  other: '🤸 Other',
};

export function ProfilePage() {
  const navigate = useNavigate();
  const profile = useAppStore((s) => s.profile) as UserProfile;
  const updateProfile = useAppStore((s) => s.updateProfile);
  const resetAllData = useAppStore((s) => s.resetAllData);
  const units = useAppStore((s) => s.units);
  const setUnits = useAppStore((s) => s.setUnits);
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);
  const trackWeight = useAppStore((s) => s.trackWeight);
  const setTrackWeight = useAppStore((s) => s.setTrackWeight);
  const weightLog = useAppStore((s) => s.weightLog);
  const addWeightLog = useAppStore((s) => s.addWeightLog);
  const diaryEntries = useAppStore((s) => s.diaryEntries);
  const { targets, bmr, tdee, minorGuardrail } = useTargets();
  const todayDiary = useDiaryForDate(todayISO());
  const targetRanges = useMemo(() => calculateTargetRanges(profile), [profile]);

  const [form, setForm] = useState(profile);
  useEffect(() => setForm(profile), [profile]);

  const [todayWeight, setTodayWeight] = useState(weightLog.find((w) => w.date === todayISO())?.weightKg ?? profile.weightKg);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const healthConnected = healthService.getAuthStatus() === 'connected';
  const [useCustomProtein, setUseCustomProtein] = useState(profile.customProteinTargetG != null);
  const [proteinWarningOpen, setProteinWarningOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTraining(t: TrainingType) {
    setForm((f) => ({
      ...f,
      trainingTypes: f.trainingTypes.includes(t) ? f.trainingTypes.filter((x) => x !== t) : [...f.trainingTypes, t],
    }));
  }

  const proteinRange = recommendedProteinRange(form);

  function attemptSave() {
    if (useCustomProtein && form.customProteinTargetG != null) {
      const { customProteinTargetG } = form;
      if (customProteinTargetG > proteinRange.maxG || customProteinTargetG < proteinRange.minG * 0.5) {
        setProteinWarningOpen(true);
        return;
      }
    }
    commitSave(form);
  }

  function commitSave(nextForm: UserProfile) {
    const before = calculateFullTargets(profile);
    const after = calculateFullTargets(nextForm);
    updateProfile(nextForm);

    const calDelta = after.macros.calories - before.macros.calories;
    const proteinDelta = after.macros.proteinG - before.macros.proteinG;
    if (calDelta !== 0 || proteinDelta !== 0) {
      const parts: string[] = [];
      if (calDelta !== 0) parts.push(`Calories: ${before.macros.calories} → ${after.macros.calories} (${calDelta > 0 ? '+' : ''}${calDelta})`);
      if (proteinDelta !== 0) parts.push(`Protein: ${before.macros.proteinG}g → ${after.macros.proteinG}g (${proteinDelta > 0 ? '+' : ''}${proteinDelta}g)`);
      setSaveNotice(parts.join(' · '));
    } else {
      setSaveNotice('Saved — no change to your daily targets.');
    }
  }

  function handleClearData() {
    if (window.confirm('This permanently deletes your profile, diary history, measurements, photos, and favorites from this device. Continue?')) {
      resetAllData();
      navigate('/');
    }
  }

  async function handleExportData() {
    await exportBackup();
  }

  const achievements = computeAchievements(diaryEntries, targets.proteinG);

  const heightDisplay = units === 'imperial' ? cmToFtIn(form.heightCm) : null;
  const weightDisplay = units === 'imperial' ? kgToLb(form.weightKg) : form.weightKg;

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">Profile</h1>
          <p className="mt-1 text-sm text-muted">Manage your details, goals, and preferences.</p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt2 text-fg transition hover:bg-surface-alt3"
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Plan summary */}
      <div className="rounded-xl2 bg-gradient-to-br from-primary-500 to-primary-600 p-5 text-white shadow-elevated">
        <p className="text-sm font-medium text-primary-50">Estimated daily target</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">~{targets.calories.toLocaleString()} kcal</p>
        <p className="text-xs text-primary-50">
          Range: {targetRanges.calories.min.toLocaleString()}–{targetRanges.calories.max.toLocaleString()} kcal
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="font-bold">{targets.proteinG}g</p>
            <p className="text-xs text-primary-50">Protein</p>
            <p className="text-[10px] text-primary-100">
              {targetRanges.protein.min}–{targetRanges.protein.max}g
            </p>
          </div>
          <div>
            <p className="font-bold">{targets.carbsG}g</p>
            <p className="text-xs text-primary-50">Carbs</p>
            <p className="text-[10px] text-primary-100">From remaining cals</p>
          </div>
          <div>
            <p className="font-bold">{targets.fatG}g</p>
            <p className="text-xs text-primary-50">Fat</p>
            <p className="text-[10px] text-primary-100">
              {targetRanges.fat.min}–{targetRanges.fat.max}g
            </p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-primary-50">
          <Info size={13} className="mt-0.5 shrink-0" />
          Estimated via Harris-Benedict (BMR {bmr} kcal × activity = TDEE {tdee} kcal). These are flexible ranges, not exact
          numbers to hit — not medical advice.
        </p>
      </div>

      {minorGuardrail && (
        <div className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <span>
            Since you&apos;re under 18, your numbers use gentler, growth-safe adjustments for whichever goal you choose.
            Please involve a parent, dietitian, or doctor for any weight-related goals.
          </span>
        </div>
      )}

      <button
        onClick={() => navigate('/nutrition')}
        className="flex w-full items-center justify-between gap-3 rounded-xl2 bg-surface p-4 text-left shadow-card transition hover:bg-surface-alt"
      >
        <div>
          <p className="text-sm font-bold text-fg">🍽️ My Nutrition</p>
          <p className="text-xs text-muted">Dietary restrictions, allergies, foods you like/avoid — used by every AI feature</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-faint" />
      </button>

      {/* Achievements */}
      <section>
        <h2 className="mb-2.5 text-sm font-bold text-fg">Achievements</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {achievements.map((a) => (
            <div
              key={a.label}
              className={`rounded-xl2 p-3 text-center shadow-card ${a.achieved ? 'bg-primary-50' : 'bg-surface opacity-70'}`}
            >
              <p className="text-xl">{a.emoji}</p>
              <p className="mt-1 text-base font-bold tabular-nums text-fg">{a.value}</p>
              <p className="text-[11px] text-muted">{a.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Today totals quick glance */}
      <section className="rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-sm font-bold text-fg">Today so far</h2>
        <p className="text-sm text-muted">
          {Math.round(todayDiary.totals.calories)} kcal · {Math.round(todayDiary.totals.proteinG)}g protein ·{' '}
          {todayDiary.entries.length} item{todayDiary.entries.length === 1 ? '' : 's'} logged
        </p>
      </section>

      {/* Personal details */}
      <section className="space-y-4 rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold text-fg">Personal details</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <input type="number" value={form.age} onChange={(e) => update('age', Number(e.target.value))} className="input" />
          </Field>
          <Field label="Sex">
            <div className="flex gap-2">
              <Chip selected={form.sex === 'male'} onClick={() => update('sex', 'male')}>
                Male
              </Chip>
              <Chip selected={form.sex === 'female'} onClick={() => update('sex', 'female')}>
                Female
              </Chip>
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={units === 'imperial' ? 'Height (ft/in)' : 'Height (cm)'}>
            {units === 'imperial' && heightDisplay ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={heightDisplay.ft}
                  onChange={(e) => update('heightCm', ftInToCm(Number(e.target.value), heightDisplay.inch))}
                  className="input"
                />
                <input
                  type="number"
                  value={heightDisplay.inch}
                  onChange={(e) => update('heightCm', ftInToCm(heightDisplay.ft, Number(e.target.value)))}
                  className="input"
                />
              </div>
            ) : (
              <input type="number" value={form.heightCm} onChange={(e) => update('heightCm', Number(e.target.value))} className="input" />
            )}
          </Field>
          <Field label={units === 'imperial' ? 'Weight (lb)' : 'Weight (kg)'}>
            <input
              type="number"
              value={weightDisplay}
              onChange={(e) => update('weightKg', units === 'imperial' ? lbToKg(Number(e.target.value)) : Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>

        <Field label="Activity level">
          <select value={form.activityLevel} onChange={(e) => update('activityLevel', e.target.value as ActivityLevel)} className="input">
            {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Workouts per week: ${form.trainingDaysPerWeek}`}>
          <input
            type="range"
            min={0}
            max={7}
            value={form.trainingDaysPerWeek}
            onChange={(e) => update('trainingDaysPerWeek', Number(e.target.value))}
            className="w-full accent-primary-500"
          />
        </Field>

        <Field label="Training types">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TRAINING_LABELS) as TrainingType[]).map((t) => (
              <Chip key={t} selected={form.trainingTypes.includes(t)} onClick={() => toggleTraining(t)}>
                {TRAINING_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Goal">
          <select value={form.goal} onChange={(e) => update('goal', e.target.value as Goal)} className="input">
            {Object.entries(GOAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {form.isMinor && <p className="mt-1.5 text-xs text-muted">Available for every goal — numbers stay growth-safe.</p>}
        </Field>

        <Field label="Protein target">
          <div className="flex gap-2">
            <Chip
              selected={!useCustomProtein}
              onClick={() => {
                setUseCustomProtein(false);
                update('customProteinTargetG', undefined);
              }}
            >
              Use recommended
            </Chip>
            <Chip
              selected={useCustomProtein}
              onClick={() => {
                setUseCustomProtein(true);
                if (form.customProteinTargetG == null) update('customProteinTargetG', Math.round((proteinRange.minG + proteinRange.maxG) / 2));
              }}
            >
              Set custom target
            </Chip>
          </div>
          {useCustomProtein ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                value={form.customProteinTargetG ?? ''}
                onChange={(e) => update('customProteinTargetG', Number(e.target.value) || 0)}
                className="input w-28"
              />
              <span className="text-sm text-muted">g / day</span>
            </div>
          ) : null}
          <p className="mt-1.5 text-xs text-muted">Estimated range for you: {proteinRange.minG}–{proteinRange.maxG}g/day</p>
        </Field>

        <Button fullWidth onClick={attemptSave}>
          Save changes
        </Button>

        {saveNotice && <p className="text-center text-xs font-medium text-primary-700">{saveNotice}</p>}
      </section>

      <ProteinRangeWarningModal
        open={proteinWarningOpen}
        targetG={form.customProteinTargetG ?? 0}
        range={proteinRange}
        onClose={() => setProteinWarningOpen(false)}
        onUseRecommended={() => {
          setUseCustomProtein(false);
          const next = { ...form, customProteinTargetG: undefined };
          setForm(next);
          setProteinWarningOpen(false);
          commitSave(next);
        }}
        onKeepTarget={() => {
          setProteinWarningOpen(false);
          commitSave(form);
        }}
      />

      {/* Weight tracking */}
      <section className="space-y-3 rounded-xl2 bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-fg">Weight tracking</h2>
          <ToggleSwitch checked={trackWeight} onChange={setTrackWeight} />
        </div>
        {trackWeight && (
          <div className="flex items-center justify-between rounded-xl bg-surface-alt px-3 py-2">
            <span className="text-sm text-muted">Log today&apos;s weight</span>
            <QuantityStepper value={todayWeight} onChange={setTodayWeight} step={0.5} min={20} max={400} suffix="kg" />
          </div>
        )}
        {trackWeight && (
          <Button size="sm" variant="secondary" onClick={() => addWeightLog(todayWeight)}>
            Save today&apos;s weight
          </Button>
        )}
        <Link to="/measurements" className="block text-xs font-semibold text-primary-600 hover:underline">
          📏 Track body measurements & progress photos →
        </Link>
      </section>

      {/* Apple Health */}
      <section className="space-y-2 rounded-xl2 bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <span>🍎</span> Apple Health
          </h2>
          <span className={`text-xs font-semibold ${healthConnected ? 'text-primary-600' : 'text-muted'}`}>
            {healthConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <p className="text-xs text-muted">
          Lets Nutrition AI show your steps and activity alongside your food log. Only available in a native iOS build — not
          this web version.
        </p>
        {healthConnected ? (
          <Button size="sm" variant="secondary" onClick={() => healthService.disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setHealthModalOpen(true)}>
            Connect Apple Health
          </Button>
        )}
      </section>

      {/* Settings */}
      <section className="space-y-3 rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold text-fg">Units</h2>
        <div className="flex gap-2">
          <Chip selected={units === 'metric'} onClick={() => setUnits('metric')}>
            kg / cm
          </Chip>
          <Chip selected={units === 'imperial'} onClick={() => setUnits('imperial')}>
            lb / ft-in
          </Chip>
        </div>
        <h2 className="pt-2 text-sm font-bold text-fg">Language</h2>
        <p className="text-xs text-muted">
          The AI Coach area and chat fully understand and reply in Hebrew. Other screens stay in English for now.
        </p>
        <div className="flex gap-2">
          <Chip selected={language === 'en'} onClick={() => setLanguage('en')}>
            English
          </Chip>
          <Chip selected={language === 'he'} onClick={() => setLanguage('he')}>
            עברית
          </Chip>
        </div>
      </section>

      {/* Privacy */}
      <section className="space-y-3 rounded-xl2 bg-surface p-4 shadow-card">
        <h2 className="text-sm font-bold text-fg">Privacy</h2>
        <p className="text-xs text-muted">
          All your data — profile, diary, body measurements, progress photos, and favorites — is stored only on this device.
          Nothing is uploaded to a server in this demo. Health/activity data is never sent anywhere and isn&apos;t collected at
          all in this web version.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportData}>
            Export data
          </Button>
          <Button variant="danger" icon={<Trash2 size={16} />} onClick={handleClearData}>
            Clear all my data
          </Button>
        </div>
      </section>

      <HealthConnectModal open={healthModalOpen} onClose={() => setHealthModalOpen(false)} />

      <button
        onClick={handleClearData}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-medium text-faint hover:text-red-500"
      >
        <LogOut size={13} /> Reset & start over
      </button>
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

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-primary-500' : 'bg-surface-alt3'}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
