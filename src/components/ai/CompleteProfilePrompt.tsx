import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

/**
 * Shown wherever a screen would otherwise need to guess at nutrition
 * targets because the user's profile isn't available yet. The calculation
 * engine never invents plausible-looking numbers when profile data is
 * missing — this prompt is what's shown instead.
 */
export function CompleteProfilePrompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl2 bg-surface p-6 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <AlertTriangle size={22} />
      </div>
      <div>
        <p className="font-semibold text-fg">To calculate your targets accurately, a few details are missing.</p>
        <p className="mt-1 text-sm text-muted">We never guess your calorie or macro targets — they're always computed from your real profile.</p>
      </div>
      <Link
        to="/profile"
        className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600 active:scale-95"
      >
        Complete Profile
      </Link>
    </div>
  );
}
