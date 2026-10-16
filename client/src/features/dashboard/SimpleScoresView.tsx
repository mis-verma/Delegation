import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, TicketCheck, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SemiGauge } from '../../components/semiGauge/SemiGauge';
import { InlineError } from '../../components/inlineError';
import { Skeleton } from '../../components/skeleton';
import { HowCalculated } from '../scores/HowCalculated';
import type { Scores } from '../../api/scores';
import { formatPct } from '../../lib/percent';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../lib/scoreLabels';
import { PeriodTabControl } from './PeriodTabControl';
import { PERIOD_LABEL, type ScorePeriod } from './scorePeriods';
import { moduleOverall, numbersFor, overallOf, type ModuleKey } from './scoreMetrics';
import { DASHBOARD_CARD_CLASS, rateTone, type RateTone } from './dashboardDisplay';

const SIMPLE_PERIODS: readonly ScorePeriod[] = ['week', 'month'];

// The same colour per module as the dashboard's module cards above (Checklist blue, Tickets green, Delegation violet).
const MODULES: readonly { key: ModuleKey; icon: LucideIcon; tile: string }[] = [
  { key: 'checklist', icon: ClipboardCheck, tile: 'from-primary-500 to-primary-600' },
  { key: 'ticket', icon: TicketCheck, tile: 'from-success to-success-strong' },
  { key: 'delegation', icon: ClipboardList, tile: 'from-coral-500 to-coral-600' },
];

const TONE_TEXT: Record<RateTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-muted' };
const TONE_BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-border-hover' };
const TONE_WORD: Record<RateTone, string> = { success: 'Good', warning: 'Fair', danger: 'Low', neutral: '' };
const TONE_CHIP: Record<RateTone, string> = { success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger', neutral: '' };
const RING: Record<RateTone, [string, string]> = {
  success: ['var(--color-success)', 'var(--color-success)'],
  warning: ['var(--color-warning)', 'var(--color-warning)'],
  danger: ['var(--color-danger)', 'var(--color-danger)'],
  neutral: ['var(--color-primary-400)', 'var(--color-primary-700)'],
};

const toneOf = (v: number | null): RateTone => (v === null ? 'neutral' : rateTone(v, Number.MAX_SAFE_INTEGER));

/** One measure as a word, its number and a thin bar in its own colour. */
const MiniBar = ({ label, value }: { label: string; value: number | null }) => {
  const tone = toneOf(value);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate t-meta text-text-muted">{label}</span>
        <span className={cn('shrink-0 t-meta font-display font-semibold tabular-nums', value === null ? 'text-text-light' : 'text-text')}>{value === null ? '-' : formatPct(value)}</span>
      </div>
      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
        <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', TONE_BAR[tone])} style={{ width: `${value ?? 0}%` }} />
      </span>
    </div>
  );
};

interface SimpleScoresViewProps {
  heading: string;
  rangeLabel: string;
  period: ScorePeriod;
  onPeriodChange: (next: ScorePeriod) => void;
  offset: number;
  onStep: (delta: -1 | 1) => void;
  data: Scores | undefined;
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  isUpdating: boolean;
  emptyText: string;
  onOpenModule: (key: ModuleKey) => void;
}

/**
 * The front-line person's own scores, as a glance: one Overall dial, then a card per module (Checklists, Tickets,
 * Delegations) with its score and the two measures behind it as thin bars. A card opens what was done and what was
 * late. Week or Month, stepped back a period at a time.
 */
export const SimpleScoresView = ({
  heading, rangeLabel, period, onPeriodChange, offset, onStep, data, loading, isError, onRetry, isUpdating, emptyText, onOpenModule,
}: SimpleScoresViewProps) => {
  const overall = data ? overallOf(data) : null;
  const overallTone = toneOf(overall);
  const [from, to] = RING[overallTone];
  const nothingDue = !!data && MODULES.every((m) => !numbersFor(data, m.key).hasData);
  const stepClass = 'inline-flex size-8 pointer-coarse:size-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <section className={`${DASHBOARD_CARD_CLASS} flex min-w-0 flex-col gap-4 p-4`} aria-label="Scores">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true">
            <Trophy className="size-4.5" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1">
              <h2 className="t-card font-display font-bold text-text truncate">{heading}</h2>
              <HowCalculated figure="overall" label="How are my scores calculated" />
            </div>
            <p className="t-meta text-text-muted">What came due, and how much was done on time</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-border/60 bg-surface-hover/40 p-0.5 sm:flex-none">
            <button type="button" onClick={() => onStep(-1)} aria-label={`Previous ${period}`} className={stepClass}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 t-meta font-display font-semibold text-text sm:min-w-28">
              <CalendarDays className="size-3.5 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              <span className="truncate">{rangeLabel}</span>
            </span>
            <button type="button" onClick={() => onStep(1)} disabled={offset >= 0} aria-label={`Next ${period}`} className={stepClass}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <PeriodTabControl value={period === 'week' ? 'week' : 'month'} options={SIMPLE_PERIODS} labels={PERIOD_LABEL} onChange={onPeriodChange} />
        </div>
      </header>

      {isUpdating && (
        <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {rangeLabel} loads.</p>
      )}

      {isError && !data ? (
        <InlineError message="Couldn't load the scores." onRetry={onRetry} />
      ) : nothingDue ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-hover bg-surface-hover/30 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-text-light" aria-hidden="true">
            <Trophy className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="t-meta font-display font-semibold text-text">{emptyText}</span>
            <span className="t-meta text-text-muted">Scores start once a checklist, ticket or delegation of yours comes due.</span>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 @container sm:grid-cols-[11rem_minmax(0,1fr)]">
          {/* Overall: the one number to remember. */}
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/30 p-3 sm:flex-col sm:justify-center sm:text-center">
            <SemiGauge percent={overall ?? 0} showFill={overall !== null} gradientFrom={from} gradientTo={to} endLabels={false} className="w-24 shrink-0 sm:w-28" />
            <div className="flex min-w-0 flex-col gap-0.5 sm:items-center">
              <span className="t-meta text-text-muted">Overall score</span>
              {loading ? (
                <Skeleton className="h-7 w-16 rounded-md" />
              ) : (
                <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', overall === null ? 'text-text-light' : 'text-text')}>{overall === null ? '-' : formatPct(overall)}</span>
              )}
              {overall !== null && TONE_WORD[overallTone] && (
                <span className={cn('self-start rounded-full px-2 py-px t-meta font-semibold sm:self-center', TONE_CHIP[overallTone])}>{TONE_WORD[overallTone]}</span>
              )}
            </div>
          </div>

          {/* A card per module. */}
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            {MODULES.map(({ key, icon: Icon, tile }) => {
              const n = data ? numbersFor(data, key) : null;
              const score = data ? moduleOverall(data, key) : null;
              const tone = toneOf(score);
              const has = !!n?.hasData;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onOpenModule(key)}
                  disabled={!data}
                  aria-label={`${MODULE_LABEL[key]}: ${score === null ? 'nothing due' : formatPct(score)}. Open the details`}
                  className="group flex min-w-0 cursor-pointer flex-col gap-2.5 self-start min-[420px]:self-stretch w-full rounded-xl border border-border/60 bg-surface p-3 text-left outline-none transition-colors duration-150 hover:border-primary-400/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-white', tile)} aria-hidden="true">
                      <Icon className="size-3.5" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1 truncate t-meta font-display font-semibold text-text-secondary">{MODULE_LABEL[key]}</span>
                    {!loading && !has && <span className="shrink-0 t-meta font-display font-semibold text-text-light">Nothing due</span>}
                    <ChevronRight className="size-3.5 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {loading ? (
                    <Skeleton className="h-6 w-14 rounded-md" />
                  ) : has ? (
                    <span className={cn('t-section font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>{formatPct(score ?? 0)}</span>
                  ) : null}
                  {has && n && (
                    <div className="flex flex-col gap-1.5">
                      <MiniBar label={SCORE_LABEL.completion} value={n.completion} />
                      <MiniBar label={complianceLabel(key)} value={n.compliance} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
