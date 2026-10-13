import { memo, useId, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Trophy } from 'lucide-react';
import { PersonRow, Button, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { UNASSIGNED_ROW_ID } from '../../../api/scores';
import { SCORE_LABEL } from '../../../lib/scoreLabels';
import { moduleOverall, overallOf, totalDue } from '../../dashboard/scoreMetrics';
import { scorecardRowHref } from '../../dashboard/scoreDrill';
import { explorerRowToReportRow } from '../../scores/explorerAdapters';
import { CARD_PAD } from '../../scores/controlStyles';
import { HowCalculated } from '../../scores/HowCalculated';
import { SectionHeader } from '../../scores/SectionHeader';
import { formatPercent } from './analyticsDisplay';
import { MIN_RANK_VOLUME } from './useOwnerRankings';
import { useOverviewScores } from './useOverviewScores';
import { UpdatingNote } from './UpdatingNote';

const LEADERBOARD_SIZE = 5;

interface LeaderRow {
  id: string;
  name: string;
  /** What is under the name: how much was due, since the explorer does not carry the department. */
  subtitle: string;
  /** The Overall score: the same rule and the same numbers as the Scores page. */
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
    className="block rounded-lg border border-transparent px-1.5 transition-colors duration-150 ease-out hover:border-border-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <PersonRow index={index} name={row.name} subtitle={row.subtitle} metric={formatPercent(row.score)} progress={row.score} metricTone={row.score >= 80 ? 'success' : row.score < 50 ? 'danger' : 'default'} />
  </Link>
));
LeaderboardRow.displayName = 'LeaderboardRow';

// Top 5 people by the Overall score, read from the score explorer (person view, the same cache entry as the Scores
// page): completion and compliance of every module with something due, counted equally. Needs at least
// MIN_RANK_VOLUME items due in the window, so one lucky item cannot top the board. A row opens that person on the
// Scorecard for the same window; See all opens the people on the Scores page.
export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const query = useOverviewScores(from, to, { view: 'person' });
  const dayFrom = query.win?.from;
  const dayTo = query.win?.to;
  const seeAllHref = `/admin/scores?${new URLSearchParams({ view: 'person', ...(dayFrom && dayTo ? { from: dayFrom, to: dayTo } : {}) }).toString()}`;

  const leaderboard: LeaderRow[] = useMemo(() => {
    const rows: LeaderRow[] = [];
    for (const row of query.data?.rows ?? []) {
      const p = explorerRowToReportRow(row);
      // Only current people are ranked: not someone who has left, and not the Unassigned row.
      if (p.left || p.id === UNASSIGNED_ROW_ID) continue;
      const due = totalDue(p);
      const score = overallOf(p);
      if (due < MIN_RANK_VOLUME || score === null) continue;
      rows.push({
        id: p.id,
        name: p.name,
        subtitle: `${due} due`,
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
    ['Rank', 'Person', SCORE_LABEL.overall, 'Checklist score', 'Ticket score', 'Delegation score', SCORE_LABEL.due],
    ...leaderboard.map((r, i) => [i + 1, r.name, exportPct(r.score), exportPct(r.checklist), exportPct(r.ticket), exportPct(r.delegation), r.due]),
  ];

  return (
    // flex-1, not a natural-height card: this sits in a right rail next to a taller column, and
    // growing to fill that height keeps the content centred instead of leaving bare page below it.
    <section aria-labelledby={headingId} className={`${PANEL_CLASS} flex flex-1 flex-col gap-4 ${CARD_PAD}`}>
      <SectionHeader
        id={headingId}
        level="card"
        title="Leaderboard"
        hint={<HowCalculated figure="overall" />}
        description="Top 5 people by overall score"
        actions={
          <>
            <UpdatingNote show={query.updating} />
            <Button type="button" variant="ghost" size="sm" onClick={() => navigate(seeAllHref, { viewTransition: true })}>
              See all people
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
            <ExportMenu
              disabled={leaderboard.length === 0}
              aria-label="Export the leaderboard"
              filename="overview-leaderboard"
              sheetName="Leaderboard"
              title={exportTitle({ what: 'Overview, leaderboard, top 5 people', from, to })}
              getRows={exportRows}
            />
          </>
        }
      />

      {query.isError && !query.data ? (
        <InlineError message="Could not load the leaderboard." onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading the leaderboard">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
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
        <div className="flex flex-1 flex-col gap-1">
          {leaderboard.map((row, index) => (
            <LeaderboardRow key={row.id} row={row} index={index} href={scorecardRowHref('person', row.id, dayFrom ?? '', dayTo ?? '')} />
          ))}
        </div>
      )}
    </section>
  );
};
