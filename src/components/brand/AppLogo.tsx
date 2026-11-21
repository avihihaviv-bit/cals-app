import { useId } from 'react';

/** The app mark: a calorie ring closing around a leaf, with an AI sparkle. */
export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Nutrition AI">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id={`leaf${id}`} x1="20" y1="44" x2="44" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D1FAE5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#bg${id})`} />
      <circle cx="31" cy="34" r="17" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="4.5" />
      <path d="M31 17 A17 17 0 1 1 15.2 40.3" fill="none" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M23 42 C22 31 29 24 40 24 C40 35 33 42 23 42 Z" fill={`url(#leaf${id})`} />
      <path d="M24.5 40.5 C28 36 32 32 37 27" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M50 8 L51.8 12.2 L56 14 L51.8 15.8 L50 20 L48.2 15.8 L44 14 L48.2 12.2 Z" fill="#FFFFFF" />
    </svg>
  );
}
