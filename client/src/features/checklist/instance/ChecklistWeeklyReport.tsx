import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CalendarCheck2, CalendarOff, Check, ChevronLeft, ChevronRight, Clock, Minus, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, GradientIconTile, SelectDropdown, Skeleton } from '../../../components';
import { useStoresQuery, useWeeklyReportQuery } from '../hook';
import { rateToneClass, todayPeriodBoundIso } from '../checklistDisplay';
import type { WeeklyCell, WeeklyCellState } from '../../../api/checklistInstances';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

// One look per state. Colour is never the only signal: each carries its own mark and a word in the
// tooltip / screen-reader label.
const STATE: Record<WeeklyCellState, { label: string; tone: string; icon: typeof Check | null }> = {
  done: { label: 'Filled on time', tone: 'text-success', icon: Check },
  late: { label: 'Filled late', tone: 'text-warning', icon: Clock },
  missed: { label: 'Not filled', tone: 'text-danger', icon: X },
  open: { label: 'In progress', tone: 'text-primary-500', icon: null },
  holiday: { label: 'Holiday', tone: 'text-text-light', icon: CalendarOff },
  off: { label: 'No run', tone: 'text-text-light', icon: null },
  upcoming: { label: 'Not due yet', tone: 'text-text-light', icon: null },
};

const Ring = ({ percent, tone, dashed, size = 28, children }: { percent: number; tone: string; dashed?: boolean; size?: number; children?: React.ReactNode }) => {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn('relative inline-flex items-center justify-center shrink-0', tone)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-border" strokeDasharray={dashed ? '3 4' : undefined} />
        {!dashed && percent > 0 && (
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="currentColor" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(percent, 100) / 100)} />
        )}
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
};

const Cell = ({ cell, name }: { cell: WeeklyCell; name: string }) => {
  const s = STATE[cell.state];
  const percent = cell.total ? Math.round((cell.done / cell.total) * 100) : 0;
  const label = `${name}, ${shortDate(cell.date)}: ${s.label}${cell.total ? `, ${cell.done} of ${cell.total} done` : ''}`;
  const Icon = s.icon;

  if (!cell.runId) {
    return (
      <span className="inline-flex items-center justify-center size-10 text-text-light" title={`${shortDate(cell.date)}: ${s.label}`} aria-label={label}>
        {cell.state === 'holiday' ? <Ring percent={0} tone={s.tone} dashed><CalendarOff size={12} /></Ring> : <Minus size={14} aria-hidden />}
      </span>
    );
  }
  const full = cell.state === 'done' || cell.state === 'late';
  return (
    <Link
      to={`/checklists/${cell.runId}`}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center size-10 rounded-lg hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <Ring percent={full ? 100 : percent} tone={s.tone}>{Icon && <Icon size={12} strokeWidth={3} />}</Ring>
    </Link>
  );
};

export const ChecklistWeeklyReport = () => {
  const today = useMemo(() => todayPeriodBoundIso().slice(0, 10), []);
  const thisMonday = mondayOf(today);
  const [weekStart, setWeekStart] = useState(thisMonday);
  const [storeId, setStoreId] = useState('');
  const { data: stores = [] } = useStoresQuery();
  const { data, isPending, isError, refetch } = useWeeklyReportQuery(weekStart, storeId || undefined);

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const range = `${shortDate(weekStart)} to ${shortDate(addDays(weekStart, 6))}, ${addDays(weekStart, 6).slice(0, 4)}`;

  const navButton = 'flex items-center justify-center size-11 sm:size-9 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={CalendarCheck2} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Weekly fill report</h1>
          <p className="text-sm text-text-muted mt-0.5">Who filled their daily checklists, day by day.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" className={navButton} aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} aria-hidden /></button>
          <span className="min-w-44 text-center text-sm font-display font-semibold text-text tabular-nums">{range}</span>
          <button type="button" className={navButton} aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} aria-hidden /></button>
          {weekStart !== thisMonday && (
            <button type="button" onClick={() => setWeekStart(thisMonday)} className="h-11 sm:h-9 px-3 rounded-lg text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
              This week
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5 w-full sm:w-52">
          <label className="text-xs font-display font-medium text-text-secondary">Store</label>
          <SelectDropdown
            value={storeId}
            onChange={setStoreId}
            options={[{ value: '', label: 'All stores' }, ...stores.map(s => ({ value: s.id, label: s.name }))]}
            aria-label="Filter by store"
          />
        </div>
      </div>

      {summary && summary.due > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl border border-border bg-border overflow-hidden">
          {[
            { label: 'On-time rate', value: summary.rate === null ? '-' : `${summary.rate}%`, tone: summary.rate === null ? '' : rateToneClass(summary.rate) },
            { label: 'Filled on time', value: summary.onTime, tone: 'text-success' },
            { label: 'Filled late', value: summary.late, tone: summary.late ? 'text-warning' : '' },
            { label: 'Not filled', value: summary.missed, tone: summary.missed ? 'text-danger' : '' },
          ].map(t => (
            <div key={t.label} className="flex flex-col gap-0.5 p-3.5 bg-surface">
              <dt className="text-xs font-display text-text-muted">{t.label}</dt>
              <dd className={cn('text-xl font-display font-bold tabular-nums text-text', t.tone)}>{t.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {isPending && <Skeleton className="h-64 w-full rounded-xl" />}

      {isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display">
          <AlertCircle size={15} aria-hidden />
          <span className="flex-1">We couldn't load the report.</span>
          <button type="button" onClick={() => refetch()} className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40">Retry</button>
        </div>
      )}

      {!isPending && !isError && rows.length === 0 && (
        <EmptyState icon={SearchX} title="No daily checklists this week" description="Try another week or store." />
      )}

      {rows.length > 0 && data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-3 text-xs font-display font-semibold text-text-secondary min-w-48">Checklist</th>
                {data.days.map((d, i) => (
                  <th key={d} scope="col" className="px-1 py-2 text-center min-w-12" title={data.holidays[d]}>
                    <span className={cn('flex flex-col items-center text-[11px] font-display leading-tight', d === today ? 'text-primary-600 dark:text-primary-300 font-bold' : 'text-text-muted font-medium')}>
                      {WEEKDAYS[i]}
                      <span className="tabular-nums text-sm">{d.slice(8)}</span>
                      {data.holidays[d] && <span className="text-[10px] text-text-light">Holiday</span>}
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-center text-xs font-display font-semibold text-text-secondary min-w-20">Week</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.definitionId}-${row.storeId}-${row.scopeKey}`} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2 font-normal">
                    <span className="block text-sm font-display font-semibold text-text leading-snug line-clamp-2">{row.name}</span>
                    <span className="block text-xs text-text-muted">{row.storeName}</span>
                  </th>
                  {row.cells.map(cell => (
                    <td key={cell.date} className="px-1 py-1 text-center"><Cell cell={cell} name={row.name} /></td>
                  ))}
                  <td className="px-3 py-1 text-center">
                    {row.rate === null ? (
                      <span className="text-text-light">-</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Ring percent={row.rate} tone={rateToneClass(row.rate)} size={30} />
                        <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(row.rate))}>{row.rate}%</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted font-display" aria-label="Legend">
          {(['done', 'late', 'missed', 'open', 'holiday'] as WeeklyCellState[]).map(k => {
            const s = STATE[k];
            const Icon = s.icon;
            return (
              <li key={k} className="inline-flex items-center gap-1.5">
                <Ring percent={k === 'open' ? 50 : k === 'missed' ? 40 : 100} tone={s.tone} dashed={k === 'holiday'} size={18}>
                  {Icon && <Icon size={8} strokeWidth={3.5} />}
                </Ring>
                {s.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
