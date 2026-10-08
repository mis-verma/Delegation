import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BranchTone = 'coral' | 'primary' | 'leaf';

// Node dot colour per level: the store's branch is coral, a department's is primary, a person is a
// small neutral leaf. Written out in full so Tailwind sees every class.
const DOT_CLASS: Record<BranchTone, string> = {
  coral: 'border-coral-400 dark:border-coral-400',
  primary: 'border-primary-500 dark:border-primary-400',
  leaf: 'border-border-hover',
};

/**
 * One level of the org hierarchy drawn as a branch: a vertical trunk down the left with an elbow and
 * a node dot at each child, like a stepper. The trunk of the last child stops at its own elbow, so
 * the line never runs past the final node.
 */
export const TreeList = ({ children, className, label }: { children: ReactNode; className?: string; label?: string }) => (
  <ul aria-label={label} className={cn('flex flex-col', className)}>{children}</ul>
);

export const TreeItem = ({ children, tone = 'primary', className }: { children: ReactNode; tone?: BranchTone; className?: string }) => (
  <li
    // --dot-y: how far down the row the elbow and dot sit. 1.75rem is the middle of a standard header
    // or person row (both are at least 3.5rem tall).
    style={{ '--dot-y': '1.75rem' } as React.CSSProperties}
    className={cn(
      'relative pl-7 pb-3 last:pb-0',
      // The trunk. Every item draws its own segment so the line stays connected across the gaps.
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
