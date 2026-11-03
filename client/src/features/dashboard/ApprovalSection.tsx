import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ApprovalSectionProps {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export const ApprovalSection = ({ title, hint, children, className }: ApprovalSectionProps) => (
  <section aria-label={title} className={cn('flex flex-col gap-2.5 border-b border-border/40 px-4 py-4 sm:px-5', className)}>
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="t-meta font-display font-bold text-text">{title}</h3>
      {hint && <span className="t-meta text-text-muted">{hint}</span>}
    </div>
    {children}
  </section>
);
