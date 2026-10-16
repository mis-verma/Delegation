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
 * Karya (work). Fixed colours (not theme tokens) so it is the same mark in light and dark mode and on the
 * favicon and install icons (public/favicon.svg and the PNGs are drawn from the same shapes).
 *
 * The wordmark is "Karya" in the display face with "OS" as a small solid badge.
 */
export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName, tile = true }: BrandLogoProps) => {
  const gradientId = `karya-tile-${useId().replace(/:/g, '')}`;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg
        viewBox="0 0 40 40"
        className={cn('shrink-0', className)}
        fill="none"
        strokeLinecap="round"
        role="img"
        aria-label={showWordmark ? undefined : 'KaryaOS'}
        aria-hidden={showWordmark ? true : undefined}
      >
        {tile && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4f7cf0" />
                <stop offset="1" stopColor="#2342a6" />
              </linearGradient>
            </defs>
            <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
          </>
        )}
        <g strokeWidth="5" stroke={tile ? '#ffffff' : 'currentColor'} className={tile ? undefined : 'text-primary-700 dark:text-white'}>
          <path d="M14.5 11V29.5" />
          <path d="M21.1 20.4L28.9 29.5" />
        </g>
        <path d="M15.9 22.6L27.1 12.4" strokeWidth="5" stroke={tile ? '#cdbdff' : '#7c5cdb'} />
        <circle cx="31.6" cy="9.4" r="2.3" fill={tile ? '#cdbdff' : '#7c5cdb'} />
      </svg>

      {showWordmark && (
        <span className={cn('inline-flex items-center gap-1 leading-none truncate', textClassName)}>
          <span className="font-display font-extrabold tracking-tight text-text">Karya</span>
          <span className="rounded-md bg-linear-to-br from-primary-500 to-primary-700 px-1 py-0.5 text-[0.6em] font-display font-bold leading-none tracking-wide text-white">OS</span>
        </span>
      )}
    </span>
  );
};
