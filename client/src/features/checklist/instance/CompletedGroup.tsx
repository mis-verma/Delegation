import type { ReactNode } from 'react';
import { CheckCheck, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapse } from '../../../components';

interface CompletedGroupProps {
  id: string;
  count: number;
  total?: number;
  hint: string;
  open: boolean;
  onToggle: () => void;
  bodyClassName?: string;
  children: ReactNode;
}

export const CompletedGroup = ({ id, count, total, hint, open, onToggle, bodyClassName, children }: CompletedGroupProps) => (
  <section id={id} aria-label="Completed" className="flex scroll-mt-4 flex-col rounded-xl border border-border/60 bg-surface-hover/25 p-3 sm:p-4">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`${id}-body`}
      className="flex min-h-11 items-center gap-3 rounded-lg text-left outline-none transition-colors duration-150 ease-out cursor-pointer hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/12 text-success-strong dark:text-success" aria-hidden="true">
        <CheckCheck size={16} strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-card font-display font-bold text-text">Completed</span>
        <span className="t-meta text-text-muted">{hint}</span>
      </span>
      <span className="rounded-full bg-surface px-2.5 py-0.5 t-meta font-display font-semibold tabular-nums text-text-secondary ring-1 ring-inset ring-border/60">
        {total === undefined ? count : `${count} of ${total}`}
      </span>
      <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-text-muted transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]', open && 'rotate-180')} />
    </button>
    <Collapse id={`${id}-body`} open={open} innerClassName={cn('pt-3', bodyClassName)}>
      {children}
    </Collapse>
  </section>
);
