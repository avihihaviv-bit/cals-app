import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Button } from '@/components/ui/Button';
import { addDays, todayISO } from '@/utils/date';
import { calculateFullTargets } from '@/utils/nutritionCalculator';
import type { UserProfile } from '@/types';

const CHECK_IN_INTERVAL_DAYS = 7;
const SNOOZE_DAYS = 2;

/** True when it's been a week (or more) since the last weight entry / check-in and the user hasn't snoozed it. */
function isCheckInDue(profile: UserProfile | null, weightLog: { date: string }[], lastCheckInAt: string | null, snoozedUntil: string | null): boolean {
  if (!profile) return false;
  const today = todayISO();
  if (snoozedUntil && snoozedUntil > today) return false;
  const lastWeight = weightLog.length > 0 ? weightLog[weightLog.length - 1].date : null;
  const lastTouch = [lastWeight, lastCheckInAt, profile.createdAt.slice(0, 10)]
    .filter((d): d is string => !!d)
    .sort()
    .pop()!;
  return addDays(lastTouch, CHECK_IN_INTERVAL_DAYS) <= today;
}

export function WeeklyCheckInCard() {
  const profile = useAppStore((s) => s.profile);
  const weightLog = useAppStore((s) => s.weightLog);
  const lastCheckInAt = useAppStore((s) => s.lastCheckInAt);
  const checkInSnoozedUntil = useAppStore((s) => s.checkInSnoozedUntil);
  const addWeightLog = useAppStore((s) => s.addWeightLog);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const recordCheckIn = useAppStore((s) => s.recordCheckIn);
  const snoozeCheckIn = useAppStore((s) => s.snoozeCheckIn);
  const notificationsOn = useSettingsStore((s) => s.notifications.weeklyCheckIn);

  const [mode, setMode] = useState<'prompt' | 'entering' | 'result'>('prompt');
  const [weightInput, setWeightInput] = useState(profile?.weightKg ?? 0);
  const [diff, setDiff] = useState<{ prevWeight: number | null; calDelta: number; proteinDelta: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (!notificationsOn || dismissed || !profile) return null;
  // Once the user has started interacting this session, keep the card showing through to the
  // result screen even though recording the check-in makes them no-longer-"due" mid-flow.
  if (mode === 'prompt' && !isCheckInDue(profile, weightLog, lastCheckInAt, checkInSnoozedUntil)) return null;

  function handleSkip() {
    recordCheckIn();
    setDismissed(true);
  }

  function handleRemindLater() {
    snoozeCheckIn(addDays(todayISO(), SNOOZE_DAYS));
    setDismissed(true);
  }

  function handleSubmitWeight() {
    if (!profile) return;
    const prevWeight = weightLog.length > 0 ? weightLog[weightLog.length - 1].weightKg : profile.weightKg;
    const before = calculateFullTargets(profile);
    addWeightLog(weightInput);
    updateProfile({ weightKg: weightInput });
    const after = calculateFullTargets({ ...profile, weightKg: weightInput });
    recordCheckIn();
    setDiff({
      prevWeight,
      calDelta: after.macros.calories - before.macros.calories,
      proteinDelta: after.macros.proteinG - before.macros.proteinG,
    });
    setMode('result');
  }

  return (
    <div className="rounded-xl2 border border-primary-200 bg-primary-50 p-4 shadow-card">
      {mode === 'prompt' && (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-primary-800">📊 Weekly check-in</p>
            <button onClick={handleSkip} aria-label="Dismiss" className="text-primary-400 hover:text-primary-600">
              <X size={16} />
            </button>
          </div>
          <p className="mt-1 text-sm text-primary-700">
            It&apos;s been about a week — want to update your weight? It helps keep your targets accurate.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode('entering')}>
              Update
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSkip}>
              Skip
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRemindLater}>
              Remind me later
            </Button>
          </div>
        </>
      )}

      {mode === 'entering' && (
        <>
          <p className="text-sm font-bold text-primary-800">What&apos;s your current weight?</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(Number(e.target.value) || 0)}
              className="input w-28"
            />
            <span className="text-sm text-primary-700">kg</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleSubmitWeight}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('prompt')}>
              Back
            </Button>
          </div>
        </>
      )}

      {mode === 'result' && diff && (
        <>
          <p className="text-sm font-bold text-primary-800">Got it — thanks for checking in!</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-xs text-primary-600">Previous</p>
              <p className="font-bold tabular-nums text-primary-800">{diff.prevWeight != null ? `${diff.prevWeight}kg` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-primary-600">Current</p>
              <p className="font-bold tabular-nums text-primary-800">{weightInput}kg</p>
            </div>
            <div>
              <p className="text-xs text-primary-600">Change</p>
              <p className="font-bold tabular-nums text-primary-800">
                {diff.prevWeight != null ? `${weightInput - diff.prevWeight >= 0 ? '+' : ''}${(weightInput - diff.prevWeight).toFixed(1)}kg` : '—'}
              </p>
            </div>
          </div>
          {(diff.calDelta !== 0 || diff.proteinDelta !== 0) ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-surface p-3">
              <p className="text-xs text-fg">
                Your nutrition targets were updated to match{diff.calDelta !== 0 ? ` (${diff.calDelta > 0 ? '+' : ''}${diff.calDelta} kcal)` : ''}.
              </p>
              <a href="#/profile" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-600">
                View changes <ArrowRight size={12} />
              </a>
            </div>
          ) : (
            <p className="mt-3 text-xs text-primary-600">Your targets stay the same.</p>
          )}
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setDismissed(true)}>
            Done
          </Button>
        </>
      )}
    </div>
  );
}
