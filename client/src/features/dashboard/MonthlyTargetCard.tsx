import { memo, useState } from 'react';
import { ArrowDown, ArrowUp, Info, Minus, Target } from 'lucide-react';
import { SemiGauge } from '../../components/semiGauge';
import { EntityIconTile } from '../../components';
import { Badge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { PeriodTabControl } from './PeriodTabControl';
import {
  PERIOD_LABEL,
  COMPLIANCE_PERIOD_OPTIONS,
  PERIOD_TAB_LABEL,
  DASHBOARD_CARD_CLASS,
  formatDelta,
  rateTone,
  type CompliancePeriod,
  type RateTone,
} from './dashboardDisplay';

export type ScoreStatKey = 'target' | 'resolved' | 'pending';

export interface FooterStat {
  key: ScoreStatKey;
  label: string;
  value: string;
  /** Small line under the number, e.g. "2 overdue". */
  hint?: string;
  /**
   * Which way the number itself actually moved against the previous period. This used to double as
   * the sentiment, which broke on "Pending": fewer pending items is good, so it was passed
   * `direction: 'up'` when the count had gone *down*, a green upward arrow beside a number that
   * had visibly dropped.
   */
  direction: 'up' | 'down' | 'flat';
  /** Whether that movement is good news for this particular metric. Drives colour only. */
  sentiment: 'good' | 'bad' | 'neutral';
}

interface MonthlyTargetCardProps {
  /** Null when there are no delegations in the window: the card says "No data", never "0%". */
  percent: number | null;
  /** How many delegations the percent was computed from. Feeds `rateTone` so a handful of items
   *  doesn't paint a false-confidence red/green (see RATE_VOLUME_FLOOR in dashboardDisplay.ts). */
  total: number;
  /** Points moved against the previous period; null when there is nothing to compare against. */
  delta: number | null;
  /** 'Your delegation score': the score counts only delegations assigned to the viewer. */
  title: string;
  description: string;
  stats: [FooterStat, FooterStat, FooterStat];
  /** The records behind each tile, shown in a preview modal when the tile is tapped. */
  drilldowns: Record<ScoreStatKey, DrilldownRow[]>;
  period: CompliancePeriod;
  onPeriodChange: (period: CompliancePeriod) => void;
  /** Admin and PC only: whose delegations the score covers. Leave out to hide the switch. */
  scope?: 'mine' | 'team';
  onScopeChange?: (scope: 'mine' | 'team') => void;
  isPending?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

const STAT_SENTIMENT: Record<FooterStat['sentiment'], string> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-text-muted',
};

const STAT_DRILLDOWN_TITLE: Record<ScoreStatKey, string> = {
  target: 'Delegations in this period',
  resolved: 'Resolved delegations',
  pending: 'Pending delegations',
};

// The headline number carries real performance meaning (weak/on-track/strong), the same three-tier
// language `rateTone` drives on the Compliance gauges. `neutral` (not enough volume yet to mean
// anything, or genuinely no data) keeps the solid `text-text`.
const TONE_TEXT: Record<RateTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text',
};

export const MonthlyTargetCard = memo(({
  percent,
  total,
  delta,
  title,
  description,
  stats,
  drilldowns,
  period,
  onPeriodChange,
  scope,
  onScopeChange,
  isPending = false,
  isError = false,
  onRetry,
}: MonthlyTargetCardProps) => {
  const [openStat, setOpenStat] = useState<ScoreStatKey | null>(null);

  const hasData = percent != null;
  const tone = hasData ? rateTone(percent, total) : 'neutral';

  // formatDelta rounds to whole points, so "flat" is decided on the rounded value: a 0.4 point
  // wobble reads "0 pts", not a green arrow claiming an improvement that did not happen.
  const rounded = delta == null ? null : Math.round(delta);
  const isFlatChange = rounded === 0;
  const ChangeIcon = isFlatChange ? Minus : (rounded ?? 0) > 0 ? ArrowUp : ArrowDown;
  const changeVariant = isFlatChange ? 'neutral' : (rounded ?? 0) > 0 ? 'success' : 'destructive';
  // Badge is transparent-at-rest by design (a hover affordance for a clickable pill); this pill is
  // a static readout, not a control, so it keeps its own permanent tint layered on top.
  const changeClassName = isFlatChange ? 'bg-surface-hover' : (rounded ?? 0) > 0 ? 'bg-success/10' : 'bg-danger/10';

  const periodTabs = (
    <PeriodTabControl value={period} options={COMPLIANCE_PERIOD_OPTIONS} labels={PERIOD_TAB_LABEL} onChange={onPeriodChange} className="w-auto" />
  );
  // Mine / Team switch for Admin and PC, next to the period tabs.
  const periodControl = scope && onScopeChange ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <div role="group" aria-label="Whose delegations" className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover/50 p-1">
        {(['mine', 'team'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => onScopeChange(value)}
            className={`h-8 pointer-coarse:h-11 px-3 rounded-full text-xs font-display font-semibold outline-none cursor-pointer transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
              scope === value ? 'bg-primary-700 text-white dark:bg-primary-600' : 'text-text-muted hover:text-text'
            }`}
          >
            {value === 'mine' ? 'Mine' : 'Team'}
          </button>
        ))}
      </div>
      {periodTabs}
    </div>
  ) : periodTabs;

  return (
    // `@container` + `@lg:`/`@xl:` below size this card's internal layout off its own rendered
    // width, not the viewport: it shares a row with other cards in a 2-column grid, so a viewport
    // breakpoint would flip to the wide side-by-side layout on any laptop-width screen even though
    // the actual column is only half that wide.
    <section
      aria-labelledby="delegation-score-heading"
      className={`@container relative ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 flex flex-col gap-4 sm:gap-6 hover:border-primary-500/40 transition-colors duration-200 overflow-hidden`}
    >
      <div className="relative flex flex-col @xl:flex-row @xl:items-start justify-between gap-3 @xl:gap-4">
        <div className="flex gap-2.5 sm:gap-3 items-center min-w-0">
          <EntityIconTile icon={Target} />
          <div>
            <div className="flex items-center gap-1">
              <h2 id="delegation-score-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">{title}</h2>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="How the delegation score is worked out"
                    className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-full text-text-muted hover:text-text hover:bg-surface-hover outline-none cursor-pointer transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <Info size={14} aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 text-xs font-display text-text-secondary leading-relaxed">
                  <p className="font-semibold text-text mb-1.5">How the score works</p>
                  Each delegation earns points by its stage: To do 0%, In progress 25%, Pending approval 75%, Done 100%. The score is the average across the delegations in this period. Overdue ones are counted on the Still open tile.
                </PopoverContent>
              </Popover>
            </div>
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5 tracking-wide">Weighted completion, {PERIOD_LABEL[period]}</p>
          </div>
        </div>

        <div className="hidden sm:block">{periodControl}</div>
      </div>

      {isError ? (
        <InlineError message="Couldn't load your delegations." onRetry={onRetry} />
      ) : isPending ? (
        <div className="flex flex-col gap-5" role="status" aria-label="Loading delegation score">
          <Skeleton className="w-full max-w-lg mx-auto aspect-[2/1] rounded-t-full rounded-b-none" />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 sm:h-[5.5rem] rounded-xl" />)}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col gap-5">
          {/* A half-circle dial that takes the card's width (capped so it never gets taller than
              it is useful), with the score and its trend inside the arc and the sentence under it. */}
          <div className="flex flex-col items-center gap-3">
            <SemiGauge
              percent={percent ?? 0}
              showFill={hasData}
              className="max-w-lg"
              ariaLabel={hasData ? `${title}: ${percent}%${delta != null ? `, ${formatDelta(delta)} against the previous period` : ''}` : `${title}: no data for this period`}
            >
              {hasData ? (
                <span className={`text-4xl sm:text-5xl font-display font-bold tracking-tight tabular-nums leading-none ${TONE_TEXT[tone]}`}>
                  {percent}<span className="text-2xl sm:text-3xl">%</span>
                </span>
              ) : (
                <span className="text-xl sm:text-2xl font-display font-bold tracking-tight text-text-muted leading-none">No data</span>
              )}
              {delta != null && (
                <Badge variant={changeVariant} className={`text-xs ${changeClassName}`}>
                  <ChangeIcon size={12} strokeWidth={3} />
                  {formatDelta(delta)}
                </Badge>
              )}
            </SemiGauge>

            <p className="hidden sm:block text-center max-w-md text-sm font-medium text-text-muted leading-relaxed">{description}</p>
          </div>

          {/* Phones: the period switch sits centered under the gauge; beside the title it pushed
              the title underneath itself on a 360px screen. */}
          <div className="sm:hidden self-center">{periodControl}</div>

          {/* Each tile opens the records behind it. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((stat) => {
              // Arrow = which way the number moved; colour = whether that's good. Separating the
              // two is what lets "Pending: 3 down" be green.
              const TrendIcon = stat.direction === 'up' ? ArrowUp : ArrowDown;
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => setOpenStat(stat.key)}
                  className="flex flex-col items-center justify-center gap-1 sm:gap-1.5 min-h-16 px-2 py-2.5 sm:p-4 rounded-xl bg-surface-hover/30 border border-border/40 cursor-pointer transition-colors duration-200 hover:bg-surface-hover/70 hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <span className="text-xs sm:text-xs font-medium text-text-muted capitalize tracking-wide">{stat.label}</span>
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 text-lg sm:text-xl font-display font-bold text-text tabular-nums">
                    {stat.value}
                    {stat.direction !== 'flat' && <TrendIcon size={14} strokeWidth={3} className={STAT_SENTIMENT[stat.sentiment]} />}
                  </span>
                  {stat.hint && <span className="text-xs font-display font-semibold text-danger leading-none">{stat.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {openStat && (
        <DrilldownModal
          open
          onClose={() => setOpenStat(null)}
          title={STAT_DRILLDOWN_TITLE[openStat]}
          description={`Your delegations created ${PERIOD_LABEL[period]}`}
          icon={Target}
          rows={drilldowns[openStat]}
          viewAllHref="/tasks"
          viewAllLabel="View all in Delegations"
        />
      )}
    </section>
  );
});

MonthlyTargetCard.displayName = 'MonthlyTargetCard';
