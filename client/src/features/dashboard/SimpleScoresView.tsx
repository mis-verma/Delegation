import type { CSSProperties, ReactNode } from 'react';
import { CARD_TOP_BAR } from './cardAccent';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, TicketCheck, Trophy, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { cn } from '@/lib/utils';
import { InlineError } from '../../components/inlineError';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';
import { HowCalculated } from '../scores/HowCalculated';
import type { Scores } from '../../api/scores';
import { formatPct, roundPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { ScoreChoice } from './ScoreChoice';
import { PERIOD_LABEL, type ScorePeriod } from './scorePeriods';
import { moduleCounts, moduleOverall, numbersFor, type ModuleKey } from './scoreMetrics';
import { DASHBOARD_CARD_CLASS } from './dashboardDisplay';
import { ScoreHero } from './ScoreHero';
import { heroFacts } from './heroFacts';
import { ToneChip } from './ToneChip';
import { TONE_TEXT, TONE_WORD, toneOf } from './scoreTone';

const SIMPLE_PERIODS: readonly ScorePeriod[] = ['week', 'month'];

const MODULES: readonly { key: ModuleKey; icon: LucideIcon; tile: string }[] = [
  { key: 'checklist', icon: ClipboardCheck, tile: 'from-primary-500 to-primary-600' },
  { key: 'ticket', icon: TicketCheck, tile: 'from-success to-success-strong' },
  { key: 'delegation', icon: ClipboardList, tile: 'from-coral-500 to-coral-600' },
];

const COUNT_WORD: Record<ModuleKey, string> = { checklist: 'not filled', ticket: 'still open', delegation: 'past due' };

const FIX_TEXT: Record<ModuleKey, (n: number) => string> = {
  checklist: (n) => `${n} ${n === 1 ? 'checklist' : 'checklists'} not filled`,
  ticket: (n) => `${n} ${n === 1 ? 'ticket' : 'tickets'} still open`,
  delegation: (n) => `${n} ${n === 1 ? 'delegation' : 'delegations'} past due`,
};

const FixLine = ({ data, onOpen }: { data: Scores; onOpen: (key: ModuleKey) => void }) => {
  const items = MODULES.map(({ key }) => ({ key, count: moduleCounts(data, key).notDone })).filter((i) => i.count > 0);
  if (items.length === 0) {
    return <IconChip className="w-fit" icon={CheckCircle2} tone="bg-success" label="Everything that came due is done" labelClassName="text-success" />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="t-card font-display font-bold text-text">To fix</span>
      {items.map(({ key, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onOpen(key)}
          className="inline-flex min-h-9 cursor-pointer items-center rounded-full outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-danger/40 active:scale-[0.98] pointer-coarse:min-h-11"
        >
          <IconChip icon={MODULES.find((m) => m.key === key)?.icon} tone="bg-danger" label={FIX_TEXT[key](count)} labelClassName="tabular-nums text-danger" className="border-danger/30 bg-danger/10" />
        </button>
      ))}
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
  previous?: Scores | undefined;
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  isUpdating: boolean;
  emptyText: string;
  onOpenModule: (key: ModuleKey) => void;
  dayStrip?: ReactNode;
}

export const SimpleScoresView = ({
  heading, rangeLabel, period, onPeriodChange, offset, onStep, data, previous, loading, isError, onRetry, isUpdating, emptyText, onOpenModule, dayStrip,
}: SimpleScoresViewProps) => {
  const facts = heroFacts(data);
  const before = heroFacts(previous).overall;
  const changePts = facts.overall !== null && before !== null ? facts.overall - before : null;
  const nothingDue = !!data && MODULES.every((m) => !numbersFor(data, m.key).hasData);
  const stepClass = 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:hover:bg-transparent sm:size-8 pointer-coarse:size-11';

  return (
    <section className={`${DASHBOARD_CARD_CLASS} ${CARD_TOP_BAR.violet} @container flex min-w-0 flex-col gap-3.5 p-3.5 sm:gap-4 sm:p-4`} aria-label="Scores">
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
          <ScoreChoice label="Period" value={period === 'week' ? 'week' : 'month'} options={SIMPLE_PERIODS} labels={PERIOD_LABEL} onChange={onPeriodChange} />
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
          <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)] @3xl:items-start @3xl:gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            <ScoreHero facts={facts} loading={loading} changePts={changePts} />
            {data && <FixLine data={data} onOpen={onOpenModule} />}
          </div>

          <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3 @lg:items-stretch @lg:gap-3 @3xl:grid-cols-1">
            {MODULES.map(({ key, icon: Icon, tile }, index) => {
              const n = data ? numbersFor(data, key) : null;
              const score = data ? moduleOverall(data, key) : null;
              const tone = toneOf(score);
              const has = !!n?.hasData;
              const rounded = roundPct(score);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onOpenModule(key)}
                  disabled={!data}
                  style={{ '--stat-delay': `${120 + index * 70}ms` } as CSSProperties}
                  aria-label={`${MODULE_LABEL[key]}: ${score === null ? 'nothing due' : `${formatPct(score)}, ${TONE_WORD[tone]}`}. Open the details`}
                  className="stat-rise group flex h-full w-full min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl border border-border/60 bg-surface p-3 text-left outline-none transition-colors duration-150 hover:border-primary-400/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.99] disabled:cursor-default @lg:p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white', tile)} aria-hidden="true">
                      <Icon className="size-[1.125rem]" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="t-card font-display font-bold text-text">{MODULE_LABEL[key]}</span>
                      {has && <ToneChip tone={tone} className="self-start" />}
                    </span>
                    {loading ? (
                      <Skeleton className="h-6 w-12 rounded-md" />
                    ) : has && rounded !== null ? (
                      <span className={cn('shrink-0 t-section font-display font-extrabold tabular-nums leading-none', TONE_TEXT[tone])}>
                        <CountUp value={rounded} decimals={1} fromZero format={(v) => `${v}%`} />
                      </span>
                    ) : (
                      <span className="shrink-0 t-meta font-display font-semibold text-text-light">No score</span>
                    )}
                    <ChevronRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {has && data ? (() => {
                    const c = moduleCounts(data, key);
                    return (
                      <p className="t-meta font-medium tabular-nums text-text-muted">
                        {c.done} done{c.late > 0 ? `, ${c.late} late` : ''}{c.notDone > 0 ? `, ${c.notDone} ${COUNT_WORD[key]}` : ''}
                      </p>
                    );
                  })() : (
                    <p className="t-meta font-medium text-text-muted">Nothing came due, so there is no score yet.</p>
                  )}
                </button>
              );
            })}
          </div>
          </div>

          {dayStrip && (
            <div className="flex flex-col gap-2">
              <h3 className="t-card font-display font-bold text-text">Day by day</h3>
              {dayStrip}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
