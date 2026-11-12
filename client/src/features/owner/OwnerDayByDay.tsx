import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { InlineError, Skeleton } from '../../components';
import { scoreApi, type TrendBucket } from '../../api/scores';
import { HEAT_KEY, heatFill, heatLook } from '../../lib/heatScale';
import { formatPct } from '../../lib/percent';
import { MODULE_LABEL } from '../../lib/scoreLabels';
import { SCORE_QUERY_OPTIONS } from '../dashboard/scoreQueries';
import { useOrgToday } from '../checklist/useOrgToday';
import { shiftDay, shortDay } from './ownerWindow';
import { PeriodTag } from './PeriodTag';

const TREND_DAYS = 7;
const MODULES = ['checklist', 'ticket', 'delegation'] as const;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GRID = 'grid grid-cols-[minmax(4.5rem,auto)_repeat(7,minmax(0,1fr))] items-center gap-1 sm:grid-cols-[minmax(6rem,auto)_repeat(7,minmax(0,1fr))] sm:gap-1.5';

type RowKey = 'all' | (typeof MODULES)[number];

const ROWS: readonly { key: RowKey; label: string }[] = [
  { key: 'all', label: 'All work' },
  ...MODULES.map((m) => ({ key: m, label: MODULE_LABEL[m] })),
];

const valueOf = (b: TrendBucket, key: RowKey): number | null => {
  if (key === 'all') return b.overall ?? null;
  const m = b[key];
  return m.due <= 0 ? null : m.score;
};

const weekdayOf = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';

const Cell = ({ value, day, row, strong }: { value: number | null; day: string; row: string; strong: boolean }) => {
  const text = `${row}, ${weekdayOf(day)} ${shortDay(day)}: ${value === null ? 'nothing due' : formatPct(value)}`;
  return (
    <span
      role="cell"
      title={text}
      style={heatLook(value)}
      className={cn(
        'flex h-9 min-w-0 items-center justify-center rounded-md t-meta font-display tabular-nums leading-none sm:h-10',
        strong ? 'font-bold' : 'font-semibold',
        value === null && 'bg-surface-hover/50 text-text-light',
      )}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {value === null ? <span className="block size-1 rounded-full bg-current" /> : Math.round(value)}
      </span>
    </span>
  );
};

export const OwnerDayByDay = () => {
  const today = useOrgToday();
  const from = shiftDay(today, -(TREND_DAYS - 1));
  const trend = useQuery({
    queryKey: ['scores', 'trend', 'org', 'me', 'day', from, today],
    queryFn: () => scoreApi.trend({ scope: 'org', period: 'day', from, to: today }),
    ...SCORE_QUERY_OPTIONS,
  });
  const buckets = trend.data?.buckets ?? [];
  const rows = ROWS.filter((r) => r.key !== 'all' || buckets.some((b) => b.overall !== undefined));

  return (
    <section aria-labelledby="owner-week-heading" className="flex flex-col gap-3 border-t border-border/40 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="owner-week-heading" className="t-card font-display font-bold text-text">Day by day</h3>
        <PeriodTag label="Last 7 days" />
      </div>

      {trend.isError && !trend.data ? (
        <InlineError message="Couldn't load the last 7 days." onRetry={() => void trend.refetch()} />
      ) : !trend.data ? (
        <div className="flex flex-col gap-1.5" role="status" aria-label="Loading the last 7 days">
          {ROWS.map((r) => (
            <div key={r.key} className={GRID}>
              <Skeleton className="h-4 w-16" />
              {Array.from({ length: TREND_DAYS }, (_, i) => <Skeleton key={i} className="h-9 rounded-md sm:h-10" />)}
            </div>
          ))}
        </div>
      ) : (
        <div role="table" aria-label="Company score for each of the last 7 days" className="flex flex-col gap-1 sm:gap-1.5">
          <div role="row" className={GRID}>
            <span role="columnheader" className="sr-only">Work</span>
            {buckets.map((b) => {
              const isToday = b.from === today;
              return (
                <span key={b.from} role="columnheader" className="flex flex-col items-center gap-0.5 pb-1 leading-none">
                  <span className={cn('t-meta font-display font-medium', isToday ? 'text-primary-700 dark:text-primary-300' : 'text-text-light')}>
                    <span className="sm:hidden">{weekdayOf(b.from).slice(0, 1)}</span>
                    <span className="max-sm:hidden">{isToday ? 'Today' : weekdayOf(b.from)}</span>
                  </span>
                  <span className={cn('t-meta font-display font-semibold tabular-nums', isToday ? 'text-primary-700 dark:text-primary-300' : 'text-text-secondary')}>
                    {Number(b.from.slice(8, 10))}
                  </span>
                </span>
              );
            })}
          </div>

          {rows.map((r) => {
            const isAll = r.key === 'all';
            return (
              <div key={r.key} role="row" className={cn(GRID, isAll && 'border-b border-border/50 pb-1.5 sm:pb-2')}>
                <span role="rowheader" className={cn('min-w-0 truncate pr-1 t-meta font-display', isAll ? 'font-bold text-text' : 'font-semibold text-text-secondary')}>
                  {r.label}
                </span>
                {buckets.map((b) => <Cell key={b.from} value={valueOf(b, r.key)} day={b.from} row={r.label} strong={isAll} />)}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 t-meta font-medium text-text-muted" aria-label="Colour key">
        <span className="font-display font-semibold text-text-secondary">Score</span>
        {HEAT_KEY.map(({ level, label }) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-md" style={{ background: heatFill(level) }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="flex size-3.5 items-center justify-center rounded-md bg-surface-hover/60 text-text-light" aria-hidden="true">
            <span className="size-1 rounded-full bg-current" />
          </span>
          Nothing due
        </span>
      </div>
    </section>
  );
};
