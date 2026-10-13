import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Badge, type badgeVariants } from '../../components/ui/badge';
import { Skeleton } from '../../components/skeleton';
import { CountUp } from '../../components/countUp';
import type { VariantProps } from 'class-variance-authority';

interface StatCardProps {
  label: string;
  value: number | string;
  trend?: { direction: 'up' | 'down'; label: string };

  lowerIsBetter?: boolean;
  icon?: LucideIcon;
  iconTint?: string;
  iconBgTint?: string;
  caption?: string;
  onClick?: () => void;
  /** Renders the whole card as a real link (middle-click, open in new tab, right-click all work)
   *  with an arrow that appears on hover/focus. Wins over `onClick` when both are given. */
  href?: string;
  /** Replaces the big number with a placeholder while the first request is still in flight. */
  isLoading?: boolean;
  /** Tighter padding and a smaller number below `sm`, so a grid of these reads as a 2-up set of
   *  tiles on a phone instead of a wall of big cards. Unchanged from `sm` up. */
  compact?: boolean;
  highlight?: boolean;
  decorative?: boolean;
  /** Sits beside the label (a "how is this calculated" popover). Clicks on it never reach the card's own click or link. */
  labelAdornment?: ReactNode;
}

type TrendMood = 'good' | 'bad' | 'flat';

const TREND_STYLE: Record<TrendMood, string> = {
  good: 'text-success bg-success/10 border-success/20',
  bad: 'text-danger bg-danger/10 border-danger/20',
  flat: 'text-text-muted bg-surface-hover border-border/60',
};

const TREND_STYLE_HIGHLIGHT: Record<TrendMood, string> = {
  good: 'text-white bg-white/20 border-white/30',
  bad: 'text-white bg-white/20 border-white/30',
  flat: 'text-white/80 bg-white/10 border-white/20',
};

const TREND_VARIANT: Record<TrendMood, NonNullable<VariantProps<typeof badgeVariants>['variant']>> = {
  good: 'success',
  bad: 'destructive',
  flat: 'neutral',
};


const COMPACT_THRESHOLD = 10_000;

const formatValue = (value: number | string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (Math.abs(value) < COMPACT_THRESHOLD) return value.toLocaleString();
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
};


const TINT_TO_ICON_BG: Record<string, { bg: string; border: string }> = {
  primary: {
    bg: 'bg-gradient-to-br from-primary-500/15 to-primary-700/15 dark:from-primary-500/25 dark:to-primary-700/25',
    border: 'border-primary-500/25',
  },
  coral: {
    bg: 'bg-gradient-to-br from-coral-400/15 to-coral-600/15 dark:from-coral-500/25 dark:to-coral-700/25',
    border: 'border-coral-600/25',
  },
  success: { bg: 'bg-success/10', border: 'border-success/25' },
  warning: { bg: 'bg-warning/10', border: 'border-warning/25' },
  danger: { bg: 'bg-danger/10', border: 'border-danger/25' },
};


const TINT_TO_RING: Record<string, string> = {
  primary: 'border-primary-500/30 dark:border-primary-400/30',
  coral: 'border-coral-500/30',
  success: 'border-success/30',
  warning: 'border-warning/30',
  danger: 'border-danger/30',
};

export const StatCard = ({
  label,
  value,
  trend,
  icon: Icon,
  iconTint,
  iconBgTint,
  caption,
  onClick,
  href,
  isLoading = false,
  compact = false,
  highlight = false,
  decorative = false,
  lowerIsBetter = false,
  labelAdornment,
}: StatCardProps) => {
  const isLink = Boolean(href);
  // "No data" is the written placeholder; it is set smaller than a real figure so it does not shout.
  const isNoData = value === 'No data';
  const isPlaceholder = isNoData || value === '—';
  const isInteractive = isLink || Boolean(onClick);


  // A trend with no label, or one that only says there is nothing to compare, is not a trend: show
  // no badge rather than a fake "0%".
  const hasTrend = trend != null && trend.label !== '' && trend.label !== '—' && trend.label !== 'No data';
  const isFlat = hasTrend && Number.parseFloat(trend.label) === 0;
  const trendMood: TrendMood = !hasTrend || isFlat ? 'flat' : trend.direction === 'up' !== lowerIsBetter ? 'good' : 'bad';
  const TrendIcon = isFlat ? Minus : trend?.direction === 'up' ? ArrowUpRight : ArrowDownRight;

  const derivedTintKey = iconTint && Object.keys(TINT_TO_ICON_BG).find((key) => iconTint.includes(key));
  const iconBgClass = iconBgTint ?? (derivedTintKey ? TINT_TO_ICON_BG[derivedTintKey].bg : 'bg-surface-hover/80');
  const iconBorderClass = !iconBgTint && derivedTintKey ? TINT_TO_ICON_BG[derivedTintKey].border : 'border-border/40';
  const ringClass = derivedTintKey ? TINT_TO_RING[derivedTintKey] : 'border-border/50';
  const iconHoverClass = isInteractive ? (derivedTintKey || iconBgTint ? 'group-hover:brightness-110' : 'group-hover:border-border/60 group-hover:bg-surface-hover') : '';

  // No box-shadow and no lift/scale on hover: an interactive card just changes its border colour
  // (same recipe as ENTITY_CARD_CLASS), and the focus ring sits inside the box because the
  // clip-path below would trim an outer one.
  const rootClass = `group relative isolate flex flex-col gap-3 rounded-2xl ${compact ? 'p-3.5 sm:p-6' : 'p-5 sm:p-6'} transition-[color,background-color,border-color,filter] duration-200 ease-out motion-reduce:transition-none [clip-path:inset(0_round_1rem)] ${
    highlight
      ? decorative
        ? 'bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 overflow-hidden'
        : 'bg-gradient-to-br from-primary-600 to-primary-500'
      : 'border border-border/60 bg-surface dark:border-white/[0.06] overflow-hidden'
  } ${
    isInteractive
      ? highlight
        ? 'cursor-pointer outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60'
        : 'cursor-pointer outline-none hover:border-primary-300 dark:hover:border-primary-500/50 focus-visible:border-primary-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50'
      : ''
  }`;

  const body: ReactNode = (
    <>
      {highlight && decorative && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" aria-hidden="true">
          <span className="absolute -top-9 -right-7 size-28 rounded-full border border-white/10 opacity-70" />
          <span className="absolute top-0 right-12 w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent -skew-x-12" />
        </div>
      )}
      {/* top-2 right-2, fully inside the card (was -top-8 -right-6, deliberately hanging off the
          edge for overflow-hidden to trim into a corner sliver) — in this environment neither
          overflow-hidden nor an explicit clip-path actually clipped the escaping portion, so it
          painted straight through the card's own border instead of staying tucked behind it.
          Keeping the ring's whole box inside the card sidesteps that outright rather than relying
          on a clip that isn't reliably honored here. Hidden on compact tiles below `sm`: at that
          size it wraps the icon and overpowers it (see client/CLAUDE.md, decorative scale). */}
      {!highlight && (
        <span aria-hidden="true" className={`absolute top-2 right-2 size-16 rounded-full border ${ringClass} pointer-events-none ${compact ? 'max-sm:hidden' : ''}`} />
      )}

      <div className={`flex items-start justify-between gap-3 sm:gap-4 relative z-10 ${compact ? 'max-sm:flex-col-reverse max-sm:items-center max-sm:text-center' : ''}`}>
        <div className={`flex flex-col gap-1.5 min-w-0 ${compact ? 'max-sm:items-center' : ''}`}>

          <span className={`flex items-center gap-1.5 ${compact ? 'max-sm:justify-center' : ''}`}>
            <span className={`t-meta font-display font-semibold break-words ${highlight ? 'text-white/80' : 'text-text-muted'}`}>
              {label}
            </span>
            {labelAdornment && (
              // A control inside a clickable card: stop its clicks and keys (and the popover's, which bubble through React) at this span.
              <span
                className="inline-flex shrink-0"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {labelAdornment}
              </span>
            )}
          </span>

          {isLoading ? (
            <Skeleton className={`rounded-md ${compact ? 'h-7 sm:h-9' : 'h-9'} w-16`} />
          ) : (
            <p
              // The "—" placeholder (no data yet) at this size/weight rendered as a solid black bar —
              // technically correct, but it reads like a broken/glitched element rather than an
              // intentional empty state. Muting its color (not its size/weight, so nothing reflows
              // once real data arrives) keeps the placeholder legible as a placeholder.
              className={`font-display ${isNoData ? (compact ? 'text-xl' : 'text-2xl') : compact ? 'text-2xl' : 'text-3xl'} ${isNoData ? 'sm:text-2xl' : 'sm:text-4xl'} font-bold tracking-tight leading-none tabular-nums ${
                isPlaceholder
                  ? highlight ? 'text-white/50' : isNoData ? 'text-text-muted' : 'text-text-light/60'
                  : highlight ? 'text-white' : 'text-text'
              }`}
              title={typeof value === 'number' && Math.abs(value) >= COMPACT_THRESHOLD ? value.toLocaleString() : undefined}
            >
              {typeof value === 'number' && Number.isFinite(value) ? <CountUp value={value} format={formatValue} /> : formatValue(value)}
            </p>
          )}
        </div>

        {Icon && (
          <div
            className={`flex items-center justify-center ${compact ? 'size-7 sm:size-10' : 'size-10'} rounded-xl border transition-colors duration-200 motion-reduce:transition-none shrink-0 ${
              highlight
                ? 'bg-white/15 border-white/20'
                : `${iconBgClass} ${iconBorderClass} ${iconHoverClass}`
            }`}
          >
            <Icon
              size={18}
              className={`${compact ? 'max-sm:size-3.5' : ''} ${highlight ? 'text-white' : (iconTint ?? 'text-text-muted')}`}
              strokeWidth={2.5}
            />
          </div>
        )}
      </div>

      <div className={`flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 relative z-10 ${compact ? 'max-sm:justify-center' : ''}`}>
        {hasTrend && (
          <Badge
            variant={highlight ? 'outline' : TREND_VARIANT[trendMood]}
            className={`text-xs tabular-nums ${highlight ? TREND_STYLE_HIGHLIGHT[trendMood] : TREND_STYLE[trendMood]}`}
          >
            <TrendIcon size={12} strokeWidth={3} aria-hidden="true" />
            {trend.label}
          </Badge>
        )}

        {caption && (
          <span className={`t-meta font-medium ${highlight ? 'text-white/70' : 'text-text-muted'}`}>
            {caption}
          </span>
        )}

        {isLink && (
          <ArrowUpRight
            size={16}
            aria-hidden="true"
            className={`ml-auto shrink-0 opacity-0 transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100 ${highlight ? 'text-white' : 'text-primary-600 dark:text-primary-400'}`}
          />
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link viewTransition to={href} aria-label={`${label}: ${formatValue(value)}. View details`} className={rootClass}>
        {body}
      </Link>
    );
  }

  return (
    <div
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      className={rootClass}
    >
      {body}
    </div>
  );
};
