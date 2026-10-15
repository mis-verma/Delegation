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
  /** The mark on a solid rounded tile, like an app icon. Off by default: the header and footer show the bare mark. */
  tile?: boolean;
}

/**
 * The KaryaOS mark: a clean geometric K with round ends. The stem and the leg are one colour, and the
 * upper arm is the violet accent, crossing the stem so the letter leans forward, like work moving on.
 * K for Karya (work).
 *
 * Every stroke is the same weight and there is no gradient, gloss or shadow, so it reads as a mark rather
 * than an app-store icon and stays a K down to 16px. Bare by default (primary blue, white in dark mode); the
 * `tile` version puts it on a flat primary tile for places that want an app-icon square. Colours are the
 * Soft Sapphire theme's own (primary, coral).
 *
 * The wordmark is "Karya" in the display face with "OS" lighter and in the accent blue.
 */
export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName, tile = false }: BrandLogoProps) => (
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
      {tile && <rect width="40" height="40" rx="9" className="fill-primary-600" />}
      <g transform={tile ? 'translate(5.6 5.6) scale(0.72)' : undefined} strokeWidth="5.4">
        <path d="M11.5 8V32" stroke="currentColor" className={tile ? 'text-white' : 'text-primary-700 dark:text-white'} />
        <path d="M17.8 18.4L29.6 32" stroke="currentColor" className={tile ? 'text-white' : 'text-primary-700 dark:text-white'} />
        <path d="M12.5 22L29 8" stroke="currentColor" className={tile ? 'text-coral-200' : 'text-coral-500 dark:text-coral-300'} />
      </g>
    </svg>

    {showWordmark && (
      <span className={cn('inline-flex items-baseline leading-none truncate', textClassName)}>
        <span className="font-display font-extrabold tracking-tight text-primary-800 dark:text-white">Karya</span>
        <span className="font-display font-medium tracking-tight text-primary-600 dark:text-primary-300">OS</span>
      </span>
    )}
  </span>
);
