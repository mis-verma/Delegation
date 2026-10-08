import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { EmptyState, InlineError, Skeleton, ToggleChip } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { checklistInstanceApi, type ChecklistDepartmentMonthlyRow } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { toDateParam, formatPercent } from '../analytics/analyticsDisplay';
import { NEEDS_ATTENTION_BELOW } from '../analytics/useOwnerRankings';
import { cn } from '@/lib/utils';

const GOOD_FROM = 80;
const toneOf = (rate: number | null) =>
  rate == null ? 'text-text-light' : rate >= GOOD_FROM ? 'text-success' : rate >= NEEDS_ATTENTION_BELOW ? 'text-warning' : 'text-danger';
const ratio = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

const SPANS = [
  { months: 3, label: 'Last 3 months' },
  { months: 6, label: 'Last 6 months' },
  { months: 12, label: 'Last 12 months' },
] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM' for each month from the first to the last of the span, ending this month.
const monthKeys = (count: number, today: Date) => {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
};
const monthHead = (key: string) => ({ month: MONTH_NAMES[Number(key.slice(5, 7)) - 1], year: key.slice(2, 4) });

const STICKY = 'sticky left-0 z-10 bg-surface';

const ScoreCell = ({ completion, compliance, title }: { completion: number | null; compliance: number | null; title?: string }) => (
  <td className="px-2 py-2 text-center font-display tabular-nums whitespace-nowrap" title={title}>
    {completion == null && compliance == null ? (
      <span className="text-sm text-text-light" aria-label="Nothing due">-</span>
    ) : (
      <>
        <span className={cn('block text-sm font-semibold', toneOf(completion))}>{formatPercent(completion)}</span>
        <span className={cn('block text-xs', toneOf(compliance))}>{formatPercent(compliance)}</span>
      </>
    )}
  </td>
);

/**
 * Department by month: for each department, the completion score (how much checklist work was done)
 * and the compliance score (how much of the checked answers were right), month by month.
 */
export const DepartmentMonthlySection = () => {
  const { token } = useAuth();
  const [months, setMonths] = useState<number>(6);

  const keys = useMemo(() => monthKeys(months, new Date()), [months]);
  const from = `${keys[0]}-01`;
  const to = toDateParam(new Date());

  const query = useQuery({
    queryKey: ['analytics', 'department-monthly', from, to],
    queryFn: () => checklistInstanceApi.getDepartmentMonthly(from, to).then((r) => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
    const byDept = new Map<string, { name: string; cells: Map<string, ChecklistDepartmentMonthlyRow> }>();
    for (const r of query.data ?? []) {
      let entry = byDept.get(r.departmentId);
      if (!entry) {
        entry = { name: r.departmentName, cells: new Map() };
        byDept.set(r.departmentId, entry);
      }
      entry.cells.set(r.month, r);
    }
    return [...byDept.entries()]
      .map(([id, e]) => {
        let done = 0, total = 0, good = 0, scored = 0;
        e.cells.forEach((c) => { done += c.doneItems; total += c.totalItems; good += c.weightedGood; scored += c.weightedScored; });
        return { id, name: e.name, cells: e.cells, completion: ratio(done, total), compliance: ratio(good, scored) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query.data]);

  return (
    <section aria-labelledby="dept-monthly-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="flex flex-col gap-0.5">
          <h2 id="dept-monthly-heading" className="text-base sm:text-lg font-display font-bold text-text">Departments by month</h2>
          <p className="text-xs font-display text-text-muted">
            Top number is completion, small number below is compliance. A run shared by people in two departments counts in both.
          </p>
        </div>
        <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-2">
          {SPANS.map((s) => (
            <ToggleChip key={s.months} on={months === s.months} onClick={() => setMonths(s.months)}>{s.label}</ToggleChip>
          ))}
        </div>
      </div>

      {query.isError && !query.data ? (
        <InlineError message="Could not load the department figures." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title="No department figures yet" description="Checklist runs need people assigned, and those people need a department." />
      ) : (
        <div className={cn('overflow-x-auto rounded-2xl border border-border bg-surface', query.isFetching && 'opacity-70 transition-opacity')}>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={cn(STICKY, 'px-4 py-3 text-left font-display font-semibold text-xs text-text-muted min-w-36')}>Department</th>
                <th scope="col" className="px-3 py-3 text-center font-display font-semibold text-xs text-text-muted whitespace-nowrap">Overall</th>
                {keys.map((k) => {
                  const h = monthHead(k);
                  return (
                    <th key={k} scope="col" className="px-2 py-2 text-center font-display font-semibold text-xs text-text-muted whitespace-nowrap min-w-16">
                      <span className="block">{h.month}</span>
                      <span className="block font-medium opacity-70">{h.year}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 hover:bg-surface-hover/50 transition-colors motion-reduce:transition-none">
                  <th scope="row" className={cn(STICKY, 'px-4 py-2 text-left font-display font-medium text-sm text-text whitespace-nowrap')}>{row.name}</th>
                  <ScoreCell completion={row.completion} compliance={row.compliance} />
                  {keys.map((k) => {
                    const c = row.cells.get(k);
                    return (
                      <ScoreCell
                        key={k}
                        completion={c ? ratio(c.doneItems, c.totalItems) : null}
                        compliance={c ? ratio(c.weightedGood, c.weightedScored) : null}
                        title={c ? `${c.doneItems} of ${c.totalItems} items done` : 'Nothing due'}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
