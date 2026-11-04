import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import type { ExplorerRow, ExplorerView, MatrixParams } from '../../api/scores';
import { InlineError, PANEL_CLASS, Skeleton } from '../../components';
import { useOrgToday } from '../checklist/useOrgToday';
import { shiftDay } from '../admin/analytics/analyticsDisplay';
import { BiDetailDialog, type BiDetail } from '../admin/analytics/bi/BiDetailDialog';
import { HeatGrid } from '../admin/analytics/bi/HeatGrid';
import { useBiMatrix } from '../admin/analytics/bi/useBiMatrix';
import { asTrailItem, serializeTrail } from '../scores/scoresDisplay';
import { canUseScoreExplorer, teamScoreView } from '../scores/teamScoreView';
import { windowLabel } from '../scores/useScoreWindow';
import { DashCardHeader, DashCardLink } from './DashCardHeader';

const MAX_ROWS = 10;

const HeatSkeleton = () => (
  <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 p-2" role="status" aria-label="Loading the team week">
    {[0, 1, 2, 3].map((r) => (
      <div key={r} className="flex items-center gap-1">
        <Skeleton className="h-9 w-28 shrink-0 rounded-md sm:w-44" />
        {Array.from({ length: 7 }, (_, c) => <Skeleton key={c} className="h-9 min-w-6 flex-1 rounded-md" />)}
      </div>
    ))}
  </div>
);

export const TeamWeekHeat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useOrgToday();
  const allowed = canUseScoreExplorer(user?.role);
  const view = teamScoreView(user?.role);
  const win = useMemo(() => ({ from: shiftDay(today, -6), to: today }), [today]);
  const params = useMemo<MatrixParams | null>(
    () => (allowed ? { from: win.from, to: win.to, view: view === 'person' ? 'person' : 'department', period: 'day' } : null),
    [allowed, win, view],
  );
  const query = useBiMatrix(params);
  const [detail, setDetail] = useState<BiDetail | null>(null);

  if (!allowed) return null;

  const matrix = query.data;
  const subject = view === 'person' ? 'people' : 'departments';
  const scoresHref = `/admin/scores?${new URLSearchParams({ view, from: win.from, to: win.to }).toString()}`;
  const dialogWin = { from: win.from, to: win.to, label: windowLabel(win.from, win.to) };

  const drill = (row: Pick<ExplorerRow, 'id' | 'name' | 'kind'>, nextView: ExplorerView) => {
    const item = asTrailItem(row);
    const trail = item ? serializeTrail([item]) : null;
    void navigate(`/admin/scores?${new URLSearchParams({ view: nextView, from: win.from, to: win.to, ...(trail ? { trail } : {}) }).toString()}`, { viewTransition: true });
  };

  return (
    <section aria-labelledby="team-week-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="team-week-heading"
        title="Team this week"
        subtitle={`Score by day for your ${subject}. Tap a name or a box for details.`}
        action={<DashCardLink to={scoresHref} label="All scores, last 7 days">All scores</DashCardLink>}
      />

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {query.isError && !matrix ? (
          <InlineError message="Couldn't load the team week." onRetry={() => void query.refetch()} />
        ) : !matrix ? (
          <HeatSkeleton />
        ) : matrix.rows.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-8 text-center t-card font-medium text-text-muted">Nothing was due for your {subject} this week.</p>
        ) : (
          <HeatGrid
            matrix={matrix}
            module="all"
            measure="score"
            lowestFirst
            totalLabel={view === 'person' ? 'Your department' : 'Whole organisation'}
            showTotal={view !== 'person'}
            maxRows={MAX_ROWS}
            onOpen={(row, bucketIndex) => setDetail({ row, bucketIndex })}
          />
        )}
      </div>

      <BiDetailDialog detail={detail} win={dialogWin} matrixParams={params} allowZoom={false} onClose={() => setDetail(null)} onDrill={drill} onZoom={() => undefined} />
    </section>
  );
};
