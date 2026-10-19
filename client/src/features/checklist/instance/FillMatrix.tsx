import { memo } from 'react';
import { Link } from 'react-router';
import { CalendarOff, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { formatPct } from '../../../lib/percent';
import { rateToneClass } from '../checklistDisplay';
import type { WeeklyCell, WeeklyCellState, WeeklyReport } from '../../../api/checklistInstances';
import { STATE } from './fillMatrixState';

type WeeklyReportRow = WeeklyReport['rows'][number];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const shortDate = (date: string) => SHORT_DATE.format(new Date(`${date}T00:00:00Z`));

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

const CELL_BOX = 'inline-flex items-center justify-center size-11 sm:size-10';

const Cell = memo(({ cell, name }: { cell: WeeklyCell; name: string }) => {
  const s = STATE[cell.state];
  const percent = cell.total ? Math.round((cell.done / cell.total) * 100) : 0;
  const stateLabel = cell.state === 'open' && cell.done === 0 ? 'Not started' : s.label;
  const label = `${name}, ${shortDate(cell.date)}: ${stateLabel}${cell.total ? `, ${cell.done} of ${cell.total} done` : ''}${cell.compliance !== null ? `, answers right ${formatPct(cell.compliance)}` : ''}`;
  const Icon = s.icon;

  if (cell.state === 'summary') {
    const due = cell.due ?? 0;
    const detail = due === 0 && !cell.open
      ? 'Nothing was due'
      : `${due} due: ${cell.onTime ?? 0} on time, ${cell.late ?? 0} late, ${cell.missed ?? 0} not filled${cell.open ? `, ${cell.open} still open (not counted yet)` : ''}${cell.compliance !== null ? `, answers right ${formatPct(cell.compliance)}` : ''}`;
    const monthName = new Date(`${cell.date}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`${name}, ${monthName}: ${detail}`}
            aria-label={`${name}, ${monthName}: ${detail}`}
            className={cn(CELL_BOX, 'w-14 sm:w-14 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}
          >
            {cell.completion == null
              ? <Minus size={14} className="text-text-light" aria-hidden />
              : <span className={cn('t-card font-display font-bold tabular-nums', rateToneClass(cell.completion))}>{formatPct(cell.completion)}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3">
          <p className="t-card font-display font-bold text-text">{name}</p>
          <p className="t-meta font-display font-medium text-text-muted">{monthName}</p>
          <p className="mt-2 t-meta font-display text-text-secondary">{detail}</p>
        </PopoverContent>
      </Popover>
    );
  }

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
    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 sm:px-4 py-1.5 font-normal">
      <span className="block t-card font-display font-semibold text-text leading-snug line-clamp-2">{row.name}</span>
      <span className="block t-meta text-text-muted">{row.storeName}</span>
    </th>
    {row.cells.map(cell => (
      <td key={cell.date} className="px-1 py-1 text-center"><Cell cell={cell} name={row.name} /></td>
    ))}
    <td className="px-2 py-1 text-center">
      {row.completion === null ? (
        <span className="text-text-light">-</span>
      ) : (
        <span className={cn('t-card font-display font-bold tabular-nums', rateToneClass(row.completion))}>{formatPct(row.completion)}</span>
      )}
      {!!row.open && <span className="block t-meta font-display text-text-secondary">{row.open} open</span>}
    </td>
    <td className="px-2 py-1 text-center">
      {row.rate === null ? (
        <span className="text-text-light">-</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Ring percent={row.rate} tone={rateToneClass(row.rate)} size={30} />
          <span className={cn('t-card font-display font-bold tabular-nums', rateToneClass(row.rate))}>{formatPct(row.rate)}</span>
        </span>
      )}
    </td>
    <td className="px-2 py-1 text-center">
      {row.compliance === null ? (
        <span className="text-text-light" title="No answers were checked in this period">-</span>
      ) : (
        <span className={cn('t-card font-display font-bold tabular-nums', rateToneClass(row.compliance))}>{formatPct(row.compliance)}</span>
      )}
    </td>
  </tr>
));
MatrixRow.displayName = 'MatrixRow';

interface FillMatrixProps {
  data: WeeklyReport;
  today: string;
  label: string;
}

export const FillMatrix = ({ data, today, label }: FillMatrixProps) => {
  const isMonthView = data.kind === 'month';
  const holidayDays = Object.keys(data.holidays).sort();
  return (
    <>
      <div role="region" aria-label="Fill matrix, scrolls sideways" tabIndex={0} className={cn(PANEL_CLASS, 'overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Daily checklist fill status, {label}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-3 sm:px-4 py-2.5 t-meta font-display font-semibold text-text-secondary min-w-28 sm:min-w-48">Checklist</th>
              {data.columns.map((col) => (
                <th key={col.key} scope="col" className={cn('px-1 py-2 text-center', isMonthView ? 'min-w-14' : data.columns.length > 7 ? 'min-w-10' : 'min-w-12')} title={data.holidays[col.key]}>
                  {isMonthView ? (
                    <span className="t-meta font-display font-medium text-text-muted">{col.label}</span>
                  ) : (
                    <span className={cn('flex flex-col items-center t-meta font-display leading-tight', col.key === today ? 'text-text-secondary font-bold' : 'text-text-muted font-medium')}>
                      {WEEKDAYS[new Date(`${col.key}T00:00:00Z`).getUTCDay()]}
                      <span className="tabular-nums t-card">{col.key.slice(8)}</span>
                      {data.holidays[col.key] && data.columns.length <= 7 && <span className="t-meta text-text-light">Holiday</span>}
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="px-2 py-2.5 text-center t-meta font-display font-semibold text-text-secondary min-w-16">Completion</th>
              <th scope="col" className="px-2 py-2.5 text-center t-meta font-display font-semibold text-text-secondary min-w-16">Met deadline</th>
              <th scope="col" className="px-2 py-2.5 text-center t-meta font-display font-semibold text-text-secondary min-w-16">Answers right</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => <MatrixRow key={`${row.definitionId}-${row.storeId}-${row.scopeKey}`} row={row} />)}
          </tbody>
        </table>
      </div>

      {holidayDays.length > 0 && (
        <p className="t-meta font-display text-text-muted">
          Holiday: {holidayDays.map((d) => `${shortDate(d)}, ${data.holidays[d]}`).join('; ')}
        </p>
      )}

      {isMonthView ? (
        <p className="t-meta font-display text-text-muted">Each month shows the share of its due runs that got filled. Tap a month for the split.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 t-meta text-text-muted font-display" aria-label="Legend">
          {(['done', 'late', 'missed', 'open', 'holiday'] as WeeklyCellState[]).map((k) => {
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
    </>
  );
};
