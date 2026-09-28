import { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandLogoProps {
  /** Sizes the icon tile — a Tailwind size utility (e.g. `size-6`, `size-10`). */
  className?: string;
  /** Off for a small square slot (the Settings logo-upload preview) where a horizontal
   *  icon+wordmark lockup wouldn't fit; on everywhere else. */
  showWordmark?: boolean;
  textClassName?: string;
}

/**
 * The Karya mark: a Latin "K" followed by the Devanagari "आर्य", so the lockup reads Karya
 * (क + आर्य, "work").
 *
 * The idea that ties the two scripts together is the shirorekha, the headline bar every
 * Devanagari letter hangs from. Here it is drawn in gold across the top of the navy tile, and the
 * K is built the Devanagari way: its stem hangs from that bar and its upper arm rises into it,
 * instead of floating free as a Latin letter would. Next to the wordmark, whose own letters hang
 * from the same kind of bar, the K reads as the first letter of one word.
 *
 * All flat, filled geometry (no hairline strokes) so it holds from a 16px favicon up; a 1px light
 * inner edge keeps the navy tile from sinking into a dark page.
 */
export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName }: BrandLogoProps) => {
  // Unique per instance (and colon-free, which url(#id) needs) so Header + Footer + a preview
  // mounted at once don't collide on gradient/clip ids.
  const uid = useId().replace(/:/g, '');
  const tileId = `karya-tile-${uid}`;
  const goldId = `karya-gold-${uid}`;
  const clipId = `karya-clip-${uid}`;

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} role="img" aria-label={showWordmark ? undefined : 'Karya'}>
        <defs>
          <linearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#35598c" />
            <stop offset="100%" stopColor="#152a4b" />
          </linearGradient>
          <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f0d27a" />
            <stop offset="100%" stopColor="#c89b32" />
          </linearGradient>
          {/* Flat baseline for the K: the diagonal leg is cut level with the stem's foot. */}
          <clipPath id={clipId}>
            <rect x="0" y="0" width="40" height="31.5" />
          </clipPath>
        </defs>

        <rect width="40" height="40" rx="10" fill={`url(#${tileId})`} />
        <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" fill="none" stroke="#ffffff" strokeOpacity="0.14" />

        {/* The K, white. Stem hangs from the bar; the upper arm runs up into it; the leg kicks
            out to the baseline. */}
        <g fill="none" stroke="#ffffff" strokeLinecap="butt" clipPath={`url(#${clipId})`}>
          <line x1="12.6" y1="10" x2="12.6" y2="31.5" strokeWidth="5.2" />
          <line x1="13.4" y1="24.2" x2="28.6" y2="11.4" strokeWidth="5" />
          <line x1="18.2" y1="19.6" x2="31.6" y2="33.2" strokeWidth="5.4" />
        </g>

        {/* The gold headline bar, drawn last so the stem and arm read as hanging from it. */}
        <rect x="6.5" y="8" width="27" height="3.6" rx="1.8" fill={`url(#${goldId})`} />
      </svg>

      {showWordmark && (
        <span
          lang="hi"
          className={cn('leading-none text-primary-800 dark:text-white truncate', textClassName)}
          style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 800 }}
        >
          आर्य
        </span>
      )}
    </span>
  );
};
