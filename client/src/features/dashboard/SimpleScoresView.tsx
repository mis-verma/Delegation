import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CircleArrowDown, CircleCheck, ClipboardCheck, ClipboardList, TicketCheck, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RadialGauge } from '../../components/radialGauge/RadialGauge';
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

const MODULES: readonly { key: ModuleKey; icon: LucideIcon; tile: string }[] = [
  { key: 'checklist', icon: ClipboardCheck, tile: 'from-primary-500 to-primary-600' },
  { key: 'ticket', icon: TicketCheck, tile: 'from-success to-success-strong' },
  { key: 'delegation', icon: ClipboardList, tile: 'from-coral-500 to-coral-600' },
];

const TONE_TEXT: Record<RateTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-muted' };
const TONE_BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-border-hover' };
const TONE_WORD: Record<RateTone, string> = { success: 'Good', warning: 'Fair', danger: 'Low', neutral: '' };
const TONE_CHIP: Record<RateTone, string> = { success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger', neutral: '' };
const TONE_ICON: Record<RateTone, LucideIcon | null> = { success: CircleCheck, warning: CircleAlert, danger: CircleArrowDown, neutral: null };
const TONE_COLOR: Record<RateTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-primary-500)',
};

const toneOf = (v: number | null): RateTone => (v === null ? 'neutral' : rateTone(v, Number.MAX_SAFE_INTEGER));

const ToneChip = ({ tone, className }: { tone: RateTone; className?: string }) => {
  const Icon = TONE_ICON[tone];
  if (!Icon) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-meta font-display font-bold', TONE_CHIP[tone], className)}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden="true" />
      {TONE_WORD[tone]}
    </span>
  );
};

const MeasureBar = ({ label, value }: { label: string; value: number | null }) => {
  const tone = toneOf(value);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 t-meta text-text-muted">{label}</span>
        <span className={cn('shrink-0 t-meta font-display font-bold tabular-nums', value === null ? 'text-text-light' : 'text-text')}>{value === null ? '-' : formatPct(value)}</span>
      </div>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
        <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', TONE_BAR[tone])} style={{ width: `${Math.max(value === null ? 0 : 4, Math.min(100, value ?? 0))}%` }} />
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

export const SimpleScoresView = ({
  heading, rangeLabel, period, onPeriodChange, offset, onStep, data, loading, isError, onRetry, isUpdating, emptyText, onOpenModule,
}: SimpleScoresViewProps) => {
  const overall = data ? overallOf(data) : null;
  const overallTone = toneOf(overall);
  const nothingDue = !!data && MODULES.every((m) => !numbersFor(data, m.key).hasData);
  const stepClass = 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-transparent sm:size-8 pointer-coarse:size-11';

  const ranked = data
    ? MODULES.map((m) => ({ key: m.key, score: moduleOverall(data, m.key), has: numbersFor(data, m.key).hasData }))
        .filter((m): m is { key: ModuleKey; score: number; has: boolean } => m.has && m.score !== null)
        .sort((a, b) => b.score - a.score)
    : [];
  const best = ranked.length > 1 ? ranked[0] : null;
  const weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  return (
    <section className={`${DASHBOARD_CARD_CLASS} @container flex min-w-0 flex-col gap-3.5 p-3.5 sm:gap-4 sm:p-4`} aria-label="Scores">
      <header className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true">
            <Trophy className="size-4.5" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-1">
              <h2 className="t-section font-display font-bold leading-tight text-text">{heading}</h2>
              <HowCalculated figure="overall" label="How are my scores calculated" />
            </div>
            <p className="hidden t-meta text-text-muted @md:block">What came due, and how much was done on time</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 @md:flex-row @md:items-center">
          <div className="flex min-w-0 items-center gap-0.5 rounded-xl border border-border/60 bg-surface-hover/40 p-0.5 @md:min-w-52">
            <button type="button" onClick={() => onStep(-1)} aria-label={`Previous ${period}`} className={stepClass}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 text-center t-card font-display font-bold text-text">
              <CalendarDays className="size-4 shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />
              <span className="min-w-0 break-words">{rangeLabel}</span>
            </span>
            <button type="button" onClick={() => onStep(1)} disabled={offset >= 0} aria-label={`Next ${period}`} className={stepClass}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <PeriodTabControl value={period === 'week' ? 'week' : 'month'} options={SIMPLE_PERIODS} labels={PERIOD_LABEL} onChange={onPeriodChange} fill className="@md:w-auto" />
        </div>
      </header>

      {isUpdating && (
        <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for the previous period until {rangeLabel} loads.</p>
      )}

      {isError && !data ? (
        <InlineError message="Couldn't load the scores." onRetry={onRetry} />
      ) : nothingDue ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/30 px-4 py-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-text-light" aria-hidden="true">
            <Trophy className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="t-card font-display font-semibold text-text">{emptyText}</span>
            <span className="t-meta text-text-muted">Scores start once a checklist, ticket or delegation of yours comes due.</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-surface-hover/30 p-3 @lg:gap-5 @lg:p-4">
            <RadialGauge
              percent={overall ?? 0}
              size={96}
              variant="circle"
              gradientFrom={TONE_COLOR[overallTone]}
              gradientTo={TONE_COLOR[overallTone]}
              ariaLabel={`Overall score ${overall === null ? 'not available' : `${formatPct(overall)}, ${TONE_WORD[overallTone]}`}`}
              className="shrink-0"
            >
              {loading ? (
                <Skeleton className="h-6 w-12 rounded-md" />
              ) : (
                <span className={cn('t-stat font-display font-extrabold tabular-nums leading-none', overall === null ? 'text-text-light' : 'text-text')}>{overall === null ? '-' : formatPct(overall)}</span>
              )}
            </RadialGauge>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="t-card font-display font-bold text-text">Overall score</span>
                {overall !== null && <ToneChip tone={overallTone} />}
              </div>
              <p className="t-meta text-text-muted">Completion and accuracy of everything that came due, counted equally.</p>
              {best && weakest && best.key !== weakest.key && (
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 t-meta">
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
                    Best: <strong className="font-display font-bold text-text">{MODULE_LABEL[best.key]}</strong> {formatPct(best.score)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <CircleAlert className="size-3.5 text-warning" aria-hidden="true" />
                    Focus: <strong className="font-display font-bold text-text">{MODULE_LABEL[weakest.key]}</strong> {formatPct(weakest.score)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3 @lg:items-stretch @lg:gap-3">
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
                  aria-label={`${MODULE_LABEL[key]}: ${score === null ? 'nothing due' : `${formatPct(score)}, ${TONE_WORD[tone]}`}. Open the details`}
                  className="group flex w-full min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl border border-border/60 bg-surface p-3 text-left outline-none transition-colors duration-150 hover:border-primary-400/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.99] disabled:cursor-default @lg:p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-white', tile)} aria-hidden="true">
                      <Icon className="size-4" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1 t-card font-display font-bold text-text">{MODULE_LABEL[key]}</span>
                    {loading ? (
                      <Skeleton className="h-6 w-12 rounded-md" />
                    ) : has ? (
                      <span className={cn('shrink-0 t-section font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>{formatPct(score ?? 0)}</span>
                    ) : (
                      <span className="shrink-0 t-meta font-display font-semibold text-text-light">Nothing due</span>
                    )}
                    <ChevronRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {has && n && (
                    <div className="flex flex-col gap-2">
                      <MeasureBar label={SCORE_LABEL.completion} value={n.completion} />
                      <MeasureBar label={complianceLabel(key)} value={n.compliance} />
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
