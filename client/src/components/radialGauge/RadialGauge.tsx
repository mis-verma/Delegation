import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { usePrefersReducedMotion } from '../../lib/useMediaQuery';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RadialGaugeProps {
  /** 0-100. Values outside that range are clamped. */
  percent: number;
  /** Pixel width/height of the gauge (it's square). */
  size?: number;
  trackClassName?: string;
  gradientFrom?: string;
  gradientTo?: string;
  /** Rendered centered inside the arc — the percent label, a trend badge, whatever the caller needs. */
  children?: ReactNode;
  className?: string;
  /** 'arc' (default) is the 240° speedometer-style gauge every existing caller expects. 'circle'
   * is a full 360° donut that fills clockwise from the top — used where a complete circular chart
   * reads better than a gauge with a gap at the bottom. */
  variant?: 'arc' | 'circle';
}

export const RadialGauge = ({
  percent,
  size = 220,
  // Theme token (not raw slate-100) — that hardcoded value never adapted to dark mode and, being
  // near-white, was barely visible against a light-mode card too. text-border tracks the app's
  // actual border color, which reads as a clear "background track" ring in both themes.
  trackClassName = 'text-border',
  gradientFrom = 'var(--color-primary-600, #4f46e5)',
  gradientTo = 'var(--color-primary-400, #818cf8)',
  children,
  className,
  variant = 'arc',
}: RadialGaugeProps) => {
  // useId() ids contain colons (":r4a:") — safe as an `id` attribute, but referencing them via
  // url(#:r4a:-gradient) in `stroke`/`filter` fails to resolve in some browsers, which silently
  // dropped the colored fill arc and left every gauge showing only its neutral track color.
  const baseId = useId().replace(/:/g, '');
  const gradientId = `${baseId}-gradient`;
  // Most callers (both compliance gauges, the delegation-score card) pass the same value for
  // both ends — a single flat tone, not an actual two-color gradient. Forcing those through a
  // <linearGradient> + url(#id) reference added a second point of failure (id resolution) on top
  // of the color itself for no visual benefit; a literal stroke color has no id to fail to
  // resolve. The url()-based gradient is kept only for callers that pass genuinely different
  // colors (e.g. ComplianceGaugeRail's two-tone arcs).
  const isSolidColor = gradientFrom === gradientTo;

  const isCircle = variant === 'circle';
  const clampedPercent = Math.min(Math.max(percent, 0), 100);

  // conic-gradient stops can't be smoothly interpolated by a CSS transition — browsers either
  // snap straight to the new value or repaint it in visibly discrete steps, which is what read as
  // "laggy/zig-zag" rather than a soft fill. Driving the interpolation ourselves frame-by-frame
  // (a plain rAF easing loop) is the only way to get a genuinely smooth animated fill here.
  const [animatedPercent, setAnimatedPercent] = useState(clampedPercent);
  const fromRef = useRef(clampedPercent);
  const frameRef = useRef<number | null>(null);

  // This loop is JavaScript, so index.css's prefers-reduced-motion block can't reach it — the
  // check has to happen here, or the one piece of motion on the page a motion-sensitive user would
  // most notice (a sweeping 176px ring) is the one piece that ignores their setting.
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!isCircle) return;
    const from = fromRef.current;
    const to = clampedPercent;
    if (from === to) return;

    // Nothing to animate — `displayPercent` below reads the real value directly under reduced
    // motion, so the ring lands on it immediately rather than freezing mid-sweep. The ref is still
    // kept in sync so a later switch back to full motion animates from the right starting point.
    if (prefersReducedMotion) {
      fromRef.current = to;
      return;
    }

    const duration = 650;
    const startTime = performance.now();
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic — quick start, soft landing
      setAnimatedPercent(from + (to - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [clampedPercent, isCircle, prefersReducedMotion]);

  const displayPercent = isCircle && !prefersReducedMotion ? animatedPercent : clampedPercent;

  const { trackLength, fillLength, circumference } = useMemo(() => {
    const radius = 40;
    const circ = 2 * Math.PI * radius;
    const track = (240 / 360) * circ;
    const fill = (displayPercent / 100) * track;

    return { circumference: circ, trackLength: track, fillLength: fill };
  }, [displayPercent]);

  // Thicker than the gauge's stroke — a full circle reads as a genuinely "filled" chart at this
  // weight instead of a thin outline, without going so thick it swallows the centered label.
  const ringThickness = isCircle ? Math.round(size * 0.11) : 8;

  return (
    <div
      // overflow-hidden here (not just left to whatever card wraps this) is the load-bearing fix:
      // the SVG below deliberately uses overflow-visible so its drop-shadow glow isn't clipped
      // right at the arc's edge, but that glow's filter region (140% of the SVG's own box) was
      // escaping past this component entirely into the surrounding page whenever the wrapping
      // card didn't happen to have its own overflow-hidden — self-contained here means it can
      // never leak regardless of what wraps it.
      className={cn("relative shrink-0 flex items-center justify-center overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {isCircle ? (
        // A full circular chart is drawn with a conic-gradient + mask instead of SVG dasharray —
        // dasharray math for a *closed* loop (dash length equal to the full circumference at 0%
        // or 100%) hits float-rounding edge cases in some renderers that silently drop the fill
        // stroke entirely while leaving the track visible. conic-gradient has no such edge case:
        // the color simply stops at `clampedPercent`, all the way from 0 to 100.
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              displayPercent <= 0
                ? `var(--color-border)`
                : `conic-gradient(from 0deg, ${gradientFrom} ${displayPercent}%, var(--color-border) ${displayPercent}% 100%)`,
            // Both mask stops used to sit at the exact same offset — a zero-width transition, which
            // some browsers rasterize as a visibly jagged/stepped inner edge (worse at the smaller
            // 132px mobile size, where each pixel is a bigger share of the ring). A 1px-wide feather
            // between the stops gives the mask something to actually antialias.
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px - 0.5px), #000 calc(100% - ${ringThickness}px + 0.5px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px - 0.5px), #000 calc(100% - ${ringThickness}px + 0.5px))`,
          }}
        />
      ) : (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          {!isSolidColor && (
            <defs>
              {/* stopColor is a plain SVG presentation attribute, not a CSS property — some browsers
                  don't resolve a var(...) passed through it the way they would in a style object,
                  which silently dropped the whole colored arc. Routing it through `style` instead
                  guarantees real CSS var resolution. */}
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: gradientFrom }} />
                <stop offset="100%" style={{ stopColor: gradientTo }} />
              </linearGradient>
            </defs>
          )}

          {/* Background Track */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            className={trackClassName}
            strokeWidth={ringThickness}
            strokeLinecap="round"
            strokeDasharray={`${trackLength} ${circumference}`}
            transform="rotate(150 50 50)"
          />

          {/* Active Fill Track — the glow used to be an SVG <filter>/<feDropShadow>, but a filter
              reference that fails to resolve doesn't just drop the shadow, it drops the whole
              element per spec, which is exactly what was making the arc vanish while the percent
              label still rendered fine. A plain CSS drop-shadow (via style, not an SVG filter
              primitive) gives the same soft glow without that failure mode. */}
          {percent > 0 && (
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              strokeWidth={ringThickness}
              strokeLinecap="round"
              strokeDasharray={`${fillLength} ${circumference}`}
              transform="rotate(150 50 50)"
              style={{
                // `stroke` (unlike the SVG-only `stop-color`) is a real, universally-supported CSS
                // property, so setting it via style is the most reliable way to get a var()-backed
                // color painted here — no id/url() resolution involved at all for the common
                // solid-color case.
                stroke: isSolidColor ? gradientFrom : `url(#${gradientId})`,
                filter: `drop-shadow(0 3px 3px color-mix(in srgb, ${gradientFrom} 25%, transparent))`,
              }}
              className="transition-all duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] origin-center"
            />
          )}
        </svg>
      )}

      {/* The 240° arc leaves its gap at the bottom, so centered content reads slightly high unless
          nudged down — offset scales with size instead of a fixed px value so smaller gauges
          (e.g. a compact compliance rail) don't get over-shifted relative to their own arc. A full
          circle has no gap to compensate for, so it stays perfectly centered. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
        style={{ paddingTop: isCircle ? 0 : size * (24 / 220) }}
      >
        {children}
      </div>
    </div>
  );
};