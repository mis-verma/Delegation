import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BranchTone = 'coral' | 'primary' | 'leaf';

const DOT_CLASS: Record<BranchTone, string> = {
  coral: 'border-coral-400 dark:border-coral-400',
  primary: 'border-primary-500 dark:border-primary-400',
  leaf: 'border-border-hover',
};

export const TreeList = ({ children, className, label }: { children: ReactNode; className?: string; label?: string }) => (
  <ul aria-label={label} className={cn('flex flex-col', className)}>{children}</ul>
);

export const TreeItem = ({ children, tone = 'primary', className }: { children: ReactNode; tone?: BranchTone; className?: string }) => (
  <li
    style={{ '--dot-y': '1.75rem' } as React.CSSProperties}
    className={cn(
      'relative pl-7 pb-3 last:pb-0',
      'before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:rounded-full before:bg-border',
      'last:before:bottom-auto last:before:h-(--dot-y)',
      className,
    )}
  >
    <span aria-hidden className="absolute left-2 top-(--dot-y) h-0.5 w-5 -translate-y-1/2 rounded-full bg-border" />
    <span
      aria-hidden
      className={cn('absolute left-[calc(0.5rem+1px)] top-(--dot-y) size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface', DOT_CLASS[tone])}
    />
    {children}
  </li>
);
