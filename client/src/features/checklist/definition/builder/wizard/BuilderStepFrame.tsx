import { useEffect, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface BuilderStepFrameProps {
  stepIndex: number;
  stepCount?: number;
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}

export const BuilderStepFrame = ({ stepIndex, stepCount, icon: Icon, title, description, children }: BuilderStepFrameProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || frameRef.current?.contains(active)) return;
    headingRef.current?.focus();
  }, [stepIndex]);

  return (
    <div ref={frameRef} className="flex flex-col gap-4 sm:gap-6">
      <div className="sr-only sm:not-sr-only flex items-center gap-4 rounded-2xl border border-border/60 bg-linear-to-r from-primary-500/[0.09] via-primary-500/[0.03] to-transparent p-4 sm:p-5">
        {Icon && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <Icon size={22} strokeWidth={2.25} />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="font-display t-section font-bold text-text outline-none">
            {title}
          </h2>
          {description && <p className="hidden sm:block text-sm font-display text-text-muted">{description}</p>}
        </div>
        {stepCount && (
          <span className="hidden shrink-0 rounded-full border border-border/60 bg-surface px-3 py-1 t-meta font-display font-semibold tabular-nums text-text-secondary sm:inline-flex">
            Step {stepIndex + 1} of {stepCount}
          </span>
        )}
      </div>
      {children}
    </div>
  );
};
