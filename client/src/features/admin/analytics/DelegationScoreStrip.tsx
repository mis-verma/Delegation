import { useId, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Percent } from 'lucide-react';
import { ActiveRangeBadge, ExportMenu, InlineError } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { toDayParam } from '../../../api/checklistInstances';
import type { DelegationScore } from '../../../api/scores';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { delegationDrillHref } from '../../dashboard/scoreDrill';
import { scoreQuery, useScoreReport } from '../../dashboard/scoreQueries';
import { StatTile } from './AnalyticsSummaryStrip';
import { formatPercent } from './analyticsDisplay';

interface DelegationScoreStripProps {
  /** The window every figure covers: the picked range, or the page's default window. */
  from?: string;
  to?: string;
  /** Admin and PC read the whole organisation; a department head reads the sum of their own departments. */
  isOrgWideRole: boolean;
}

type Totals = Pick<DelegationScore, 'due' | 'done' | 'onTime' | 'overdue' | 'completionPct' | 'onTimePct'>;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// The real delegation figures for the period, from the same score report as the Scorecard: how many
// came due, how many were done, the completion and on-time rates, and how many are overdue. The
// checklist-item and photo figures further down are a different thing (the steps inside delegations).
export const DelegationScoreStrip = ({ from, to, isOrgWideRole }: DelegationScoreStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const { token } = useAuth();
  const dayFrom = from ? toDayParam(from) : undefined;
  const dayTo = to ? toDayParam(to) : undefined;

  const orgQuery = useQuery({
    ...scoreQuery('org', undefined, dayFrom ?? '', dayTo ?? ''),
    enabled: isOrgWideRole && !!token && !!dayFrom && !!dayTo,
  });
  const reportQuery = useScoreReport(dayFrom, dayTo, !isOrgWideRole);
  const active = isOrgWideRole ? orgQuery : reportQuery;

  const totals = useMemo<Totals | null>(() => {
    if (isOrgWideRole) return orgQuery.data?.delegation ?? null;
    const departments = reportQuery.data?.departments;
    if (!departments) return null;
    const sum = departments.reduce(
      (acc, d) => ({ due: acc.due + d.delegation.due, done: acc.done + d.delegation.done, onTime: acc.onTime + d.delegation.onTime, overdue: acc.overdue + d.delegation.overdue }),
      { due: 0, done: 0, onTime: 0, overdue: 0 },
    );
    return { ...sum, completionPct: pct(sum.done, sum.due), onTimePct: pct(sum.onTime, sum.done) };
  }, [isOrgWideRole, orgQuery.data, reportQuery.data]);

  const loading = active.isPending && !totals;
  const failed = active.isError && !totals;
  const empty = !!totals && totals.due === 0;
  const text = (value: string | number) => (loading ? 'Loading' : value);

  const exportRows = (): TableRows => [
    ['Figure', 'Value'],
    ['Due', totals?.due ?? null],
    ['Done', totals?.done ?? null],
    ['Completion %', exportPct(totals?.completionPct)],
    ['On time %', exportPct(totals?.onTimePct)],
    ['Overdue', totals?.overdue ?? null],
  ];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={headingId} className="t-card font-display font-bold text-text">Delegations in this period</h3>
        <div className="flex items-center gap-2">
          <ActiveRangeBadge from={from} to={to} />
          <ExportMenu
            disabled={!totals}
            aria-label="Export the delegation figures"
            filename="overview-delegations-due"
            sheetName="Delegations"
            title={exportTitle({ what: 'Overview, delegations due in the period', from, to })}
            getRows={exportRows}
          />
        </div>
      </div>

      {failed ? (
        <InlineError message="Could not load the delegation figures." onRetry={() => void active.refetch()} />
      ) : (
        <div className="@container">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 @3xl:grid-cols-5">
            <StatTile icon={ListChecks} iconTint="text-primary-600 dark:text-primary-400" label="Due" value={text(totals?.due ?? 0)} isLoading={loading} caption={empty ? 'Nothing was due' : 'Came due in the period'} />
            <StatTile icon={CheckCircle2} iconTint="text-success" label="Done" value={text(totals?.done ?? 0)} isLoading={loading} caption="Approved or finished" />
            <StatTile icon={Percent} iconTint="text-primary-600 dark:text-primary-400" label="Completion" value={text(empty ? 'No data' : formatPercent(totals?.completionPct))} isLoading={loading} caption="Done out of due" />
            <StatTile icon={Clock} iconTint="text-success" label="On time" value={text(empty ? 'No data' : formatPercent(totals?.onTimePct))} isLoading={loading} caption="Of those done, finished by the deadline" />
            <StatTile
              icon={AlertTriangle}
              iconTint="text-warning"
              label="Overdue now"
              value={text(totals?.overdue ?? 0)}
              isLoading={loading}
              caption="Due in the period, not done"
              lowerIsBetter
              onClick={dayFrom && dayTo ? () => navigate(delegationDrillHref({ kind: 'org' }, dayFrom, dayTo, 'notDone')) : undefined}
            />
          </div>
        </div>
      )}
    </section>
  );
};
