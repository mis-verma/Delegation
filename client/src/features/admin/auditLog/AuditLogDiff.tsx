import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMPTY_MARK, displayValue, type DiffRow, type FactRow } from './auditLogDisplay';

type PillVariant = 'removed' | 'added' | 'changed' | 'plain';

// A value pill's own tint communicates what kind of change this side represents: a plain
// "before -> after" row reads the same whether a field was newly set, cleared, or changed, so a
// reviewer has to read every word to know which. Color does that work instead: muted+struck for
// what's gone, primary for what replaced it, success for a value that simply didn't exist before.
const valuePillClass = (variant: PillVariant) => {
  switch (variant) {
    case 'removed':
      return 'bg-surface-hover border-border text-text-muted line-through decoration-text-light';
    case 'added':
      return 'bg-success/10 border-success/25 text-success font-bold';
    case 'changed':
      return 'bg-primary-500/10 border-primary-500/20 text-primary-700 dark:text-primary-400 font-bold';
    case 'plain':
      return 'bg-surface border-border/70 text-text font-semibold';
  }
};

const ValuePill = ({ value, variant }: { value: string; variant: PillVariant }) => {
  const text = displayValue(value);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 rounded-md border text-[11px] max-w-full sm:max-w-[16rem] truncate',
        valuePillClass(variant),
        // The word "Empty" is a state, not a value: keep it quiet and italic.
        value === EMPTY_MARK && 'italic font-medium text-text-muted',
      )}
      title={text}
    >
      {text}
    </span>
  );
};

// The before/after pills for one field, shared by the full list and the compact in-row chips.
const ChangePills = ({ row }: { row: DiffRow }) => {
  const wasEmpty = row.before === EMPTY_MARK;
  const isEmpty = row.after === EMPTY_MARK;

  if (wasEmpty) return <ValuePill value={row.after} variant="added" />;
  if (isEmpty) return <ValuePill value={row.before} variant="removed" />;
  return (
    <>
      <ValuePill value={row.before} variant="removed" />
      <ArrowRight size={12} strokeWidth={3} className="text-text-light shrink-0" aria-label="changed to" />
      <ValuePill value={row.after} variant="changed" />
    </>
  );
};

/** One changed field as a small self-contained chip: "Priority  Low -> High". Used directly in a row. */
export const DiffChange = ({ row }: { row: DiffRow }) => (
  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-surface-hover/40 px-2 py-1.5 max-w-full">
    <span className="text-[11px] font-display font-semibold text-text-secondary">{row.label}</span>
    <ChangePills row={row} />
  </div>
);

/** One detail of a record as a plain "Label: value" pill, e.g. "Priority: High". */
export const FactPill = ({ fact }: { fact: FactRow }) => (
  <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-surface-hover/40 px-2 py-1.5 max-w-full">
    <span className="text-[11px] font-display font-semibold text-text-secondary">{fact.label}</span>
    <ValuePill value={fact.value} variant="plain" />
  </div>
);

const DiffRowView = ({ row }: { row: DiffRow }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover/50 transition-colors">
    <span className="text-xs font-bold text-text-secondary sm:w-40 shrink-0 truncate" title={row.label}>
      {row.label}
    </span>
    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
      <ChangePills row={row} />
    </div>
  </div>
);

/** The full list of every changed field, used when a row is expanded. */
export const AuditLogDiff = ({ rows }: { rows: DiffRow[] }) => {
  if (rows.length === 0) {
    return <p className="text-xs font-medium text-text-muted px-1">No field changes were recorded for this entry.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/70 bg-surface-hover/40 overflow-hidden">
      {rows.map((row) => <DiffRowView key={row.key} row={row} />)}
    </div>
  );
};
