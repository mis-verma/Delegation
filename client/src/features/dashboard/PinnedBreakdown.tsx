import type { ReactNode } from 'react';
import { X, ChevronRight } from 'lucide-react';

/**
 * The Dashboard's one "breakdown panel" surface.
 *
 * Four separate copies of this shell existed — the bar chart's hover tooltip and tap-to-pin panel,
 * the Compliance gauges' panel, and Compare Dashboard's — all with the same border/radius/padding,
 * the same 11px uppercase header rule, and the same close button. They had already drifted apart
 * on spacing (one carried an extra `mb-4`), which is exactly the failure this consolidates away.
 *
 * `variant` is the one real difference: the pinned panels animate in when the user taps something,
 * while the chart tooltip is positioned by Recharts and would visibly jump if it re-animated on
 * every hover.
 */
interface PinnedBreakdownProps {
  title: string;
  /** Omit for the tooltip variant — a hover tooltip has nothing to dismiss. */
  onClose?: () => void;
  variant?: 'pinned' | 'tooltip';
  className?: string;
  children: ReactNode;
}

export const PinnedBreakdown = ({ title, onClose, variant = 'pinned', className = '', children }: PinnedBreakdownProps) => (
  <div
    className={`rounded-2xl border border-border bg-surface px-4 py-3 flex flex-col gap-2 ${
      variant === 'pinned' ? 'animate-in fade-in slide-in-from-top-1 duration-200' : 'transition-all duration-200'
    } ${className}`}
  >
    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
      {/* Uppercase is deliberate at this size — an 11px eyebrow label, not a section heading. */}
      <p className="text-[11px] font-display font-semibold text-text-muted uppercase tracking-wider">{title}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close breakdown"
          className="p-1 -m-1 rounded-md text-text-light hover:text-text hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-200 cursor-pointer"
        >
          <X size={14} />
        </button>
      )}
    </div>
    {children}
  </div>
);

export interface BreakdownRatioRow {
  label: string;
  count: number;
  total: number;
}

/**
 * The "3 of 4" row shape shared by the Compliance gauges and Compare Dashboard. A zero-total row
 * reads "No data" rather than "0 of 0", which would imply a real measurement of nothing.
 *
 * `onRowClick` is optional and per-row-label — passing it turns every row with data into a button
 * that opens the real item list behind that number (see ActivityComplianceGauges). Rows with
 * nothing in them (`total === 0`) never become clickable — there's nothing to drill into.
 */
export const BreakdownRatioRows = ({ rows, onRowClick }: { rows: readonly BreakdownRatioRow[]; onRowClick?: (label: string) => void }) => (
  <>
    {rows.map((row) => {
      const clickable = row.total > 0 && !!onRowClick;
      const RowTag = clickable ? 'button' : 'div';
      return (
        <RowTag
          key={row.label}
          type={clickable ? 'button' : undefined}
          onClick={clickable ? () => onRowClick!(row.label) : undefined}
          // min-h-11 (44px) — these became tap targets when the click-through drill-down was added;
          // the original py-0.5 row (~24px) was sized for plain text, not a button.
          className={`flex items-center justify-between gap-4 text-[13px] w-full min-h-11 rounded-lg -mx-2 px-2 transition-colors duration-200 ${
            clickable ? 'cursor-pointer text-left hover:bg-surface-hover' : ''
          }`}
        >
          <span className="text-text-secondary">{row.label}</span>
          <span className="flex items-center gap-2.5 shrink-0">
            <span className="font-display font-bold text-text tabular-nums">
              {row.total > 0 ? `${row.count} of ${row.total}` : 'No data'}
            </span>
            {clickable && <ChevronRight size={14} strokeWidth={2.5} className="text-text-light" />}
          </span>
        </RowTag>
      );
    })}
  </>
);

/** The "nothing pinned yet" prompt that sits where a breakdown panel will appear. */
export const BreakdownHint = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-display font-medium text-text-light text-center px-1">{children}</p>
);
