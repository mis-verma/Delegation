import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Grid3x3, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ExplorerRow, ExplorerView, MatrixParams } from '../../api/scores';
import { Button, InlineError, PANEL_CLASS, Skeleton } from '../../components';
import { useOrgToday } from '../checklist/useOrgToday';
import { shiftDay } from '../admin/analytics/analyticsDisplay';
import { BiDetailDialog, type BiDetail } from '../admin/analytics/bi/BiDetailDialog';
import { HeatGrid } from '../admin/analytics/bi/HeatGrid';
import { useBiMatrix } from '../admin/analytics/bi/useBiMatrix';
import { asTrailItem, serializeTrail } from '../scores/scoresDisplay';
import { canUseScoreExplorer, teamScoreView } from '../scores/teamScoreView';
import { windowLabel } from '../scores/useScoreWindow';
import { cardIconTile } from './dashboardDisplay';

const MAX_ROWS = 10;

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
    <section aria-labelledby="team-week-heading" className={`${PANEL_CLASS} flex h-full flex-col gap-3 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cardIconTile('primary')}>
            <Grid3x3 className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="team-week-heading" className="t-section font-display font-bold tracking-tight text-text">Team this week</h2>
            <p className="hidden t-meta font-medium text-text-muted sm:block">Score by day for your {subject}. Tap a name or a box for details.</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void navigate(scoresHref, { viewTransition: true })} className="shrink-0 pointer-coarse:min-h-11">
          All scores
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>

      {query.isError && !matrix ? (
        <InlineError message="Could not load the team week." onRetry={() => void query.refetch()} />
      ) : !matrix ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : matrix.rows.length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-8 text-center t-card font-medium text-text-muted">Nothing was due for your {subject} this week.</p>
      ) : (
        <HeatGrid
          matrix={matrix}
          module="all"
          measure="score"
          lowestFirst
          totalLabel={view === 'person' ? 'Your department' : 'Whole organisation'}
          maxRows={MAX_ROWS}
          onOpen={(row, bucketIndex) => setDetail({ row, bucketIndex })}
        />
      )}

      <BiDetailDialog detail={detail} win={dialogWin} matrixParams={params} allowZoom={false} onClose={() => setDetail(null)} onDrill={drill} onZoom={() => undefined} />
    </section>
  );
};
