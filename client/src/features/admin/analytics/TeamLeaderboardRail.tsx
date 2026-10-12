import { memo, useId, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { PersonRow, EntityIconTile, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { useAuth } from '../../../context/AuthContext';
import { toDayParam } from '../../../api/checklistInstances';
import { scoreApi } from '../../../api/scores';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { formatPercent } from './analyticsDisplay';
import { MIN_RANK_VOLUME } from './useOwnerRankings';

const LEADERBOARD_SIZE = 5;

interface LeaderRow {
  id: string;
  name: string;
  departmentName: string;
  score: number;
  due: number;
  done: number;
  completion: number;
  /** Checklist compliance, when any answer was checked. */
  compliance: number | null;
}

interface TeamLeaderboardRailProps {
  /** Scopes the leaderboard to the same window the page's date-range control set. */
  from?: string;
  to?: string;
}

const LeaderboardRow = memo(({ row, index }: { row: LeaderRow; index: number }) => (
  <PersonRow index={index} name={row.name} subtitle={row.departmentName} metric={formatPercent(row.score)} progress={row.score} metricTone={row.score >= 80 ? 'success' : row.score < 50 ? 'danger' : 'default'} />
));

// Top 5 people, on the same two measures as the Report page: completion across checklists, tickets and
// delegations, and checklist compliance, counted equally. With no checked answers yet, completion stands
// alone. Needs at least MIN_RANK_VOLUME items due in the window, so one lucky item cannot top the board.
export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const headingId = useId();
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ['scores', 'leaderboard', from, to],
    queryFn: () => scoreApi.report({ from: toDayParam(from as string), to: toDayParam(to as string) }),
    enabled: !!token && !!from && !!to,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const leaderboard: LeaderRow[] = useMemo(() => {
    const rows: LeaderRow[] = [];
    for (const p of query.data?.people ?? []) {
      const due = p.checklist.due + p.ticket.due + p.delegation.due;
      if (due < MIN_RANK_VOLUME) continue;
      const done = p.checklist.completed + p.ticket.closed + p.delegation.done;
      const completion = (done / due) * 100;
      const compliance = p.checklist.compliancePct;
      rows.push({
        id: p.id,
        name: p.name,
        departmentName: p.department || 'No department',
        score: compliance === null ? completion : (completion + compliance) / 2,
        due,
        done,
        completion,
        compliance,
      });
    }
    return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, LEADERBOARD_SIZE);
  }, [query.data]);

  const exportRows = (): TableRows => [
    ['Rank', 'Person', 'Department', 'Overall score', 'Completion %', 'Checklist compliance %', 'Done', 'Due'],
    ...leaderboard.map((r, i) => [i + 1, r.name, r.departmentName, exportPct(r.score), exportPct(r.completion), exportPct(r.compliance), r.done, r.due]),
  ];

  return (
    // flex-1, not a natural-height card: this sits in a right rail next to a taller column, and
    // growing to fill that height keeps the content centred instead of leaving bare page below it.
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} p-4 sm:p-5 flex flex-col gap-3 flex-1`}>
      <div className="flex items-center gap-2.5">
        <EntityIconTile icon={Trophy} tone="coral" className="size-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="t-card font-display font-bold text-text">Leaderboard</h2>
          <p className="t-meta text-text-muted">Top 5 people by overall score</p>
        </div>
        <ExportMenu
          disabled={leaderboard.length === 0}
          aria-label="Export the leaderboard"
          filename="overview-leaderboard"
          sheetName="Leaderboard"
          title={exportTitle({ what: 'Overview, leaderboard, top 5 people', from, to })}
          getRows={exportRows}
        />
      </div>

      {query.isError && !query.data ? (
        <InlineError message="Could not load the leaderboard." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="flex flex-col gap-2 py-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : leaderboard.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Trophy}
          title="No one is ranked yet"
          description={`People need at least ${MIN_RANK_VOLUME} checklists, tickets or delegations in the period.`}
        />
      ) : (
        <div className={`flex-1 flex flex-col justify-center gap-1 transition-opacity motion-reduce:transition-none ${query.isFetching ? 'opacity-60' : ''}`}>
          {leaderboard.map((row, index) => (
            <LeaderboardRow key={row.id} row={row} index={index} />
          ))}
        </div>
      )}
    </section>
  );
};
