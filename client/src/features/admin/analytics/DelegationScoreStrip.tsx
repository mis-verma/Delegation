import { useId } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Clock, ListChecks, Percent } from 'lucide-react';
import { ActiveRangeBadge, ExportMenu, InlineError } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { MODULE_LABEL, SCORE_LABEL } from '../../../lib/scoreLabels';
import { delegationDrillHref } from '../../dashboard/scoreDrill';
import { HowCalculated } from '../../scores/HowCalculated';
import { SectionHeader } from '../../scores/SectionHeader';
import { StatTile } from './AnalyticsSummaryStrip';
import { formatPercent } from './analyticsDisplay';
import { UpdatingNote } from './UpdatingNote';
import { useOverviewScores } from './useOverviewScores';

interface DelegationScoreStripProps {
  /** The window every figure covers (ISO instants): the picked range, or the page's default window. */
  from?: string;
  to?: string;
  /** Kept for the caller: Admin and PC read the whole organisation and a department head their department, both decided by the explorer itself. */
  isOrgWideRole: boolean;
}

// The delegation figures for the period, from the score explorer's whole-window row (the same answer the
// Scores page shows): how many came due, how many were done, the completion and on-time rates, and how many
// are overdue. The checklist-item and photo figures further down are a different thing (the steps inside delegations).
export const DelegationScoreStrip = ({ from, to }: DelegationScoreStripProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const scores = useOverviewScores(from, to);
  const totals = scores.total?.delegation ?? null;
  const dayFrom = scores.win?.from;
  const dayTo = scores.win?.to;

  const loading = scores.isPending && !totals;
  const failed = scores.isError && !totals;
  const empty = !!totals && totals.due === 0;
  // On time (of finished) has nothing to divide when no delegation is done yet.
  const noneFinished = !!totals && totals.done === 0;
  const text = (value: string | number) => (loading ? 'Loading' : value);

  const exportRows = (): TableRows => [
    ['Figure', 'Value'],
    [SCORE_LABEL.due, totals?.due ?? null],
    [SCORE_LABEL.done, totals?.done ?? null],
    [`${SCORE_LABEL.completion} %`, exportPct(totals?.completion)],
    [`${SCORE_LABEL.onTime} %`, exportPct(totals?.onTimeOfFinishedPct)],
    ['Past due and not done (not counting waiting for approval)', totals?.overdue ?? null],
  ];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        id={headingId}
        title={`${MODULE_LABEL.delegation} in this period`}
        actions={
          <>
            <UpdatingNote show={scores.updating} />
            <ActiveRangeBadge from={from} to={to} />
            <ExportMenu
              disabled={!totals}
              aria-label="Export the delegation figures"
              filename="overview-delegations-due"
              sheetName="Delegations"
              title={exportTitle({ what: 'Overview, delegations due in the period', from, to })}
              getRows={exportRows}
            />
          </>
        }
      />

      {failed ? (
        <InlineError message="Could not load the delegation figures." onRetry={() => void scores.refetch()} />
      ) : (
        <div className="@container">
          {/* Four tiles, not five: the done count lives in Completion's caption, so no figure is cut short at desktop widths. */}
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <StatTile icon={ListChecks} iconTint="text-primary-600 dark:text-primary-400" label={SCORE_LABEL.due} value={text(totals?.due ?? 0)} isLoading={loading} caption={empty ? 'Nothing was due' : 'Came due in the period'} />
            <StatTile
              icon={Percent}
              iconTint="text-primary-600 dark:text-primary-400"
              label={SCORE_LABEL.completion}
              labelAdornment={<HowCalculated figure="completion" module="delegation" />}
              value={text(empty ? 'No data' : formatPercent(totals?.completion))}
              isLoading={loading}
              caption={empty ? 'Done out of due' : `${totals?.done ?? 0} of ${totals?.due ?? 0} done`}
            />
            <StatTile
              icon={Clock}
              iconTint="text-success"
              label={SCORE_LABEL.onTime}
              labelAdornment={<HowCalculated figure="onTime" module="delegation" />}
              value={text(empty || noneFinished ? 'No data' : formatPercent(totals?.onTimeOfFinishedPct))}
              isLoading={loading}
              caption="Of those done, finished by the deadline"
            />
            <StatTile
              icon={AlertTriangle}
              iconTint="text-warning"
              label="Past due, not done"
              value={text(totals?.overdue ?? 0)}
              isLoading={loading}
              caption="Due in the period, not done. Waiting for approval is left out"
              lowerIsBetter
              onClick={dayFrom && dayTo ? () => navigate(delegationDrillHref({ kind: 'org' }, dayFrom, dayTo, 'notDone')) : undefined}
            />
          </div>
        </div>
      )}
    </section>
  );
};
