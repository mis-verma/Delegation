import { ArrowRight } from 'lucide-react';
import type { DiffRow } from './auditLogDisplay';

const EMPTY = '—';

// A value pill's own tint communicates what kind of change this side represents — a plain
// "before -> after" row reads the same whether a field was newly set, cleared, or changed, so a
// reviewer has to read every word to know which. Color does that work instead: muted+struck for
// what's gone, primary for what replaced it, success for a value that simply didn't exist before.
const valuePillClass = (variant: 'removed' | 'added' | 'changed') => {
  switch (variant) {
    case 'removed':
      return 'bg-surface-hover border-border text-text-muted line-through decoration-text-light';
    case 'added':
      return 'bg-success/10 border-success/25 text-success font-bold';
    case 'changed':
      return 'bg-primary-500/10 border-primary-500/20 text-primary-700 dark:text-primary-400 font-bold';
  }
};

const ValuePill = ({ value, variant }: { value: string; variant: 'removed' | 'added' | 'changed' }) => (
  <span
    className={`inline-flex items-center px-2 py-1 rounded-md border text-[11px] truncate max-w-[14rem] ${valuePillClass(variant)}`}
    title={value}
  >
    {value}
  </span>
);

const DiffRowView = ({ row }: { row: DiffRow }) => {
  const wasEmpty = row.before === EMPTY;
  const isEmpty = row.after === EMPTY;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover/50 transition-colors">
      <span className="text-xs font-bold text-text-secondary sm:w-36 shrink-0 truncate" title={row.label}>
        {row.label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
        {wasEmpty ? (
          <ValuePill value={row.after} variant="added" />
        ) : isEmpty ? (
          <ValuePill value={row.before} variant="removed" />
        ) : (
          <>
            <ValuePill value={row.before} variant="removed" />
            <ArrowRight size={12} strokeWidth={3} className="text-text-light shrink-0" />
            <ValuePill value={row.after} variant="changed" />
          </>
        )}
      </div>
    </div>
  );
};

export const AuditLogDiff = ({ rows }: { rows: DiffRow[] }) => {
  if (rows.length === 0) {
    return <p className="text-xs font-medium text-text-muted italic px-1">No field changes recorded for this entry.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/70 bg-surface-hover/40 overflow-hidden">
      {rows.map((row) => <DiffRowView key={row.key} row={row} />)}
    </div>
  );
};
