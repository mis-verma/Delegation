import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import { PersonRow, Skeleton } from '../../../components';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useUsersQuery } from '../hook';
import { useTicketOwnerStatsQuery, useTaskOwnerStatsQuery } from './useAnalyticsQueries';

interface LeaderRow {
  id: string;
  name: string;
  departmentName: string;
  score: number;
}

interface TeamLeaderboardRailProps {
  /** Scopes the leaderboard to the same window the page's date-range control set — this rail
   *  used to ignore it entirely (always all-time), sitting right next to ComplianceGaugeRail
   *  which does react to the same control, with nothing indicating this one was exempt. */
  from?: string;
  to?: string;
}

// Top-5 org-wide performers by a simple completed-vs-overdue score — moved here from
// StoresPerformanceSection (same computation, same real data) so it's visible at a glance on the
// overview page instead of only inside the Stores tab.
export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const { data: departments = [] } = useDepartmentsQuery();
  // Real per-user GROUP BY aggregates, not a client-side reduce over a capped page — that
  // silently mis-scored (or zeroed out) anyone whose tickets/tasks weren't among the org's
  // newest 100/200 (see ticket.service.ts#ownerStats and task.service.ts#ownerStats). Also moves
  // the date-range scoping server-side instead of the client's own `inRange` filter.
  const { data: ticketRows = [], isPending: ticketsPending } = useTicketOwnerStatsQuery('user', from, to);
  const { data: taskRows = [], isPending: tasksPending } = useTaskOwnerStatsQuery('user', from, to);
  const { data: users = [], isPending: usersPending } = useUsersQuery(true);
  const isPending = ticketsPending || tasksPending || usersPending;

  const ticketsByUser = useMemo(() => new Map(ticketRows.map((r) => [r.ownerId, r])), [ticketRows]);
  const tasksByUser = useMemo(() => new Map(taskRows.map((r) => [r.ownerId, r])), [taskRows]);

  const leaderboard: LeaderRow[] = useMemo(() => {
    const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—';

    return users
      .map((u) => {
        const myTaskStats = tasksByUser.get(u.id);
        const myTicketStats = ticketsByUser.get(u.id);
        const taskTotal = myTaskStats?.total ?? 0;
        const ticketTotal = myTicketStats?.total ?? 0;
        const totalWork = taskTotal + ticketTotal;
        if (totalWork === 0) return null;

        const completed = (myTaskStats?.done ?? 0) + (myTicketStats?.closed ?? 0);
        const overdue = (myTaskStats?.overdueCount ?? 0) + (myTicketStats?.overdueCount ?? 0);

        const score = Math.round(Math.max(0, (completed / totalWork) * 100 - (overdue / totalWork) * 20));

        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
          departmentName: departmentName(u.departmentId),
          score,
        };
      })
      .filter((row): row is LeaderRow => row !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [users, tasksByUser, ticketsByUser, departments]);

  return (
    // flex-1, not a natural-height card — this sits in a right rail next to a taller sibling
    // column (Compliance gauges above it, tabs+chart column beside it); growing to fill the
    // stretched row height means its own content centers in real space instead of the card
    // stopping short and leaving a block of bare page background beneath it.
    <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1 flex-1">
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={16} className="text-coral-500" />
        <h3 className="text-sm font-display font-bold tracking-wide text-text">Leaderboard</h3>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2 py-1">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
      ) : leaderboard.length === 0 ? (
        <p className="flex-1 flex items-center justify-center text-sm font-display text-text-muted text-center">No activity yet.</p>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-1">
          {leaderboard.map((row, index) => (
            <PersonRow key={row.id} index={index} name={row.name} subtitle={row.departmentName} metric={row.score} />
          ))}
        </div>
      )}
    </div>
  );
};
