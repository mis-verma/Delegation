import { Trophy, AlertTriangle, AlertCircle, Building2, Store, ArrowRight } from 'lucide-react';
import { Skeleton } from '../../../components';
import { useOwnerRankings, type RankedRow } from './useOwnerRankings';
import type { GroupBy } from './GroupByControl';

interface PerformanceLeadersCardProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** Jumps straight to the full ranked table (the Stores tab below) instead of this card
   *  duplicating it — this is the glance view, that's the drill-in. */
  onViewFull: () => void;
}

const pick = (rows: RankedRow[]) => {
  const scored = rows.filter((r) => r.overall != null);
  if (scored.length < 2) return { top: null, low: null };
  const sorted = [...scored].sort((a, b) => (b.overall! - a.overall!));
  return { top: sorted[0], low: sorted[sorted.length - 1] };
};

const LeaderEntry = ({ icon: Icon, tone, label, row }: {
  icon: typeof Trophy;
  tone: 'success' | 'danger';
  label: string;
  row: RankedRow | null;
}) => (
  <div className="flex items-center gap-2.5 min-w-0">
    <span className={`flex items-center justify-center size-8 rounded-lg border shrink-0 ${tone === 'success' ? 'bg-gradient-to-br from-success/10 to-success/20 border-success/25 text-success' : 'bg-gradient-to-br from-danger/10 to-danger/20 border-danger/25 text-danger'}`}>
      <Icon size={14} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-display font-semibold tracking-wide text-text-muted">{label}</p>
      {row ? (
        <p className="text-sm font-display font-bold text-text truncate">
          {row.name} <span className="font-medium text-text-muted tabular-nums">· {row.overall}%</span>
        </p>
      ) : (
        <p className="text-sm font-display font-medium text-text-muted">Not enough data yet</p>
      )}
    </div>
  </div>
);

const DimensionColumn = ({ icon: Icon, title, rows, isPending, isError, className = '' }: {
  icon: typeof Building2;
  title: string;
  rows: RankedRow[];
  isPending: boolean;
  isError: boolean;
  className?: string;
}) => {
  const { top, low } = pick(rows);
  return (
    <div className={`flex flex-col gap-3 flex-1 ${className}`}>
      <div className="flex items-center gap-2 px-1">
        <Icon size={14} className="text-text-muted" />
        <p className="text-xs font-display font-bold text-text">{title}</p>
      </div>
      {isError ? (
        // A failed request used to render identically to "not enough data yet" — both showed the
        // same plain muted sentence, with no way to tell a real request failure from a genuinely
        // thin dataset.
        <div className="flex items-start gap-2 p-2.5 bg-danger/10 border border-danger/30 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
          <p className="text-xs font-display font-medium text-danger">Couldn&rsquo;t load this. Try refreshing.</p>
        </div>
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <LeaderEntry icon={Trophy} tone="success" label="Top" row={top} />
          <LeaderEntry icon={AlertTriangle} tone="danger" label="Needs attention" row={low} />
        </div>
      )}
    </div>
  );
};

// The owner-level "who's top, who's low" summary, real and dynamic (per-store checklist data,
// per-department delegation data, both scoped to the page's own date range) — surfaced directly
// on the dashboard itself, not only reachable by switching into the Stores tab below. Same ranked
// data as StoresPerformanceSection's full tables (shared via useOwnerRankings); this is the glance
// view, "View full ranking" jumps straight to the drill-in table instead of duplicating it.
export const PerformanceLeadersCard = ({ groupBy, from, to, onViewFull }: PerformanceLeadersCardProps) => {
  const { departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError } = useOwnerRankings(groupBy, from, to);

  return (
    <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-display font-bold text-text">How stores &amp; departments are doing</p>
          <p className="text-xs font-display font-medium text-text-muted">Based on ticket and checklist completion — who's ahead, who needs a closer look</p>
        </div>
        <button
          type="button"
          onClick={onViewFull}
          className="inline-flex items-center gap-1 text-xs font-display font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors shrink-0 cursor-pointer"
        >
          See full ranking
          <ArrowRight size={13} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:divide-x sm:divide-border">
        <DimensionColumn icon={Building2} title="Departments" rows={departmentRows} isPending={departmentsPending} isError={departmentsError} />
        <DimensionColumn icon={Store} title="Stores" rows={storeRows} isPending={storesPending} isError={storesError} className="sm:pl-6" />
      </div>
    </div>
  );
};
