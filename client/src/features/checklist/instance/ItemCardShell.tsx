import type { ReactNode } from 'react';
import { PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';

interface ItemCardShellProps {
  isLocked: boolean;
  dashed?: boolean;
  children: ReactNode;
  className?: string;
}

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
