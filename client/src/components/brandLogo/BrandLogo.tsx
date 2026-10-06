import { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandLogoProps {
  /** Sizes the icon tile — a Tailwind size utility (e.g. `size-6`, `size-10`). */
  className?: string;
  /** Off for a small square slot (the Settings logo-upload preview, the header) where a horizontal
   *  icon+wordmark lockup wouldn't fit; on everywhere else. */
  showWordmark?: boolean;
  textClassName?: string;
}

/**
 * The Karya mark: a flat sapphire tile with a bold K in two tones. The stem and the leg are white; the
 * upper arm is a soft violet and cut square, rising past the stem's top so the letter leans forward,
 * like work moving on. First letter of Karya (work), and a small forward motion.
 *
 * Flat, solid shapes with square cuts (no gloss, no hairlines, no shadow), so it reads as a mark
 * rather than an app-store icon and holds from a 16px favicon up. Colours are the Soft Sapphire
 * theme's own (primary blue, violet accent), so it sits in the same family as the app around it.
 *
 * The wordmark is "Karya" in the display face with the Devanagari "आर्य" beside it, lighter.
 */
export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName }: BrandLogoProps) => {
  // Unique per instance (and colon-free, which url(#id) needs) so Header + Footer + a preview
  // mounted at once don't collide on gradient ids.
  const uid = useId().replace(/:/g, '');
  const tileId = `karya-tile-${uid}`;
  const armClip = `karya-arm-${uid}`;
  const baseClip = `karya-base-${uid}`;

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} role="img" aria-label={showWordmark ? undefined : 'Karya'}>
        <defs>
          <linearGradient id={tileId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a66e2" />
            <stop offset="100%" stopColor="#2748a3" />
          </linearGradient>
          {/* The arm only shows to the right of the stem; the leg is cut level with the stem's foot. */}
          <clipPath id={armClip}><rect x="16" y="0" width="24" height="40" /></clipPath>
          <clipPath id={baseClip}><rect x="0" y="0" width="40" height="31" /></clipPath>
        </defs>

        <rect width="40" height="40" rx="9" fill={`url(#${tileId})`} />
        <rect x="11" y="9" width="5" height="22" fill="#ffffff" />
        <polygon clipPath={`url(#${armClip})`} points="14.3,18.7 26.8,7.2 30.2,10.8 17.7,22.3" fill="#cdbfff" />
        <polygon clipPath={`url(#${baseClip})`} points="17.2,21.2 20.8,17.8 31.8,29.3 28.2,32.7" fill="#ffffff" />
      </svg>

      {showWordmark && (
        <span className={cn('inline-flex items-baseline gap-1.5 leading-none truncate', textClassName)}>
          <span className="font-display font-extrabold tracking-tight text-primary-800 dark:text-white">Karya</span>
          <span lang="hi" className="text-[0.85em] text-text-muted" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 700 }}>
            आर्य
          </span>
        </span>
      )}
    </span>
  );
};
