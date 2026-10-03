import { memo, useId, useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { PersonRow, EntityIconTile, EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useUsersQuery } from '../hook';
import { useTicketOwnerStatsQuery, useTaskOwnerStatsQuery } from './useAnalyticsQueries';
import { formatPercent } from './analyticsDisplay';
import { MIN_RANK_VOLUME } from './useOwnerRankings';

/** How hard each overdue item pulls a score down, relative to what finishing an item earns. */
const OVERDUE_PENALTY_PER_100 = 20;
const LEADERBOARD_SIZE = 5;

interface LeaderRow {
  id: string;
  name: string;
  departmentName: string;
  score: number;
}

interface TeamLeaderboardRailProps {
  /** Scopes the leaderboard to the same window the page's date-range control set. */
  from?: string;
  to?: string;
}

const LeaderboardRow = memo(({ row, index }: { row: LeaderRow; index: number }) => (
  <PersonRow index={index} name={row.name} subtitle={row.departmentName} metric={formatPercent(row.score)} />
));

// Top 5 people by completed work, less a penalty for work that is overdue and still open. Needs at
// least MIN_RANK_VOLUME items in the window, and only active people appear.
export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const headingId = useId();
  const { data: departments } = useDepartmentsQuery();
  // Real per-user GROUP BY aggregates, not a reduce over a capped page. The date range is applied
  // server-side, so this rail follows the same window as everything else on the page.
  const ticketsQuery = useTicketOwnerStatsQuery('user', from, to);
  const tasksQuery = useTaskOwnerStatsQuery('user', from, to);
  const usersQuery = useUsersQuery(true);
  const isPending = ticketsQuery.isPending || tasksQuery.isPending || usersQuery.isPending;
  const isError = ticketsQuery.isError || tasksQuery.isError || usersQuery.isError;
  const isFetching = ticketsQuery.isFetching || tasksQuery.isFetching || usersQuery.isFetching;

  const ticketRows = ticketsQuery.data;
  const taskRows = tasksQuery.data;
  const users = usersQuery.data;

  const ticketsByUser = useMemo(() => new Map((ticketRows ?? []).map((r) => [r.ownerId, r])), [ticketRows]);
  const tasksByUser = useMemo(() => new Map((taskRows ?? []).map((r) => [r.ownerId, r])), [taskRows]);
  const departmentNames = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  const leaderboard: LeaderRow[] = useMemo(() => {
    const rows: LeaderRow[] = [];
    for (const u of users ?? []) {
      if (u.isActive === false) continue;
      const tasks = tasksByUser.get(u.id);
      const tickets = ticketsByUser.get(u.id);
      const total = (tasks?.total ?? 0) + (tickets?.total ?? 0);
      if (total < MIN_RANK_VOLUME) continue;

      const completed = (tasks?.done ?? 0) + (tickets?.closed ?? 0);
      const openOverdue = (tasks?.overdueCount ?? 0) + (tickets?.overdueCount ?? 0);
      const score = Math.max(0, (completed / total) * 100 - (openOverdue / total) * OVERDUE_PENALTY_PER_100);

      rows.push({
        id: u.id,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        departmentName: (u.departmentId && departmentNames.get(u.departmentId)) || 'No department',
        score,
      });
    }
    return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, LEADERBOARD_SIZE);
  }, [users, tasksByUser, ticketsByUser, departmentNames]);

  const retry = () => {
    for (const q of [ticketsQuery, tasksQuery, usersQuery]) if (q.isError) void q.refetch();
  };

  return (
    // flex-1, not a natural-height card: this sits in a right rail next to a taller column, and
    // growing to fill that height keeps the content centred instead of leaving bare page below it.
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} p-4 sm:p-5 flex flex-col gap-3 flex-1`}>
      <div className="flex items-center gap-2.5">
        <EntityIconTile icon={Trophy} tone="coral" className="size-8 rounded-lg" />
        <h2 id={headingId} className="text-sm font-display font-bold text-text">Leaderboard</h2>
      </div>

      {isError ? (
        <InlineError message="Could not load the leaderboard." onRetry={retry} />
      ) : isPending ? (
        <div className="flex flex-col gap-2 py-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : leaderboard.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Trophy}
          title="No one is ranked yet"
          description={`People need at least ${MIN_RANK_VOLUME} tickets or delegations in the period.`}
        />
      ) : (
        <div className={`flex-1 flex flex-col justify-center gap-1 transition-opacity motion-reduce:transition-none ${isFetching ? 'opacity-60' : ''}`}>
          {leaderboard.map((row, index) => (
            <LeaderboardRow key={row.id} row={row} index={index} />
          ))}
        </div>
      )}
    </section>
  );
};
