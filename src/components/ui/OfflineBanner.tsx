import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white animate-slide-up">
      <WifiOff size={16} />
      You&apos;re offline — showing saved data. Some features need a connection.
    </div>
  );
}
