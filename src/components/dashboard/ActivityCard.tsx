import { useEffect, useState } from 'react';
import { Footprints } from 'lucide-react';
import { healthService } from '@/services/HealthService';
import { HealthConnectModal } from '@/components/health/HealthConnectModal';
import type { ActivityData } from '@/types';

export function ActivityCard() {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    healthService.getTodayActivity().then(setActivity);
  }, []);

  const connected = healthService.getAuthStatus() === 'connected';

  return (
    <div className="rounded-xl2 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Footprints size={15} className="text-muted" />
          Activity
        </h3>
        {!connected && (
          <button onClick={() => setModalOpen(true)} className="text-xs font-semibold text-primary-600 hover:underline">
            Connect
          </button>
        )}
      </div>

      {connected && activity ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-base font-bold tabular-nums text-fg">{activity.steps.toLocaleString()}</p>
            <p className="text-[11px] text-muted">👟 Steps</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-fg">{activity.activeCalories}</p>
            <p className="text-[11px] text-muted">🔥 Active kcal</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-fg">{activity.exerciseMinutes}m</p>
            <p className="text-[11px] text-muted">🏃 Exercise</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Apple Health isn&apos;t connected — connect it to see today&apos;s steps and activity alongside your nutrition.
        </p>
      )}

      <HealthConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
