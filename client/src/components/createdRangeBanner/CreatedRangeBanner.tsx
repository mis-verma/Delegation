import { CalendarRange, X } from 'lucide-react';
import type { CreatedRange } from '../../lib/createdRange';

interface CreatedRangeBannerProps {
  range: CreatedRange | null;
  onClear: () => void;
  /** What the page lists, in the plural: "delegations", "tickets". */
  noun: string;
}

/** Shown on a list page that was opened from a chart bar: says which period it is narrowed to, with one tap to clear. */
export const CreatedRangeBanner = ({ range, onClear, noun }: CreatedRangeBannerProps) => {
  if (!range) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-primary-500/30 bg-primary-500/10 px-3.5 py-2.5">
      <CalendarRange size={16} aria-hidden className="shrink-0 text-primary-600 dark:text-primary-300" />
      <p className="flex-1 min-w-0 text-sm font-display font-medium text-text-secondary">
        Showing {noun} created <span className="font-semibold text-text">{range.label}</span>
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 h-9 pointer-coarse:h-11 px-2.5 rounded-lg text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/15 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <X size={13} aria-hidden />
        Show all
      </button>
    </div>
  );
};
