import { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandLogoProps {
  /** Sizes the mark — a Tailwind size utility (e.g. `size-6`, `size-10`). */
  className?: string;
  /** Off for a small square slot (the Settings logo-upload preview) where a horizontal
   *  mark + wordmark lockup wouldn't fit; on everywhere else. */
  showWordmark?: boolean;
  textClassName?: string;
  /** The mark on its blue app tile (the default, everywhere). Off draws the bare K for a slot that already has
   *  its own coloured background. */
  tile?: boolean;
}

/**
 * The KaryaOS mark: a white geometric K on a blue gradient tile, the same square as the phone app icon. The upper
 * arm is the violet accent and points up and forward at a small violet dot, like a task moving to done. K for
 * Karya (work).
 *
 * The tile is built in layers so it reads as a real app icon rather than a flat square: the gradient base, a soft
 * light from the top left, a darker fall-off at the bottom, a hairline inner edge, and a faint shadow under the
 * letter. Fixed colours (not theme tokens) so it is the same mark in light and dark mode and on the favicon and
 * install icons (public/favicon.svg and the PNGs are drawn from the same layers).
 *
 * The wordmark is "Karya" in the display face with "OS" as a small solid badge.
 */
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
                <stop stopColor="#5584f3" />
                <stop offset="0.55" stopColor="#3560d6" />
                <stop offset="1" stopColor="#213e9e" />
              </linearGradient>
              {/* Light from the top left. */}
              <radialGradient id={shine} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9 4) rotate(50) scale(30 24)">
                <stop stopColor="#ffffff" stopOpacity="0.38" />
                <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              {/* A darker fall-off along the bottom edge. */}
              <linearGradient id={shade} x1="20" y1="24" x2="20" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0b1a4d" stopOpacity="0" />
                <stop offset="1" stopColor="#0b1a4d" stopOpacity="0.28" />
              </linearGradient>
              <filter id={lift} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#0b1a4d" floodOpacity="0.35" />
              </filter>
            </defs>
            <rect width="40" height="40" rx="11" fill={`url(#${base})`} />
            <rect width="40" height="40" rx="11" fill={`url(#${shine})`} />
            <rect width="40" height="40" rx="11" fill={`url(#${shade})`} />
            <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="#ffffff" strokeOpacity="0.22" />
          </>
        )}
        <g filter={tile ? `url(#${lift})` : undefined}>
          <g strokeWidth="5" stroke={tile ? '#ffffff' : 'currentColor'} className={tile ? undefined : 'text-primary-700 dark:text-white'}>
            <path d="M14.5 11V29.5" />
            <path d="M21.1 20.4L28.9 29.5" />
          </g>
          <path d="M15.9 22.6L27.1 12.4" strokeWidth="5" stroke={tile ? '#d4c6ff' : '#7c5cdb'} />
          <circle cx="31.6" cy="9.4" r="2.3" fill={tile ? '#d4c6ff' : '#7c5cdb'} />
        </g>
      </svg>

      {showWordmark && (
        <span className={cn('inline-flex items-center gap-1 leading-none truncate', textClassName)}>
          <span className="font-display font-extrabold tracking-tight text-text">Karya</span>
          <span className="rounded-md bg-linear-to-br from-primary-500 to-primary-700 px-1 py-0.5 text-[0.6em] font-display font-bold leading-none tracking-wide text-white ring-1 ring-inset ring-white/20">OS</span>
        </span>
      )}
    </span>
  );
};
