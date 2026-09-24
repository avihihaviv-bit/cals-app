import { AlertTriangle, WifiOff } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  offline?: boolean;
}

export function ErrorState({ title, description, onRetry, offline }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 bg-surface px-6 py-10 text-center shadow-card animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
        {offline ? <WifiOff size={26} /> : <AlertTriangle size={26} />}
      </div>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
