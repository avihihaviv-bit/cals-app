import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { healthService } from '@/services/HealthService';
import { Info, Smartphone } from 'lucide-react';

const DATA_TYPES = ['Steps', 'Walking + Running Distance', 'Active Energy Burned', 'Exercise Minutes', 'Flights Climbed'];

interface HealthConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function HealthConnectModal({ open, onClose }: HealthConnectModalProps) {
  const [attempted, setAttempted] = useState(false);

  async function handleConnect() {
    await healthService.requestAuthorization();
    setAttempted(true);
  }

  function handleClose() {
    setAttempted(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Connect Apple Health" size="sm">
      {!attempted ? (
        <>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">🍎</div>
          <p className="text-sm text-fg">
            Allow the app to use your activity data to improve your nutrition recommendations.
          </p>
          <div className="mt-4 space-y-1.5">
            {DATA_TYPES.map((d) => (
              <div key={d} className="flex items-center gap-2 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
                {d}
              </div>
            ))}
          </div>
          <div className="mt-5 flex gap-2.5">
            <Button variant="secondary" fullWidth onClick={handleClose}>
              Not Now
            </Button>
            <Button fullWidth onClick={handleConnect}>
              Connect
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Smartphone size={22} />
          </div>
          <p className="text-sm font-semibold text-fg">Apple Health isn&apos;t available here</p>
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
            <Info size={13} className="mt-0.5 shrink-0" />
            HealthKit can only be read from a native iOS app — a website has no way to access it, so this web version can&apos;t
            pull your real step or activity data. This screen is ready to connect automatically the moment Nutrition AI runs as
            a native iOS app on your phone.
          </p>
          <Button fullWidth className="mt-5" onClick={handleClose}>
            Got it
          </Button>
        </>
      )}
    </Modal>
  );
}
