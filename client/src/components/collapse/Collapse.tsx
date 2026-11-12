import { useState, type ReactNode, type TransitionEvent } from 'react';
import { cn } from '@/lib/utils';

interface CollapseProps {
  open: boolean;
  id?: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}

export const Collapse = ({ open, id, className, innerClassName, children }: CollapseProps) => {
  const [settledOpen, setSettledOpen] = useState(open);
  const clipped = !open || !settledOpen;

  const onTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setSettledOpen(open);
  };

  return (
    <div
      id={id}
      inert={!open}
      onTransitionEnd={onTransitionEnd}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className={cn('min-h-0', clipped && 'overflow-hidden', innerClassName)}>{children}</div>
    </div>
  );
};
