import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ChecklistItemIconTileProps {
  icon: LucideIcon;
  /** Kept for callers; the number pill looks the same done or not, the Done chip carries the status. */
  done?: boolean;
  /** The question's position. Shown as a small red pill; without it the question type icon stands alone. */
  number?: number;
}

/**
 * The question's leading mark: a small red pill with its number, plus the question-type icon beside
 * it on larger screens. A question without a number just shows the muted type icon.
 */
export const ChecklistItemIconTile = memo(function ChecklistItemIconTile({ icon: Icon, number }: ChecklistItemIconTileProps) {
  if (number === undefined) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center text-text-muted" aria-hidden="true">
        <Icon className="size-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        aria-label={`Question ${number}`}
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-danger px-2 t-meta font-display font-bold leading-none tabular-nums text-danger"
      >
        {number}
      </span>
      <Icon className="hidden size-4 text-text-muted sm:block" strokeWidth={2} aria-hidden="true" />
    </span>
  );
});
