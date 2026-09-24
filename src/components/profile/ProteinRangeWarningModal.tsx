import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { ProteinRange } from '@/utils/nutritionCalculator';

interface ProteinRangeWarningModalProps {
  open: boolean;
  targetG: number;
  range: ProteinRange;
  onUseRecommended: () => void;
  onKeepTarget: () => void;
  onClose: () => void;
}

export function ProteinRangeWarningModal({ open, targetG, range, onUseRecommended, onKeepTarget, onClose }: ProteinRangeWarningModalProps) {
  const tooHigh = targetG > range.maxG;

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
        <AlertTriangle size={20} />
      </div>
      <p className="mt-3 text-sm font-semibold text-fg">
        {tooHigh ? 'This target is higher than' : 'This target is lower than'} the app&apos;s estimated range for your age and
        body size.
      </p>
      <p className="mt-1.5 text-xs text-muted">
        Your target: <b className="text-fg">{targetG}g</b> · Estimated range: <b className="text-fg">{range.minG}–{range.maxG}g</b>
      </p>
      <p className="mt-2 text-xs text-muted">
        You can keep your own number — this is just a comparison, not a rule. If you&apos;re unsure, a dietitian can help you
        pick a target that&apos;s right for you.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button fullWidth variant="secondary" onClick={onUseRecommended}>
          Use Recommended Range
        </Button>
        <Button fullWidth onClick={onKeepTarget}>
          Keep My Target
        </Button>
      </div>
    </Modal>
  );
}
