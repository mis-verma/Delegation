import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck2, CalendarOff, Check, Clock, Minus, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, EmptyState, InlineError, PageHeader, PANEL_CLASS, PeriodStepper, Skeleton } from '../../../components';
import { useStoresQuery, useWeeklyReportQuery } from '../hook';
import { rateToneClass, todayPeriodBoundIso } from '../checklistDisplay';
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
  const label = `${name}, ${shortDate(cell.date)}: ${s.label}${cell.total ? `, ${cell.done} of ${cell.total} done` : ''}`;
  const Icon = s.icon;

  if (!cell.runId) {
    return (
      <span className={cn(CELL_BOX, 'text-text-light')} title={`${shortDate(cell.date)}: ${s.label}`} aria-label={label}>
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
  </tr>
));
MatrixRow.displayName = 'MatrixRow';

const STRIP = cn(PANEL_CLASS, 'grid grid-cols-2 sm:grid-cols-4 gap-px bg-border overflow-hidden');

// Same strip and matrix shapes as the real thing, so the page does not jump when the report lands.
const ReportSkeleton = () => (
  <>
    <div className={STRIP}>
      {Array.from({ length: 4 }).map((_, i) => (
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
  const today = useMemo(() => todayPeriodBoundIso().slice(0, 10), []);
  const thisMonday = useMemo(() => mondayOf(today), [today]);
  const [weekStart, setWeekStart] = useState(thisMonday);
  const [storeId, setStoreId] = useState('');
  const { data: stores = [], isPending: storesPending } = useStoresQuery();
  const { data, isPending, isError, isFetching, refetch } = useWeeklyReportQuery(weekStart, storeId || undefined);

  const storeOptions = useMemo(() => stores.map(s => ({ value: s.id, label: s.name })), [stores]);
  const goPrev = useCallback(() => setWeekStart(w => addDays(w, -7)), []);
  const goNext = useCallback(() => setWeekStart(w => addDays(w, 7)), []);
  const goToday = useCallback(() => setWeekStart(thisMonday), [thisMonday]);

  const rows = data?.rows;
  const summary = data?.summary;
  const range = `${shortDate(weekStart)} to ${shortDate(addDays(weekStart, 6))}, ${addDays(weekStart, 6).slice(0, 4)}`;
  const summaryTiles = useMemo(() => summary && [
    { label: 'On-time rate', value: summary.rate === null ? '-' : `${summary.rate}%`, tone: summary.rate === null ? '' : rateToneClass(summary.rate) },
    { label: 'Filled on time', value: summary.onTime, tone: 'text-success' },
    { label: 'Filled late', value: summary.late, tone: summary.late ? 'text-warning' : '' },
    { label: 'Not filled', value: summary.missed, tone: summary.missed ? 'text-danger' : '' },
  ], [summary]);

  // The empty week gets the one recovery that fits: drop the store filter, else jump back to now.
  const emptyAction = storeId
    ? { label: 'Show all stores', onClick: () => setStoreId('') }
    : weekStart !== thisMonday
      ? { label: 'Go to this week', onClick: goToday }
      : undefined;

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto">
      <PageHeader icon={CalendarCheck2} title="Weekly Report" subtitle="Who filled their daily checklists, day by day." />

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
        <div className="flex flex-col gap-1.5 w-full sm:w-52">
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
      </div>

      {isPending && <ReportSkeleton />}

      {isError && <InlineError message="We couldn't load the weekly report. Check your connection and try again." onRetry={() => refetch()} />}

      {!isPending && !isError && rows?.length === 0 && (
        <EmptyState icon={SearchX} title="No daily checklists this week" description="Try another week or store." action={emptyAction} />
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

          <div className={cn(PANEL_CLASS, 'overflow-x-auto')}>
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
                {rows.map(row => <MatrixRow key={`${row.definitionId}-${row.storeId}-${row.scopeKey}`} row={row} />)}
              </tbody>
            </table>
          </div>

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
