import { memo, useId, useMemo } from 'react';
import { Link } from 'react-router';
import { Trophy } from 'lucide-react';
import { PersonRow, EntityIconTile, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { toDayParam } from '../../../api/checklistInstances';
import { UNASSIGNED_ROW_ID } from '../../../api/scores';
import { moduleOverall, overallOf, totalDue } from '../../dashboard/scoreMetrics';
import { useScoreReport } from '../../dashboard/scoreQueries';
import { scorecardRowHref } from '../../dashboard/scoreDrill';
import { formatPercent } from './analyticsDisplay';
import { MIN_RANK_VOLUME } from './useOwnerRankings';

const LEADERBOARD_SIZE = 5;

interface LeaderRow {
  id: string;
  name: string;
  departmentName: string;
  /** The Overall score: the same rule and the same numbers as the Scorecard. */
  score: number;
  due: number;
  checklist: number | null;
  ticket: number | null;
  delegation: number | null;
}

interface TeamLeaderboardRailProps {
  /** Scopes the leaderboard to the same window the page's date-range control set. */
  from?: string;
  to?: string;
}

const LeaderboardRow = memo(({ row, index, href }: { row: LeaderRow; index: number; href: string }) => (
  <Link
    viewTransition
    to={href}
    aria-label={`${row.name}, ${formatPercent(row.score)}. Open on the Scorecard`}
    className="block rounded-lg border border-transparent px-1.5 transition-[border-color,transform] duration-150 ease-out hover:border-border-hover active:scale-[0.985] outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <PersonRow index={index} name={row.name} subtitle={row.departmentName} metric={formatPercent(row.score)} progress={row.score} metricTone={row.score >= 80 ? 'success' : row.score < 50 ? 'danger' : 'default'} />
  </Link>
));
LeaderboardRow.displayName = 'LeaderboardRow';

// Top 5 people by the Overall score, read from the same score report as the Scorecard (one shared
// request): completion and compliance of every module with something due, counted equally. Needs at
// least MIN_RANK_VOLUME items due in the window, so one lucky item cannot top the board. A row opens
// that person on the Scorecard for the same window.
export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const headingId = useId();
  const dayFrom = from ? toDayParam(from) : undefined;
  const dayTo = to ? toDayParam(to) : undefined;
  const query = useScoreReport(dayFrom, dayTo);

  const leaderboard: LeaderRow[] = useMemo(() => {
    const rows: LeaderRow[] = [];
    for (const p of query.data?.people ?? []) {
      // Only current people are ranked: not someone who has left, and not the Unassigned row.
      if (p.left || p.id === UNASSIGNED_ROW_ID) continue;
      const due = totalDue(p);
      const score = overallOf(p);
      if (due < MIN_RANK_VOLUME || score === null) continue;
      rows.push({
        id: p.id,
        name: p.name,
        departmentName: p.department || 'No department',
        score,
        due,
        checklist: moduleOverall(p, 'checklist'),
        ticket: moduleOverall(p, 'ticket'),
        delegation: moduleOverall(p, 'delegation'),
      });
    }
    return rows.sort((a, b) => b.score - a.score || b.due - a.due || a.name.localeCompare(b.name)).slice(0, LEADERBOARD_SIZE);
  }, [query.data]);

  const exportRows = (): TableRows => [
    ['Rank', 'Person', 'Department', 'Overall score', 'Checklist score', 'Ticket score', 'Delegation score', 'Due'],
    ...leaderboard.map((r, i) => [i + 1, r.name, r.departmentName, exportPct(r.score), exportPct(r.checklist), exportPct(r.ticket), exportPct(r.delegation), r.due]),
  ];

  return (
    // flex-1, not a natural-height card: this sits in a right rail next to a taller column, and
    // growing to fill that height keeps the content centred instead of leaving bare page below it.
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} p-4 sm:p-5 flex flex-col gap-3 flex-1`}>
      <div className="flex items-center gap-2">
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
      ) : !query.data ? (
        <div className="flex flex-col gap-2 py-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : leaderboard.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Trophy}
          title="No one is ranked yet"
          description={`People need at least ${MIN_RANK_VOLUME} checklists, tickets or delegations due in the period.`}
        />
      ) : (
        // No dim while the next window loads: the old rows stay until the new ones land.
        <div className="flex-1 flex flex-col justify-center gap-1">
          {leaderboard.map((row, index) => (
            <LeaderboardRow key={row.id} row={row} index={index} href={scorecardRowHref('person', row.id, dayFrom ?? '', dayTo ?? '')} />
          ))}
        </div>
      )}
    </section>
  );
};
