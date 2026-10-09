import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { InlineError, Skeleton } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { checklistInstanceApi } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { formatPercent, parseDateParam } from '../analytics/analyticsDisplay';
import { NEEDS_ATTENTION_BELOW } from '../analytics/useOwnerRankings';
import { cn } from '@/lib/utils';
import type { ScoreScope } from './scoreFigures';

const toneText = (rate: number | null) =>
  rate == null ? 'text-text-light' : rate >= 80 ? 'text-success' : rate >= NEEDS_ATTENTION_BELOW ? 'text-warning' : 'text-danger';

const shortDay = (day: string) => {
  const d = parseDateParam(day);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : day;
};

/**
 * The checklists behind a score, weakest first, each opening its own run. Loaded only once the popup
 * is open, so the grids stay light.
 */
export const ScoreRunsList = ({ scope }: { scope: ScoreScope }) => {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ['analytics', 'score-runs', scope.from, scope.to, scope.storeId ?? '', scope.departmentId ?? ''],
    queryFn: () => checklistInstanceApi.getScoreRuns(scope.from, scope.to, scope.storeId, scope.departmentId).then((r) => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (query.isPending) {
    return <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }
  if (query.isError) {
    return <InlineError message="Could not load the checklists behind this score." onRetry={() => void query.refetch()} />;
  }
  const { runs, total } = query.data;
  if (runs.length === 0) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs font-display text-text-muted">No checklists were due in this period.</p>;
  }

  return (
    <section aria-label="Checklists behind this score" className="flex flex-col gap-2">
      <h3 className="text-sm font-display font-bold text-text">
        Checklists behind it <span className="font-semibold text-text-muted tabular-nums">{total == null ? `(weakest ${runs.length})` : `(${runs.length})`}</span>
      </h3>
      <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              to={`/checklists/${run.id}`}
              className="flex items-center gap-3 min-h-12 rounded-lg border border-border/60 bg-surface px-3 py-2 transition-colors duration-150 hover:border-primary-400/60 hover:bg-primary-500/5 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-display font-semibold text-text">{run.title}</span>
                <span className="block truncate text-xs font-display text-text-muted">{run.storeName} · {shortDay(run.day)} · {run.doneItems}/{run.totalItems} done</span>
              </span>
              <span className="flex shrink-0 flex-col items-end leading-tight tabular-nums">
                <span className={cn('text-sm font-display font-bold', toneText(run.completionRate))}>{formatPercent(run.completionRate)}</span>
                <span className={cn('text-xs font-display', toneText(run.complianceRate))}>{formatPercent(run.complianceRate)}</span>
              </span>
              <ChevronRight size={14} className="shrink-0 text-text-light" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs font-display text-text-muted">Top number is completion, the one below is compliance.</p>
    </section>
  );
};
