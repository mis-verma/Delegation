import { memo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { AdminChromeAccents } from '../admin/AdminChromeAccents';
import { InlineError } from '../../components/inlineError';

export interface StatusBreakdownRow {
  label: string;
  /** Null renders "No data", never a made-up zero. */
  value: number | null;
  onClick?: () => void;
}

export type StatusBreakdownVariant = 'navy' | 'surface';

interface StatusBreakdownCardProps {
  icon?: LucideIcon;
  title: string;
  /** Where the title links to. The card itself is not interactive: the title is the one link and
   *  each row is its own button, so Enter/Space on a row can never be swallowed by an outer button. */
  href?: string;
  /** Null renders "No data". */
  total: number | null;
  totalLabel?: string;
  rows?: StatusBreakdownRow[];
  /** Red chip in the header. Hidden at zero: a standing "Overdue 0" is noise on a glance screen. */
  overdue?: { value: number; onClick: () => void };
  /** Replaces the body with an inline error and a Retry. The card switches to the surface look so
   *  the red error strip stays readable. */
  error?: { message: string; onRetry: () => void };
  variant?: StatusBreakdownVariant;
  /** When given, the header gets a Counts | Scores switch, and Scores shows completion and compliance in the same card. */
  scores?: { completion: number | null; compliance: number | null; due: number } | 'loading';
  /** The window the scores cover, shown under the total on the Scores side, for example "Oct 2026". */
  scoresPeriod?: string;
}

const SHELL = {
  navy: {
    card: 'border-transparent bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700',
    divider: 'border-white/10',
    title: 'text-white hover:text-white/80',
    icon: 'text-white/70',
    rowLabel: 'text-white/70',
    rowValue: 'text-white/90',
    rowHover: 'hover:bg-white/10',
    totalBox: 'border-white/15 bg-white/5',
    totalValue: 'text-white',
    totalLabel: 'text-white/70',
    focus: 'focus-visible:ring-white/60',
  },
  surface: {
    card: 'border-border/60 bg-surface',
    divider: 'border-border/60',
    title: 'text-text hover:text-primary-600 dark:hover:text-primary-400',
    icon: 'text-text-muted',
    rowLabel: 'text-text-secondary',
    rowValue: 'text-text',
    rowHover: 'hover:bg-surface-hover',
    totalBox: 'border-border/60 bg-surface-hover/50',
    totalValue: 'text-text',
    totalLabel: 'text-text-muted',
    focus: 'focus-visible:ring-primary-500/40',
  },
} as const;

const display = (value: number | null) => (value == null ? 'No data' : value);

export const StatusBreakdownCard = memo(({
  icon: Icon,
  title,
  href,
  rows = [],
  total,
  totalLabel = 'Total',
  overdue,
  error,
  variant = 'navy',
  scores,
  scoresPeriod,
}: StatusBreakdownCardProps) => {
  const shell = SHELL[error ? 'surface' : variant];
  const [side, setSide] = useState<'counts' | 'scores'>('counts');
  const showScores = !error && scores !== undefined && side === 'scores';
  const scored = scores && scores !== 'loading' ? scores : null;
  const scoreRows: StatusBreakdownRow[] = [
    { label: 'Completion', value: scored ? scored.completion : null },
    { label: 'Compliance', value: scored ? scored.compliance : null },
  ];
  const shownRows = showScores ? scoreRows : rows;

  const titleContent = (
    <>
      {Icon && <Icon size={16} className={`${shell.icon} shrink-0`} />}
      <span className="text-sm font-display font-bold break-words">{title}</span>
    </>
  );

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl border ${shell.card}`}>
      {/* Clipped to this header strip's own box, not the whole card: the decorative ring is sized
          to flourish behind the icon and title, and at the card's full height its bottom arc
          crossed straight through the Total box below. */}
      <div className={`relative z-10 flex items-center justify-between gap-2.5 px-4 border-b overflow-hidden ${shell.divider}`}>
        {!error && variant === 'navy' && <AdminChromeAccents scale="compact" />}
        {href ? (
          <Link
            to={href}
            className={`relative flex items-center gap-2 min-w-0 flex-1 min-h-11 py-1 rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${shell.title} ${shell.focus}`}
          >
            {titleContent}
          </Link>
        ) : (
          <div className={`relative flex items-center gap-2 min-w-0 flex-1 min-h-11 py-1 ${shell.title}`}>{titleContent}</div>
        )}

        {!error && scores !== undefined && (
          <div role="group" aria-label={`${title} view`} className="relative inline-flex shrink-0 items-center rounded-full bg-white/10 p-0.5">
            {(['counts', 'scores'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={side === option}
                onClick={() => setSide(option)}
                className={`h-6 rounded-full px-2 text-xs font-display font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60 pointer-coarse:h-8 ${side === option ? 'bg-white text-primary-800' : 'text-white/75 hover:text-white'}`}
              >
                {option === 'counts' ? 'Counts' : 'Scores'}
              </button>
            ))}
          </div>
        )}

        {!error && overdue && overdue.value > 0 && (
          <button
            type="button"
            onClick={overdue.onClick}
            aria-label={`${overdue.value} overdue, show them`}
            className="relative shrink-0 inline-flex items-center gap-1.5 min-h-11 px-1 -mx-1 cursor-pointer focus-visible:outline-none group/overdue"
          >
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-danger text-white text-xs font-display font-bold tabular-nums transition-colors duration-200 group-hover/overdue:bg-danger/85 group-focus-visible/overdue:ring-2 group-focus-visible/overdue:ring-white/70">
              {overdue.value} overdue
            </span>
          </button>
        )}
      </div>

      {error ? (
        <div className="relative z-10 flex flex-1 items-center p-3">
          <InlineError message={error.message} onRetry={error.onRetry} className="flex-1" />
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 items-stretch gap-3 p-3">
          <div className="flex-1 flex flex-col justify-center gap-1 min-w-0 px-1">
            {shownRows.map((row) => {
              const content = (
                <>
                  <span className={`font-bold break-words flex-1 leading-tight ${shell.rowLabel}`}>{row.label}</span>
                  <span className={`font-bold tabular-nums shrink-0 ${shell.rowValue}`}>{showScores ? (row.value == null ? '-' : `${row.value}%`) : display(row.value)}</span>
                  {row.onClick && <ChevronRight size={14} strokeWidth={2.5} className={`shrink-0 ml-1 opacity-60 ${shell.rowLabel}`} />}
                </>
              );
              return row.onClick ? (
                <button
                  key={row.label}
                  type="button"
                  onClick={row.onClick}
                  className={`flex items-center gap-2 min-h-11 text-sm font-display rounded-md px-1.5 -mx-1.5 text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${shell.rowHover} ${shell.focus}`}
                >
                  {content}
                </button>
              ) : (
                <div key={row.label} className="flex items-center gap-2 min-h-11 text-sm font-display px-1.5 -mx-1.5">
                  {content}
                </div>
              );
            })}
          </div>

          <div className={`flex flex-col items-center justify-center gap-0.5 w-24 sm:w-28 shrink-0 rounded-xl border ${shell.totalBox}`}>
            <span className={`font-display font-bold tabular-nums leading-none text-center ${(showScores ? scored?.due : total) == null ? 'text-sm' : 'text-2xl sm:text-3xl'} ${shell.totalValue}`}>
              {showScores ? (scored ? scored.due : '-') : display(total)}
            </span>
            <span className={`text-sm font-display font-medium tracking-wide ${shell.totalLabel}`}>{showScores ? `Due${scoresPeriod ? `, ${scoresPeriod}` : ''}` : totalLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
});

StatusBreakdownCard.displayName = 'StatusBreakdownCard';
