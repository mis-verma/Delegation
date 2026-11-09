import { X } from 'lucide-react';

export interface AppliedFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

interface AppliedFiltersProps {
  items: AppliedFilter[];
  onClearAll?: () => void;
}

export const AppliedFilterChip = ({ label, onRemove }: Omit<AppliedFilter, 'key'>) => (
  <span className="flex items-center gap-1 min-w-0 max-w-full h-8 pointer-coarse:h-11 pl-3 pr-1 rounded-full border border-border/60 bg-surface t-meta font-display font-semibold text-text">
    <span className="min-w-0 truncate">{label}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="relative flex items-center justify-center size-6 pointer-coarse:size-9 shrink-0 rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <X size={13} aria-hidden />
    </button>
  </span>
);

export const AppliedFilters = ({ items, onClearAll }: AppliedFiltersProps) => {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0" role="group" aria-label="Applied filters">
      {items.map((item) => (
        <AppliedFilterChip key={item.key} label={item.label} onRemove={item.onRemove} />
      ))}
      {onClearAll && items.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-8 px-2.5 pointer-coarse:h-11 pointer-coarse:px-3 rounded-lg t-meta font-display font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          Clear all
        </button>
      )}
    </div>
  );
};
