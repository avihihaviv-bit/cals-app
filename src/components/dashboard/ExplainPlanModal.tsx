import { Modal } from '@/components/ui/Modal';
import { useAppStore } from '@/store/useAppStore';
import { useTargets } from '@/hooks/useTargets';

export function ExplainPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useAppStore((s) => s.profile);
  const { targets, bmr, tdee } = useTargets();

  return (
    <Modal open={open} onClose={onClose} title="How this was calculated" size="sm">
      <div className="space-y-4 text-sm text-fg">
        <div>
          <p className="font-semibold">1. Resting energy (BMR)</p>
          <p className="mt-1 text-xs text-muted">
            Harris-Benedict formula, using your age, sex, height, and weight — the calories your body burns at rest.
          </p>
          <p className="mt-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-medium tabular-nums">≈ {bmr} kcal/day</p>
        </div>
        <div>
          <p className="font-semibold">2. Total energy (TDEE)</p>
          <p className="mt-1 text-xs text-muted">
            BMR × your activity level ({profile?.activityLevel.replace('_', ' ')}) — an estimate of everything you burn in a day.
          </p>
          <p className="mt-1.5 rounded-lg bg-surface-alt px-3 py-2 text-xs font-medium tabular-nums">≈ {tdee} kcal/day</p>
        </div>
        <div>
          <p className="font-semibold">3. Your target</p>
          <p className="mt-1 text-xs text-muted">
            TDEE adjusted for your goal ({profile?.goal.replace('_', ' ')}), kept within a safe, sustainable range — never an
            extreme deficit or surplus.
          </p>
          <p className="mt-1.5 rounded-lg bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 tabular-nums">
            ≈ {targets.calories} kcal/day
          </p>
        </div>
        <div>
          <p className="font-semibold">4. Macros</p>
          <p className="mt-1 text-xs text-muted">
            Protein is set from your bodyweight to support your goal, fat gets a healthy minimum share of calories, and carbs
            fill the rest.
          </p>
          <p className="mt-1.5 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
            <span className="rounded-lg bg-surface-alt px-2 py-2 text-protein">{targets.proteinG}g protein</span>
            <span className="rounded-lg bg-surface-alt px-2 py-2 text-carbs">{targets.carbsG}g carbs</span>
            <span className="rounded-lg bg-surface-alt px-2 py-2 text-fat">{targets.fatG}g fat</span>
          </p>
        </div>
        <p className="text-xs text-muted">
          These are estimates, not exact measurements — actual metabolism varies. Not medical advice.
        </p>
      </div>
    </Modal>
  );
}
