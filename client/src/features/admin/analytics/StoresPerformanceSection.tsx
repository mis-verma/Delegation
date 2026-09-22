import { useMemo } from 'react';
import { Trophy, AlertTriangle, AlertCircle } from 'lucide-react';
import { Skeleton } from '../../../components';
import { useOwnerRankings, type RankedRow } from './useOwnerRankings';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import type { GroupBy } from './GroupByControl';

interface StoresPerformanceSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
}

const rankBadges = (rows: RankedRow[]) => {
  const scored = rows.filter((r) => r.overall != null);
  const topId = scored.length >= 2 ? [...scored].sort((a, b) => (b.overall! - a.overall!))[0]?.id : null;
  const lowId = scored.length >= 2 ? [...scored].sort((a, b) => (a.overall! - b.overall!))[0]?.id : null;
  return { topId, lowId };
};

const RankBadge = ({ isTop, isLow }: { isTop: boolean; isLow: boolean }) => {
  if (isTop) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold px-1.5 py-0.5 rounded bg-gradient-to-br from-success/10 to-success/20 border border-success/25 text-success">
        <Trophy size={10} /> Top
      </span>
    );
  }
  if (isLow) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-display font-bold px-1.5 py-0.5 rounded bg-gradient-to-br from-danger/10 to-danger/20 border border-danger/25 text-danger">
        <AlertTriangle size={10} /> Needs attention
      </span>
    );
  }
  return null;
};

const RankedTable = ({ title, subtitle, rows, isPending, isError, emptyLabel, nameColumnLabel, secondaryLabel }: {
  title: string;
  subtitle: string;
  rows: RankedRow[];
  isPending: boolean;
  isError: boolean;
  emptyLabel: string;
  nameColumnLabel: string;
  secondaryLabel: string;
}) => {
  // Best "Overall" first — "who's top, who's low" reads directly off row order instead of
  // requiring a mental sort of an unordered list.
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.overall ?? -Infinity) - (a.overall ?? -Infinity)), [rows]);
  const { topId, lowId } = rankBadges(sorted);

  return (
    <div className="flex flex-col gap-2">
      <div className="px-1">
        <p className="text-sm font-display font-bold text-text">{title}</p>
        <p className="text-xs font-display font-medium text-text-muted">{subtitle}</p>
      </div>

      <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface overflow-hidden">
        {isError ? (
          // Used to fall straight through to the empty-table state ("No department/store data
          // yet.") on a failed request — identical to a genuinely empty org, with no way to tell
          // the two apart.
          <div className="flex items-start gap-3 p-5">
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-sm font-display font-medium text-danger">Couldn&rsquo;t load this table. Try refreshing.</p>
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-primary-800 to-primary-600 text-white">
                    <th className="text-left font-display font-medium px-5 py-3 whitespace-nowrap">{nameColumnLabel}</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">Overall</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">Tickets</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">{secondaryLabel}</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">Open issues</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">Avg TAT</th>
                    <th className="text-right font-display font-medium px-5 py-3 whitespace-nowrap">SLA met</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-text-muted font-display">{emptyLabel}</td>
                    </tr>
                  ) : (
                    sorted.map((row) => (
                      <tr key={row.id} className="border-t border-border/60 hover:bg-surface-hover/50 transition-colors">
                        <td className="px-5 py-3 font-display font-medium text-text whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {row.name}
                            <RankBadge isTop={row.id === topId} isLow={row.id === lowId} />
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-display font-bold tabular-nums text-text">
                          {row.overall != null ? `${row.overall}%` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-display tabular-nums text-text">
                          {row.ticketCompletion != null ? `${row.ticketCompletion}%` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-display tabular-nums text-text">
                          {row.secondaryRate != null ? `${row.secondaryRate}%` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-display tabular-nums text-text">{row.openIssues}</td>
                        <td className="px-5 py-3 text-right font-display tabular-nums text-text">
                          {row.avgTat != null ? `${row.avgTat}h` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-display tabular-nums text-text">
                          {row.slaMet != null ? `${row.slaMet}%` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: card stack instead of a cramped scrolling table */}
            <div className="md:hidden divide-y divide-border/60">
              {sorted.length === 0 ? (
                <p className="px-5 py-10 text-center text-text-muted font-display text-sm">{emptyLabel}</p>
              ) : (
                sorted.map((row) => (
                  <div key={row.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-display font-medium text-text text-sm truncate">{row.name}</p>
                        <RankBadge isTop={row.id === topId} isLow={row.id === lowId} />
                      </div>
                      <span className="text-sm font-display font-bold tabular-nums text-text shrink-0">
                        {row.overall != null ? `${row.overall}%` : '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-display text-text-muted tracking-wide text-[10px]">Tickets</span>
                        <span className="font-display font-medium tabular-nums text-text">
                          {row.ticketCompletion != null ? `${row.ticketCompletion}%` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-display text-text-muted tracking-wide text-[10px]">{secondaryLabel}</span>
                        <span className="font-display font-medium tabular-nums text-text">
                          {row.secondaryRate != null ? `${row.secondaryRate}%` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-display text-text-muted tracking-wide text-[10px]">Open issues</span>
                        <span className="font-display font-medium tabular-nums text-text">{row.openIssues}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-display text-text-muted tracking-wide text-[10px]">Avg TAT</span>
                        <span className="font-display font-medium tabular-nums text-text">
                          {row.avgTat != null ? `${row.avgTat}h` : '—'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-display text-text-muted tracking-wide text-[10px]">SLA met</span>
                        <span className="font-display font-medium tabular-nums text-text">
                          {row.slaMet != null ? `${row.slaMet}%` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// The owner-level view: real numbers, ranked, with who's-top/who's-low called out directly —
// both cut by department (who manages the work) and by store (where the work happens). Each
// row's "Overall" score is a genuine combination of every work type that dimension actually
// carries — Tickets + Delegations for a department, Tickets + Checklists for a store — not a
// single proxy number standing in for all three. The two cuts combine different pairs because
// that's what the data model actually supports: Task has a department but no store, Checklist
// instances have a store but no department (see ChecklistDefinition) — there's no dimension both
// Delegations and Checklists carry at once to combine all three into either table honestly.
// The same ranking (useOwnerRankings) also backs a compact glance card directly on the Overview
// dashboard itself (PerformanceLeadersCard) — this tab is the drill-in for the full ranked table.
export const StoresPerformanceSection = ({ groupBy, from, to }: StoresPerformanceSectionProps) => {
  const { departmentRows, storeRows, departmentsPending, storesPending, departmentsError, storesError } = useOwnerRankings(groupBy, from, to);

  // Org-wide audit score, kept as page-level context — see the per-store real figures below for
  // the actual per-row breakdown; this is just "how's checklist compliance doing overall." Same
  // hook (and so the same cache key/request) the org-wide audit KPI elsewhere on this page already
  // uses — this used to be its own inline useQuery with a different key ('org-wide' literal vs.
  // the shared key), so the two fired as two independent requests for the exact same data.
  const { data: auditRows, isPending: auditPending, isError: auditError } = useChecklistInstanceComplianceReportQuery(groupBy, from, to);
  const latestAudit = auditRows?.[auditRows.length - 1];
  const auditScore = latestAudit?.completionRate != null ? Math.round(latestAudit.completionRate) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-display font-medium text-text-muted">
          "Overall" blends ticket and delegation completion for departments, or ticket and checklist completion for stores — best performers first
        </p>
        <p className="text-xs font-display font-semibold text-text-secondary shrink-0">
          Org-wide audit score:{' '}
          <span className={auditError ? 'text-danger' : 'text-text tabular-nums'}>
            {auditError ? "couldn't load" : auditPending ? '…' : auditScore != null ? `${auditScore}%` : '—'}
          </span>
        </p>
      </div>

      <RankedTable
        title="Departments"
        subtitle="Blends ticket and delegation completion"
        rows={departmentRows}
        isPending={departmentsPending}
        isError={departmentsError}
        emptyLabel="No department data yet."
        nameColumnLabel="Department"
        secondaryLabel="Delegations"
      />

      <RankedTable
        title="Stores"
        subtitle="Blends ticket and checklist completion"
        rows={storeRows}
        isPending={storesPending}
        isError={storesError}
        emptyLabel="No store data yet."
        nameColumnLabel="Store"
        secondaryLabel="Checklist"
      />
    </div>
  );
};
