import { SectionExport } from './ExportRegistry';
import { memo, useId, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Trophy } from 'lucide-react';
import { Button, EmptyState, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { cn } from '@/lib/utils';
import { getInitials } from '../../../lib/getInitials';
import { avatarColorClass } from '../../../lib/avatarColors';
import { TONE_BAR, TONE_TEXT, toneOf } from './bi/vivid';
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
  subtitle: string;
  score: number;
  due: number;
  checklist: number | null;
  ticket: number | null;
  delegation: number | null;
}

interface TeamLeaderboardRailProps {
  from?: string;
  to?: string;
}

const RANK_SOLID = ['bg-vivid-blue text-white', 'bg-vivid-sky text-white', 'bg-vivid-green text-white'] as const;

const MODULE_CHIPS = [
  { key: 'checklist', label: 'Checklists' },
  { key: 'ticket', label: 'Tickets' },
  { key: 'delegation', label: 'Delegations' },
] as const;

const LeaderboardRow = memo(({ row, index, href }: { row: LeaderRow; index: number; href: string }) => {
  const tone = toneOf(row.score);
  return (
    <Link
      viewTransition
      to={href}
      aria-label={`${row.name}, ${formatPercent(row.score)}. Open on the Scorecard`}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3 outline-none transition-colors duration-150 ease-out hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:gap-4"
    >
      <span
        aria-label={`Rank ${index + 1}`}
        className={cn('flex size-8 shrink-0 items-center justify-center rounded-full t-card font-display font-extrabold tabular-nums', RANK_SOLID[index] ?? 'bg-surface-hover text-text-secondary')}
      >
        {index + 1}
      </span>
      <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-full t-card font-display font-bold text-white', avatarColorClass(row.name))}>
        {getInitials(row.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="min-w-0 line-clamp-1 t-section font-display font-bold text-text">{row.name}</span>
          <span className={cn('shrink-0 t-stat font-display font-extrabold tabular-nums', TONE_TEXT[tone])}>{formatPercent(row.score)}</span>
        </span>
        <span className="h-2 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
          <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', TONE_BAR[tone])} style={{ width: `${Math.max(2, Math.min(100, row.score))}%` }} />
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta font-medium text-text-muted">
          <span>{row.subtitle}</span>
          {MODULE_CHIPS.map(({ key, label }) => {
            const value = row[key];
            return (
              <span key={key} className="inline-flex items-baseline gap-1.5">
                {label}
                <span className={cn('font-display font-bold tabular-nums', TONE_TEXT[toneOf(value)])}>{value === null ? 'N/A' : formatPercent(value)}</span>
              </span>
            );
          })}
        </span>
      </span>
    </Link>
  );
});
LeaderboardRow.displayName = 'LeaderboardRow';

export const TeamLeaderboardRail = ({ from, to }: TeamLeaderboardRailProps) => {
  const headingId = useId();
  const navigate = useNavigate();
  const query = useOverviewScores(from, to, { view: 'person' });
  const dayFrom = query.win?.from;
  const dayTo = query.win?.to;
  const seeAllHref = `/admin/scores?${new URLSearchParams({ view: 'person', ...(dayFrom && dayTo ? { from: dayFrom, to: dayTo } : {}) }).toString()}`;

  const { leaderboard, fewItems } = useMemo(() => {
    const rows: LeaderRow[] = [];
    for (const row of query.data?.rows ?? []) {
      const p = explorerRowToReportRow(row);
      if (p.left || p.id === UNASSIGNED_ROW_ID) continue;
      const due = totalDue(p);
      const score = overallOf(p);
      if (due <= 0 || score === null) continue;
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
    const sorted = rows.sort((a, b) => b.score - a.score || b.due - a.due || a.name.localeCompare(b.name));
    const ranked = sorted.filter((r) => r.due >= MIN_RANK_VOLUME).slice(0, LEADERBOARD_SIZE);
    return { leaderboard: ranked, fewItems: ranked.length === 0 ? sorted.slice(0, LEADERBOARD_SIZE) : [] };
  }, [query.data]);

  const exportRows = (): TableRows => [
    ['Rank', 'Person', SCORE_LABEL.overall, 'Checklist score', 'Ticket score', 'Delegation score', SCORE_LABEL.due],
    ...leaderboard.map((r, i) => [i + 1, r.name, exportPct(r.score), exportPct(r.checklist), exportPct(r.ticket), exportPct(r.delegation), r.due]),
  ];

  return (
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
            <SectionExport
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
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : leaderboard.length === 0 && fewItems.length > 0 ? (
        <div className="flex flex-1 flex-col gap-2">
          <p className="t-meta text-text-muted">{`Not ranked yet. Each person has fewer than ${MIN_RANK_VOLUME} items due in this period.`}</p>
          <div className="flex flex-col gap-2">
            {fewItems.map((row, index) => (
              <LeaderboardRow key={row.id} row={row} index={index} href={scorecardRowHref('person', row.id, dayFrom ?? '', dayTo ?? '')} />
            ))}
          </div>
        </div>
      ) : leaderboard.length === 0 ? (
        <EmptyState
          size="compact"
          icon={Trophy}
          title="Nothing was due in this period"
          description="People show here once a checklist, ticket or delegation of theirs comes due."
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {leaderboard.map((row, index) => (
            <LeaderboardRow key={row.id} row={row} index={index} href={scorecardRowHref('person', row.id, dayFrom ?? '', dayTo ?? '')} />
          ))}
        </div>
      )}
    </section>
  );
};
