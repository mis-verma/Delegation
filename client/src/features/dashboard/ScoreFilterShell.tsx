import type { ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_LABEL_CLASS } from '../scores/controlStyles';

interface ScoreFieldProps {
  label: string;
  icon: LucideIcon;
  hint?: string;
  children: ReactNode;
}

export const ScoreField = ({ label, icon: Icon, hint, children }: ScoreFieldProps) => (
  <div className="flex min-w-0 flex-col gap-2">
    <span className={cn(FIELD_LABEL_CLASS, 'flex items-center gap-1.5')}>
      <Icon className="size-3.5 shrink-0 text-text-light" strokeWidth={2.25} aria-hidden="true" />
      {label}
    </span>
    {children}
    {hint && <p className="t-meta text-text-muted">{hint}</p>}
  </div>
);

interface ScoreFilterShellProps {
  title: string;
  summary: readonly string[];
  open: boolean;
  onToggle: () => void;
  ready: boolean;
  children: ReactNode;
}

export const ScoreFilterShell = ({ title, summary, open, onToggle, ready, children }: ScoreFilterShellProps) => (
  <div className="rounded-xl border border-border/60 bg-surface-hover/30">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="scores-filters"
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-text-secondary">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="t-meta font-display font-semibold text-text">{title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {summary.map((chip) => (
              <span key={chip} className="max-w-full break-words rounded-full border border-border bg-surface px-2 py-0.5 t-meta font-display font-semibold text-text-secondary">{chip}</span>
            ))}
          </span>
        </span>
      </span>
      <ChevronDown className={cn('size-4 shrink-0 text-text-muted transition-transform duration-300', open && 'rotate-180')} aria-hidden="true" />
    </button>

    <div
      id="scores-filters"
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="min-h-0 overflow-hidden">
        {(ready && open) && (
          <div className="grid grid-cols-1 gap-4 border-t border-border/60 p-3 @xl:grid-cols-2 @4xl:grid-cols-3 @4xl:p-4">
            {children}
          </div>
        )}
      </div>
    </div>
  </div>
);
