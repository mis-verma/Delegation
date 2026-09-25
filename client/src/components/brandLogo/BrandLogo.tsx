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

// The app's own default mark — replaces the old logo.png (a glossy, photorealistic 3D render
// that didn't match this app's flat, token-driven visual language and went illegible at the 24px
// height Header/Footer actually render it at). Keeps the original's actual identity — a "K" whose
// lower leg is a checkmark, immediately followed by "आर्य" so the whole lockup reads "Karya"
// (क+आर्य, work/task), just as flat filled shapes instead of glossy 3D chrome.
//
// Two earlier passes at this fused K+checkmark shape both failed the same way: the checkmark's
// upstroke crossed diagonally through the K's own upper arm, which the original's glossy 3D
// render gets away with (strong directional lighting/bevels sell the two strokes as separate
// objects in depth) but flat color can't — at real size (44px in the header, smaller still as a
// favicon) it just read as a tangle of crossing lines. The fix: keep the checkmark's long stroke
// running roughly PARALLEL to the K's upper diagonal instead of crossing it, offset below/right —
// same "K with an integrated check" silhouette, no ambiguous overlap.
export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName }: BrandLogoProps) => {
  // Unique per instance so Header + Footer + a logo-upload preview mounted at once don't collide
  // on the gradient's id — a duplicate SVG def id is invalid and can resolve to the wrong instance.
  const gradientId = `brand-logo-tile-${useId()}`;

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} role="img" aria-label={showWordmark ? undefined : 'Karya'}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#426a9f" />
            <stop offset="100%" stopColor="#213e6a" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill={`url(#${gradientId})`} />
        {/* K's vertical bar + upper diagonal, as one solid white shape (no hand-drawn stroke
            skeleton — a filled letterform silhouette holds up at small sizes the way a thin line
            doesn't). */}
        <path
          d="M9 6 L15 6 L15 18.5 L26.5 6.5 L32.5 6.5 L18 21.2 L15 21.2 L15 34 L9 34 Z"
          fill="#ffffff"
        />
        {/* The checkmark, gold, sitting below the upper diagonal rather than crossing it. */}
        <path d="M9.5 25.5 L12.6 22.4 L17 26.8 L31.5 12.2 L34.4 15.1 L17 32.5 Z" fill="#d4af37" />
      </svg>
      {showWordmark && (
        <span
          lang="hi"
          className={cn('leading-none text-primary-700 dark:text-white truncate', textClassName)}
          style={{ fontFamily: "'Noto Sans Devanagari', sans-serif", fontWeight: 800 }}
        >
          आर्य
        </span>
      )}
    </span>
  );
};
