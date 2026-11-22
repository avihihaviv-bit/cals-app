import { useId } from 'react';

/** The app mark: a calorie gauge closing around a leaf, with an AI sparkle. */
export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Nutrition AI">
      <defs>
        <linearGradient id={`bg${id}`} x1="8" y1="0" x2="56" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.55" stopColor="#10B981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={`arc${id}`} x1="15" y1="51" x2="49" y2="17" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="0.5" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
        <linearGradient id={`leaf${id}`} x1="22" y1="44" x2="42" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D1FAE5" />
        </linearGradient>
        <radialGradient id={`shine${id}`} cx="20" cy="8" r="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id={`glow${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#bg${id})`} />
      <rect width="64" height="64" rx="16" fill={`url(#shine${id})`} />
      {/* gauge track + tick marks */}
      <circle cx="32" cy="34" r="18" fill="none" stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="5" />
      <circle cx="32" cy="34" r="23.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="1.2" strokeDasharray="0.8 5.35" />
      {/* progress arc (≈ ¾) with a glowing knob at its end */}
      <path d="M32 16 A18 18 0 1 1 14 34" fill="none" stroke={`url(#arc${id})`} strokeWidth="5" strokeLinecap="round" />
      <circle cx="14" cy="34" r="4.2" fill="#FFFFFF" opacity="0.55" filter={`url(#glow${id})`} />
      <circle cx="14" cy="34" r="2.9" fill="#FFFFFF" />
      {/* leaf */}
      <path d="M24 42 C23.2 32.5 29.5 26 39.5 26 C39.6 35.6 33.3 42 24 42 Z" fill={`url(#leaf${id})`} />
      <path d="M25.6 40.4 C28.8 36.4 32.4 32.6 36.8 28.8" stroke="#059669" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      {/* AI sparkle */}
      <path d="M51 7 L52.6 10.9 L56.5 12.5 L52.6 14.1 L51 18 L49.4 14.1 L45.5 12.5 L49.4 10.9 Z" fill="#FFFFFF" />
    </svg>
  );
}
