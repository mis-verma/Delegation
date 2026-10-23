import { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandLogoProps {
  className?: string;
  showWordmark?: boolean;
  textClassName?: string;
  tile?: boolean;
}

export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName, tile = true }: BrandLogoProps) => {
  const id = useId().replace(/:/g, '');
  const base = `karya-base-${id}`;
  const shine = `karya-shine-${id}`;
  const shade = `karya-shade-${id}`;
  const lift = `karya-lift-${id}`;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg
        viewBox="0 0 40 40"
        className={cn('shrink-0', tile && 'drop-shadow-[0_2px_5px_rgba(35,66,166,0.28)]', className)}
        fill="none"
        strokeLinecap="round"
        role="img"
        aria-label={showWordmark ? undefined : 'KaryaOS'}
        aria-hidden={showWordmark ? true : undefined}
      >
        {tile && (
          <>
            <defs>
              <linearGradient id={base} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
                <stop stopColor="#5a86f5" />
                <stop offset="0.5" stopColor="#2f58cf" />
                <stop offset="1" stopColor="#16297a" />
              </linearGradient>
              <radialGradient id={shine} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(8 3) rotate(52) scale(32 24)">
                <stop stopColor="#ffffff" stopOpacity="0.42" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={shade} x1="20" y1="22" x2="20" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#08143f" stopOpacity="0" />
                <stop offset="1" stopColor="#08143f" stopOpacity="0.32" />
              </linearGradient>
              <filter id={lift} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#08143f" floodOpacity="0.4" />
              </filter>
            </defs>
            <rect width="40" height="40" rx="11" fill={`url(#${base})`} />
            <rect width="40" height="40" rx="11" fill={`url(#${shine})`} />
            <rect width="40" height="40" rx="11" fill={`url(#${shade})`} />
            <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="#ffffff" strokeOpacity="0.24" />
          </>
        )}
        <g filter={tile ? `url(#${lift})` : undefined} stroke={tile ? '#ffffff' : 'currentColor'} strokeLinejoin="round" className={tile ? undefined : 'text-primary-700 dark:text-white'}>
          <circle cx="20" cy="24.5" r="10.5" strokeWidth="4" />
          <path d="M20 3.2l3.6 3.8-3.6 3.8-3.6-3.8z" fill={tile ? '#ffffff' : 'currentColor'} stroke="none" />
          <path d="M16 24.8l3 3 5.2-6.6" strokeWidth="3.4" />
        </g>
      </svg>

      {showWordmark && (
        <span className={cn('inline-flex items-center gap-1 leading-none truncate', textClassName)}>
          <span className="font-display font-extrabold tracking-tight text-text">Karya</span>
          <span className="rounded-md bg-linear-to-br from-primary-500 to-primary-800 px-1 py-0.5 text-[0.6em] font-display font-bold leading-none tracking-wide text-white ring-1 ring-inset ring-white/20">OS</span>
        </span>
      )}
    </span>
  );
};
