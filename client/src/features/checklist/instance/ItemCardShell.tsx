import type { ReactNode } from 'react';
import { PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';

interface ItemCardShellProps {
  /** The run is approved and frozen: the whole card dims. */
  isLocked: boolean;
  /** Dashed, muted chrome for a step that was skipped on purpose (Not applicable). */
  dashed?: boolean;
  children: ReactNode;
  className?: string;
}

// The one card frame for every checklist item type. Radius, border and padding live here, so a
// change to how an item card looks is a one-line edit instead of a 14-file sweep.
export const ItemCardShell = ({ isLocked, dashed = false, children, className }: ItemCardShellProps) => (
  <div
    className={cn(
      PANEL_CLASS,
      'flex flex-col gap-3 p-3.5 sm:p-4',
      dashed && 'border-border-hover bg-surface-hover/40',
      isLocked && 'opacity-75',
      className,
    )}
  >
    {children}
  </div>
);
