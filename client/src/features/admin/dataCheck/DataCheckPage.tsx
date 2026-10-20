import { useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ArrowLeft, Check, ChevronDown, Flag, ListChecks, Play, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, IconChip, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { AnalyticsControlBar } from '../analytics/GroupByControl';
import { CARD_PAD } from '../../scores/controlStyles';
import { SectionHeader } from '../../scores/SectionHeader';
import { useScoreWindow, windowLabel } from '../../scores/useScoreWindow';
import { useDataCheck } from './useDataCheck';
import type { ConsistencyCheck, ConsistencyStatus } from '../../../api/scores';

const NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? `+${NUMBER.format(n)}` : NUMBER.format(n));

const STATUS: Record<ConsistencyStatus, { icon: LucideIcon; tone: string; bg: string; label: string }> = {
  pass: { icon: Check, tone: 'text-success', bg: 'bg-success', label: 'passed' },
  fail: { icon: AlertCircle, tone: 'text-danger', bg: 'bg-danger', label: 'failed' },
  flag: { icon: Flag, tone: 'text-warning', bg: 'bg-warning', label: 'explained' },
};

const FLAG_NOTE = 'A flag is not an error: a checklist run shared by several people or departments is counted in each of them, so the cuts can add up to more than the total.';

const GRID = 'md:grid md:grid-cols-[minmax(0,1.3fr)_6rem_6rem_6rem_minmax(0,2fr)] md:items-start md:gap-4';

const StatusChip = ({ status, count }: { status: ConsistencyStatus; count: number }) => {
  const { icon, bg, label } = STATUS[status];
  return <IconChip icon={icon} tone={count > 0 ? bg : 'bg-text-muted'} label={`${count} ${label}`} labelClassName="tabular-nums" />;
};

const Figure = ({ caption, value, tone }: { caption: string; value: string; tone?: string }) => (
  <p className="flex flex-col gap-0.5 md:items-end">
    <span className="t-meta font-display text-text-muted md:hidden">{caption}</span>
    <span className={cn('t-card font-display font-bold tabular-nums text-text', tone)}>{value}</span>
  </p>
);

const CheckRow = ({ check }: { check: ConsistencyCheck }) => {
  const { icon: Icon, tone, bg } = STATUS[check.status];
  return (
    <li className={cn('flex flex-col gap-3', CARD_PAD, GRID)}>
      <p className="flex items-start gap-2.5 t-card font-display font-semibold text-text leading-snug">
        <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white', bg)} aria-hidden="true">
          <Icon size={13} strokeWidth={2.75} />
        </span>
        <span>{check.label}</span>
      </p>
      <div className="grid grid-cols-3 gap-3 md:contents">
        <Figure caption="Expected" value={NUMBER.format(check.expected)} />
        <Figure caption="Actual" value={NUMBER.format(check.actual)} />
        <Figure caption="Difference" value={signed(check.diff)} tone={check.diff !== 0 ? tone : undefined} />
      </div>
      <p className="t-meta font-display text-text-secondary leading-relaxed">{check.explanation}</p>
    </li>
  );
};

const ColumnHeads = () => (
  <div className={cn('hidden border-b border-border px-4 py-2 t-meta font-display font-semibold text-text-muted', GRID)}>
    <span>Check</span>
    <span className="text-right">Expected</span>
    <span className="text-right">Actual</span>
    <span className="text-right">Difference</span>
    <span>What it means</span>
  </div>
);

const Group = ({ title, note, checks }: { title: string; note?: string; checks: ConsistencyCheck[] }) => (
  <section className="flex flex-col gap-3" aria-label={title}>
    <SectionHeader title={title} description={note} />
    <div className={cn(PANEL_CLASS, 'overflow-hidden')}>
      <ColumnHeads />
      <ul className="flex flex-col divide-y divide-border">
        {checks.map((c) => <CheckRow key={c.id} check={c} />)}
      </ul>
    </div>
  </section>
);

const DataCheckSkeleton = () => (
  <div className="flex flex-col gap-3" role="status" aria-label="Running the check">
    <Skeleton className="h-6 w-64 max-w-full" />
    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
  </div>
);

export const DataCheckPage = () => {
  const win = useScoreWindow();
  const { run, result, ranFor, isRunning, isError, errorMessage } = useDataCheck();
  const [showPassed, setShowPassed] = useState(false);

  const start = () => run({ from: win.from, to: win.to });
  const periodChanged = !!ranFor && (ranFor.from !== win.from || ranFor.to !== win.to);

  const failed = result?.checks.filter((c) => c.status === 'fail') ?? [];
  const flagged = result?.checks.filter((c) => c.status === 'flag') ?? [];
  const passed = result?.checks.filter((c) => c.status === 'pass') ?? [];
  const backTo = `/admin/scores?${new URLSearchParams({ from: win.from, to: win.to }).toString()}`;
  const gaps = (n: number) => `${n} explained ${n === 1 ? 'gap' : 'gaps'}`;

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="sr-only">Data check</h1>

      <AnalyticsControlBar
        groupBy="week"
        onGroupByChange={() => undefined}
        hideGroupBy
        range={win.range}
        onRangeChange={win.handleRange}
        updatedAt={null}
        isRefreshing={isRunning}
        onRefresh={start}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button onClick={start} disabled={isRunning} className="h-11 gap-2 sm:h-9">
          <Play size={15} aria-hidden />
          {isRunning ? 'Running' : result ? 'Run again' : 'Run check'}
        </Button>
        <p className="t-meta font-display text-text-muted">Checks {windowLabel(win.from, win.to)}. One year at most.</p>
        {periodChanged && !isRunning && (
          <p role="status" className="t-meta font-display font-semibold text-text-secondary">Period changed, run the check again.</p>
        )}
      </div>

      {isError && <InlineError message={errorMessage ?? "We couldn't run the check."} onRetry={start} />}

      {isRunning && !result && <DataCheckSkeleton />}

      {!result && !isRunning && !isError && (
        <EmptyState icon={ListChecks} title="Pick a period and run the check" description="It compares every cut of the scores against the totals and lists anything that does not add up." />
      )}

      {result && (
        <>
          <section aria-label="Result" className="flex flex-col gap-3">
            <p className="t-section font-display font-bold text-text" role="status">
              {result.failed === 0 && result.flagged === 0
                ? 'All checks passed'
                : result.failed === 0
                  ? `All checks passed, ${gaps(result.flagged)}`
                  : `${result.failed} failed, ${gaps(result.flagged)}`}
              <span className="t-card font-medium text-text-muted"> for {windowLabel(result.from, result.to)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusChip status="fail" count={result.failed} />
              <StatusChip status="flag" count={result.flagged} />
              <StatusChip status="pass" count={passed.length} />
            </div>
          </section>

          {failed.length > 0 && <Group title="Failed" checks={failed} />}
          {flagged.length > 0 && <Group title="Explained gaps" note={FLAG_NOTE} checks={flagged} />}

          {passed.length > 0 && (
            <section className="flex flex-col gap-3" aria-label="Passed checks">
              <Button
                variant="outline"
                onClick={() => setShowPassed((v) => !v)}
                aria-expanded={showPassed}
                className="h-11 w-fit gap-2 sm:h-9"
              >
                {showPassed ? 'Hide' : 'Show'} {passed.length} passed {passed.length === 1 ? 'check' : 'checks'}
                <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200 motion-reduce:transition-none', showPassed && 'rotate-180')} />
              </Button>
              {showPassed && <Group title="Passed" checks={passed} />}
            </section>
          )}
        </>
      )}

      <Link
        to={backTo}
        viewTransition
        className="inline-flex items-center gap-1.5 min-h-11 w-fit t-card font-display font-semibold text-text-secondary hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-lg"
      >
        <ArrowLeft size={15} aria-hidden />
        Back to Scores
      </Link>
    </div>
  );
};
