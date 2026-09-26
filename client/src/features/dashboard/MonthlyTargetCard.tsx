import { ArrowDown, ArrowUp, Minus, Target } from 'lucide-react';
import { RadialGauge } from '../../components/radialGauge';
import { EntityIconTile } from '../../components';
import { Badge } from '../../components/ui/badge';
import { useIsMobile } from '../../lib/useMediaQuery';
import { PeriodTabControl } from './PeriodTabControl';
import { PERIOD_LABEL, COMPLIANCE_PERIOD_OPTIONS, PERIOD_TAB_LABEL, DASHBOARD_CARD_CLASS, rateTone, type CompliancePeriod, type RateTone, type Trend } from './dashboardDisplay';

export interface FooterStat {
  label: string;
  value: string;
  /**
   * Which way the number itself actually moved against the previous period. This used to double as
   * the sentiment, which broke on "Pending": fewer pending items is good, so it was passed
   * `direction: 'up'` when the count had gone *down* — a green upward arrow beside a number that
   * had visibly dropped.
   */
  direction: 'up' | 'down' | 'flat';
  /** Whether that movement is good news for this particular metric. Drives colour only. */
  sentiment: 'good' | 'bad' | 'neutral';
}

interface MonthlyTargetCardProps {
  percent: number;
  /** How many delegations the percent was computed from — feeds `rateTone` so a handful of items
   *  doesn't paint a false-confidence red/green (see RATE_VOLUME_FLOOR in dashboardDisplay.ts). */
  total: number;
  change: Trend;
  description: string;
  stats: [FooterStat, FooterStat, FooterStat];
  period: CompliancePeriod;
  onPeriodChange: (period: CompliancePeriod) => void;
}

const STAT_SENTIMENT: Record<FooterStat['sentiment'], string> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-text-muted',
};

// The headline number now carries real performance meaning (weak/on-track/strong), same three-tier
// language `rateTone` already drives on the Compliance gauges — `neutral` (not enough volume yet to
// mean anything, or genuinely no data) keeps the original solid `text-text`, it doesn't get its own
// muted treatment, since that's still the one number on this card that has to read at a glance.
const TONE_TEXT: Record<RateTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text',
};

// A soft tone-tinted halo glowing behind the ring — the ring's own stroke deliberately stays brand
// navy (matching the Compliance gauges' own "fill is always navy, tone only touches accents"
// decision, so the chart palette doesn't disagree card to card), but this card's whole point is a
// performance score, so the score's tone still needs to be visible at a glance, not just legible
// once you read the number. The halo is that signal without repainting the ring itself.
const TONE_HALO: Record<RateTone, string> = {
  success: 'bg-success/25',
  warning: 'bg-warning/25',
  danger: 'bg-danger/25',
  neutral: 'bg-primary-500/20',
};

export const MonthlyTargetCard = ({ percent, total, change, description, stats, period, onPeriodChange }: MonthlyTargetCardProps) => {
  // 220px on desktop; 180 on phones, where the gauge is the card's only content.
  const isMobile = useIsMobile();
  const gaugeSize = isMobile ? 180 : 220;
  const tone = rateTone(percent, total);

  // pointDelta always signs its label ("+0.0%"), so an unchanged score has to be detected
  // numerically — it was previously rendering as a green upward arrow, i.e. claiming an
  // improvement that hadn't happened. Same fix already applied to the Compliance gauges.
  const isFlatChange = Number.parseFloat(change.label) === 0;
  const ChangeIcon = isFlatChange ? Minus : change.direction === 'up' ? ArrowUp : ArrowDown;
  const changeVariant = isFlatChange ? 'neutral' : change.direction === 'up' ? 'success' : 'destructive';
  // Badge is transparent-at-rest by design (a hover affordance for a clickable pill); this pill is
  // a static readout, not a control, so it keeps its own permanent tint layered on top via className.
  const changeClassName = isFlatChange
    ? 'bg-surface-hover'
    : change.direction === 'up'
      ? 'bg-success/10'
      : 'bg-danger/10';

  return (
    // `@container` + `@lg:`/`@sm:` below size this card's internal layout off its own rendered
    // width, not the viewport — it now shares a row with CompareDashboard in a 2-column grid, so a
    // viewport breakpoint would flip to the wide side-by-side layout on any laptop-width screen
    // even though the actual column is only half that wide.
    // `hover:border-primary-500/40` matches every other card on the page — `primary-300` was a
    // one-off with no dark-mode variant, so in dark mode this card's hover barely registered.
    // `gap-6` replaces the body block's own `mt-6`, so the card owns its spacing in one place.
    <section aria-labelledby="delegation-score-heading" className={`@container relative group ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 flex flex-col gap-4 sm:gap-6 hover:border-primary-500/40 transition-all duration-300 overflow-hidden`}>

      {/* Decorative Background Glow - Adjusted for Light/Dark modes */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/15 dark:bg-primary-500/10 rounded-full blur-[60px] pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-60" />

      {/* Header */}
      {/* Title and period tabs share a row only once the card is wide enough (@xl); in the
          half-width slot the tabs sit under the title instead of squeezing its subtitle. */}
      <div className="relative flex flex-col @xl:flex-row @xl:items-start justify-between gap-3 @xl:gap-4 z-10">
        <div className="flex gap-2.5 sm:gap-3 items-center min-w-0">
          <EntityIconTile icon={Target} />
          <div>
            {/* Was "Target" / "Checklist completion" — but `percent` here is a weighted delegation
                score (see HomePage's weightedScorePercent), not checklist data at all. Naming it
                accurately also keeps it from reading as the same number as the Compliance gauges
                or Compare Dashboard's own "Completion", which are scoped differently. */}
            <h2 id="delegation-score-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Delegation Score</h2>
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5 tracking-wide">Weighted completion, {PERIOD_LABEL[period]}</p>
          </div>
        </div>

        <div className="hidden sm:block">
          <PeriodTabControl
            value={period}
            options={COMPLIANCE_PERIOD_OPTIONS}
            labels={PERIOD_TAB_LABEL}
            onChange={onPeriodChange}
            className="w-auto"
          />
        </div>

      </div>

      {/* Body: gauge + description in one row on desktop, stats grid on its own full-width row
          below so each tile gets the card's whole width. Phones show the gauge alone. */}
      <div className="relative z-10 flex flex-col gap-5">
        {/* Phones: just the gauge, centered — the score and its trend badge are the whole point
            of this card at a glance; Target/Resolved/Pending and the sentence stay on desktop. */}
        <div className="flex items-center justify-center sm:justify-start gap-4 @lg:gap-6">
          {/* Gauge — the halo behind it is the tone signal (see TONE_HALO's comment); the ring
              stroke itself stays brand navy. */}
          <div className="relative shrink-0">
            <div
              aria-hidden="true"
              className={`absolute inset-8 rounded-full blur-2xl transition-colors duration-500 ${TONE_HALO[tone]}`}
            />
            {/* Broad arc (thickness 11) in a navy gradient, with tick marks and a knob at the reading
                point: reads as a real score dial rather than a thin outline. */}
            <RadialGauge
              percent={percent}
              size={gaugeSize}
              thickness={11}
              ticks={24}
              showKnob
              gradientFrom="var(--color-primary-400)"
              gradientTo="var(--color-primary-800)"
              className="relative"
            >
              {/* Tone-colored, not a flat `text-text` — the headline number now reads as weak/
                  on-track/strong at a glance, the same three-tier language the Compliance gauges'
                  accents already use, instead of only the small trend badge below it carrying color. */}
              <span className={`text-4xl sm:text-5xl font-display font-bold tracking-tight tabular-nums transition-colors duration-500 ${TONE_TEXT[tone]}`}>
                {percent}<span className="text-2xl sm:text-3xl">%</span>
              </span>
              <Badge variant={changeVariant} className={`text-[11px] ${changeClassName}`}>
                <ChangeIcon size={12} strokeWidth={3} />
                {change.label}
              </Badge>
            </RadialGauge>
          </div>

          <p className="hidden sm:block flex-1 min-w-0 text-sm font-medium text-text-muted leading-relaxed">
            {description}
          </p>
        </div>

        {/* Phones: a compact period switch centered under the gauge — beside the title it pushed
            "Delegation Score" underneath itself on a 360px screen. */}
        <div role="radiogroup" aria-label="Period" className="sm:hidden self-center flex items-center gap-0.5 p-0.5 rounded-lg border border-border/60 bg-surface-hover/50">
          {COMPLIANCE_PERIOD_OPTIONS.map((option) => {
            const active = option === period;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPeriodChange(option)}
                className={`flex items-center justify-center h-8 px-3 rounded-md text-xs font-display font-semibold transition-colors duration-150 cursor-pointer ${
                  active ? 'bg-surface text-primary-700 dark:text-primary-300 border border-border/60' : 'text-text-muted active:bg-surface'
                }`}
              >
                {option === 'day' ? 'Today' : PERIOD_TAB_LABEL[option]}
              </button>
            );
          })}
        </div>

        {/* Phones get the same three numbers as a compact 3-up row under the period switch. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {stats.map(stat => {
            // Arrow = which way the number moved; colour = whether that's good. Separating the
            // two is what lets "Pending: 3 ↓" be green.
            const TrendIcon = stat.direction === 'flat' ? Minus : stat.direction === 'up' ? ArrowUp : ArrowDown;
            const trendClassName = STAT_SENTIMENT[stat.sentiment];

            return (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:p-4 rounded-xl bg-surface-hover/30 border border-border/40 hover:bg-surface-hover/70 hover:border-border/80 transition-all duration-200"
              >
                <span className="text-[11px] sm:text-xs font-medium text-text-muted capitalize tracking-wide">{stat.label}</span>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 text-lg sm:text-xl font-display font-bold text-text tabular-nums">
                  {stat.value}
                  <TrendIcon size={14} strokeWidth={3} className={trendClassName} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};