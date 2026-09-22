import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Badge, type badgeVariants } from '../../components/ui/badge';
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
  highlight?: boolean;
  decorative?: boolean;
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
  highlight = false,
  decorative = false,
  lowerIsBetter = false,
}: StatCardProps) => {
  const isInteractive = Boolean(onClick);


  const hasTrend = trend != null && trend.label !== '—';
  const isFlat = hasTrend && Number.parseFloat(trend.label) === 0;
  const trendMood: TrendMood = !hasTrend || isFlat ? 'flat' : trend.direction === 'up' !== lowerIsBetter ? 'good' : 'bad';
  const TrendIcon = isFlat ? Minus : trend?.direction === 'up' ? ArrowUpRight : ArrowDownRight;

  const derivedTintKey = iconTint && Object.keys(TINT_TO_ICON_BG).find((key) => iconTint.includes(key));
  const iconBgClass = iconBgTint ?? (derivedTintKey ? TINT_TO_ICON_BG[derivedTintKey].bg : 'bg-surface-hover/80');
  const iconBorderClass = !iconBgTint && derivedTintKey ? TINT_TO_ICON_BG[derivedTintKey].border : 'border-border/40';
  const ringClass = derivedTintKey ? TINT_TO_RING[derivedTintKey] : 'border-border/50';
  const iconHoverClass = isInteractive ? (derivedTintKey || iconBgTint ? 'group-hover:brightness-110' : 'group-hover:border-border/60 group-hover:bg-surface-hover') : '';

  return (
    <div
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      className={`group relative isolate flex flex-col gap-3 rounded-2xl p-5 sm:p-6 transition-all duration-300 [clip-path:inset(0_round_1rem)] ${
        highlight
          ? decorative
            ? 'bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 shadow-md shadow-primary-900/30 overflow-hidden'
            : 'bg-gradient-to-br from-primary-600 to-primary-500 shadow-md shadow-primary-600/25'
          : 'border border-border/60 bg-surface dark:border-white/[0.06] overflow-hidden'
      } ${
        isInteractive
          ? highlight
            ? 'cursor-pointer outline-none hover:shadow-lg hover:-translate-y-1 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600'
           
            : 'cursor-pointer outline-none hover:border-border-hover hover:-translate-y-1 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-primary-500/50'
          : ''
      }`}
    >
      
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
          on a clip that isn't reliably honored here. */}
      {!highlight && (
        <span aria-hidden="true" className={`absolute top-2 right-2 size-16 rounded-full border ${ringClass} pointer-events-none`} />
      )}

      <div className="flex items-start justify-between gap-4 relative z-10">
        <div className="flex flex-col gap-1.5 min-w-0">
          
          <span className={`text-xs font-display font-semibold tracking-wide break-words ${highlight ? 'text-white/80' : 'text-text-muted'}`}>
            {label}
          </span>
          
          <p
            className={`font-display text-3xl sm:text-4xl font-bold tracking-tight leading-none tabular-nums ${highlight ? 'text-white' : 'text-text'}`}
            title={typeof value === 'number' && Math.abs(value) >= COMPACT_THRESHOLD ? value.toLocaleString() : undefined}
          >
            {formatValue(value)}
          </p>
        </div>

        {Icon && (
          <div
            className={`flex items-center justify-center size-10 rounded-xl border transition-all duration-300 shrink-0 ${
              highlight
                ? 'bg-white/15 border-white/20'
                : `${iconBgClass} ${iconBorderClass} ${iconHoverClass}`
            }`}
          >
            <Icon 
              size={18} 
              className={`transition-transform duration-300 ${isInteractive ? 'group-hover:scale-110' : ''} ${highlight ? 'text-white' : (iconTint ?? 'text-text-muted')}`} 
              strokeWidth={2.5} 
            />
          </div>
        )}
      </div>

      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 relative z-10">
        {hasTrend && (
          <Badge
            variant={highlight ? 'outline' : TREND_VARIANT[trendMood]}
            className={`text-[11px] tabular-nums ${highlight ? TREND_STYLE_HIGHLIGHT[trendMood] : TREND_STYLE[trendMood]}`}
          >
            <TrendIcon size={12} strokeWidth={3} />
            {trend.label}
          </Badge>
        )}

        {caption && (
          <span className={`text-[12px] font-medium ${highlight ? 'text-white/70' : 'text-text-muted/80'}`}>
            {caption}
          </span>
        )}
      </div>
    </div>
  );
};