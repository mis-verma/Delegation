import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck2, CalendarOff, Check, Clock, Minus, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, EmptyState, InlineError, PageHeader, PANEL_CLASS, PeriodStepper, Skeleton } from '../../../components';
import { useStoresQuery, useWeeklyReportQuery } from '../hook';
import { useDepartmentsQuery } from '../../tickets/hook';
import { useAuth } from '../../../context/AuthContext';
import { WeeklyExportMenu } from './WeeklyExportMenu';
import { rateToneClass } from '../checklistDisplay';
import { useOrgToday } from '../useOrgToday';
import type { WeeklyCell, WeeklyCellState, WeeklyReport } from '../../../api/checklistInstances';

type WeeklyReportRow = WeeklyReport['rows'][number];

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Hoisted: building an Intl formatter is the expensive part, and every cell label formats a date.
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const shortDate = (date: string) => SHORT_DATE.format(new Date(`${date}T00:00:00Z`));

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

// size-11 on touch for a real tap target, back to the compact size-10 on desktop.
const CELL_BOX = 'inline-flex items-center justify-center size-11 sm:size-10';

const Cell = memo(({ cell, name }: { cell: WeeklyCell; name: string }) => {
  const s = STATE[cell.state];
  const percent = cell.total ? Math.round((cell.done / cell.total) * 100) : 0;
  const label = `${name}, ${shortDate(cell.date)}: ${s.label}${cell.total ? `, ${cell.done} of ${cell.total} done` : ''}${cell.compliance !== null ? `, compliance ${cell.compliance}%` : ''}`;
  const Icon = s.icon;

  if (!cell.runId) {
    return (
      <span role="img" className={cn(CELL_BOX, 'text-text-light')} title={`${shortDate(cell.date)}: ${s.label}`} aria-label={label}>
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
      className={cn(CELL_BOX, 'rounded-lg hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
    >
      <Ring percent={full ? 100 : percent} tone={s.tone}>{Icon && <Icon size={12} strokeWidth={3} />}</Ring>
    </Link>
  );
});
Cell.displayName = 'Cell';

const MatrixRow = memo(({ row }: { row: WeeklyReportRow }) => (
  <tr className="border-b border-border/60 last:border-0">
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
    <td className="px-3 py-1 text-center">
      {row.compliance === null ? (
        <span className="text-text-light" title="No answers were checked this week">-</span>
      ) : (
        <span className={cn('text-sm font-display font-bold tabular-nums', rateToneClass(row.compliance))}>{row.compliance}%</span>
      )}
    </td>
  </tr>
));
MatrixRow.displayName = 'MatrixRow';

const STRIP = cn(PANEL_CLASS, 'grid grid-cols-2 sm:grid-cols-5 gap-px bg-border overflow-hidden');

// Same strip and matrix shapes as the real thing, so the page does not jump when the report lands.
const ReportSkeleton = () => (
  <>
    <div className={STRIP}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3.5 bg-surface">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
    <div className={cn(PANEL_CLASS, 'flex flex-col min-h-64 overflow-hidden')}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Skeleton className="h-3 w-24 flex-1 max-w-48" />
        <Skeleton className="h-8 w-52 hidden sm:block" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2 min-h-14 border-b border-border/60 last:border-0">
          <div className="flex flex-col gap-1.5 flex-1 max-w-48">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, d) => <Skeleton key={d} className="size-7 rounded-full" />)}
          </div>
        </div>
      ))}
    </div>
  </>
);

export const ChecklistWeeklyReport = () => {
  // Kept fresh: a tab left open past midnight rolls over instead of highlighting yesterday.
  const today = useOrgToday();
  const thisMonday = useMemo(() => mondayOf(today), [today]);
  const [weekStart, setWeekStart] = useState(thisMonday);
  const [storeId, setStoreId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const { user } = useAuth();
  // Admin and PC pick any department; a department head is always held to their own on the server.
  const canPickDepartment = user?.role === 'ADMIN' || user?.role === 'PC';
  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data: departments = [], isPending: departmentsPending } = useDepartmentsQuery(canPickDepartment);
  const { data, isPending, isError, isFetching, refetch } = useWeeklyReportQuery(weekStart, storeId || undefined, canPickDepartment ? departmentId || undefined : undefined);

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => departments.map(d => ({ value: d.id, label: d.name })), [departments]);
  const goPrev = useCallback(() => setWeekStart(w => addDays(w, -7)), []);
  const goNext = useCallback(() => setWeekStart(w => addDays(w, 7)), []);
  const goToday = useCallback(() => setWeekStart(thisMonday), [thisMonday]);

  const rows = data?.rows;
  const holidayDays = useMemo(() => (data ? data.days.filter(d => data.holidays[d]) : []), [data]);
  const summary = data?.summary;
  const range = `${shortDate(weekStart)} to ${shortDate(addDays(weekStart, 6))}, ${addDays(weekStart, 6).slice(0, 4)}`;
  const summaryTiles = useMemo(() => summary && [
    { label: 'On-time rate', value: summary.rate === null ? '-' : `${summary.rate}%`, tone: summary.rate === null ? '' : rateToneClass(summary.rate) },
    { label: 'Compliance', value: summary.compliance === null ? '-' : `${summary.compliance}%`, tone: summary.compliance === null ? '' : rateToneClass(summary.compliance) },
    { label: 'Filled on time', value: summary.onTime, tone: 'text-success' },
    { label: 'Filled late', value: summary.late, tone: summary.late ? 'text-warning' : '' },
    { label: 'Not filled', value: summary.missed, tone: summary.missed ? 'text-danger' : '' },
  ], [summary]);

  // The empty week gets the one recovery that fits: drop the store filter, else jump back to now.
  const emptyAction = storeId || departmentId
    ? { label: 'Clear filters', onClick: () => { setStoreId(''); setDepartmentId(''); } }
    : weekStart !== thisMonday
      ? { label: 'Go to this week', onClick: goToday }
      : undefined;

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader icon={CalendarCheck2} title="Weekly Report" subtitle="Who filled their daily checklists, day by day, and how well." />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodStepper
          label={range}
          onPrev={goPrev}
          onNext={goNext}
          prevLabel="Previous week"
          nextLabel="Next week"
          todayLabel={weekStart !== thisMonday ? 'This week' : undefined}
          onToday={goToday}
        />
        <div className="flex flex-wrap items-end gap-3 w-full sm:w-auto">
          <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
            <label htmlFor="weekly-store" className="text-xs font-display font-medium text-text-secondary">Store</label>
            <Combobox
              id="weekly-store"
              value={storeId}
              onChange={setStoreId}
              options={storeOptions}
              emptyOptionLabel="All stores"
              isLoading={storesPending}
              className="h-11 rounded-xl"
            />
          </div>
          {canPickDepartment && (
            <div className="flex flex-col gap-1.5 flex-1 min-w-40 sm:flex-none sm:w-52">
              <label htmlFor="weekly-department" className="text-xs font-display font-medium text-text-secondary">Department</label>
              <Combobox
                id="weekly-department"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
                emptyOptionLabel="All departments"
                isLoading={departmentsPending}
                className="h-11 rounded-xl"
              />
            </div>
          )}
          <WeeklyExportMenu
            storeId={storeId || undefined}
            departmentId={canPickDepartment ? departmentId || undefined : undefined}
            storeName={stores.find(s => s.id === storeId)?.name}
            departmentName={canPickDepartment ? departments.find(d => d.id === departmentId)?.name : user?.role ? 'your department' : undefined}
          />
        </div>
      </div>

      {isPending && <ReportSkeleton />}

      {isError && <InlineError message="We couldn't load the weekly report. Check your connection and try again." onRetry={() => refetch()} />}

      {!isPending && !isError && rows?.length === 0 && (
        <EmptyState icon={SearchX} title="No daily checklists this week" description="Try another week, store or department." action={emptyAction} />
      )}

      {/* keepPreviousData holds the old week on screen while the next loads: dim it meanwhile. */}
      {data && !!rows?.length && (
        <div className={cn('flex flex-col gap-5 transition-opacity duration-200', isFetching && 'opacity-60')} aria-busy={isFetching}>
          {summary && summary.due > 0 && (
            <dl className={STRIP}>
              {summaryTiles?.map(t => (
                <div key={t.label} className="flex flex-col gap-0.5 p-3.5 bg-surface">
                  <dt className="text-xs font-display text-text-muted">{t.label}</dt>
                  <dd className={cn('text-xl font-display font-bold tabular-nums text-text', t.tone)}>{t.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {summary && summary.due === 0 && (
            <p className="text-xs font-display text-text-muted">Nothing was due this week.</p>
          )}
          {summary && summary.due > 0 && (
            <p className="text-xs font-display text-text-muted">
              On time is the share of due runs filled before their cutoff. Compliance is how well the checked answers were answered, with critical questions counted twice and sent-back ones counted as failed.
            </p>
          )}

          {/* A scroll area has to be reachable and named for keyboard and screen-reader users. */}
          <div role="region" aria-label="Weekly fill matrix, scrolls sideways" tabIndex={0} className={cn(PANEL_CLASS, 'overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Daily checklist fill status, week of {range}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-3 text-xs font-display font-semibold text-text-secondary min-w-48">Checklist</th>
                  {data.days.map((d, i) => (
                    <th key={d} scope="col" className="px-1 py-2 text-center min-w-12" title={data.holidays[d]}>
                      <span className={cn('flex flex-col items-center text-xs font-display leading-tight', d === today ? 'text-primary-600 dark:text-primary-300 font-bold' : 'text-text-muted font-medium')}>
                        {WEEKDAYS[i]}
                        <span className="tabular-nums text-sm">{d.slice(8)}</span>
                        {data.holidays[d] && <span className="text-xs text-text-light">Holiday</span>}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-center text-xs font-display font-semibold text-text-secondary min-w-20" title="Share of due runs filled on time">On time</th>
                  <th scope="col" className="px-3 py-3 text-center text-xs font-display font-semibold text-text-secondary min-w-20" title="How well the checked answers were answered">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <MatrixRow key={`${row.definitionId}-${row.storeId}-${row.scopeKey}`} row={row} />)}
              </tbody>
            </table>
          </div>

          {holidayDays.length > 0 && (
            <p className="text-xs font-display text-text-muted">
              Holiday: {holidayDays.map(d => `${shortDate(d)}, ${data.holidays[d]}`).join(' · ')}
            </p>
          )}

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
        </div>
      )}
    </div>
  );
};
