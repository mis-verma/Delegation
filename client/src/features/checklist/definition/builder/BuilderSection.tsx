import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface BuilderSectionProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}

export const BuilderSection = ({ icon: Icon, title, hint, aside, children }: BuilderSectionProps) => (
  <section className="overflow-hidden rounded-2xl border border-border/60 bg-surface">
    <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-linear-to-r from-primary-500/[0.08] via-primary-500/[0.03] to-transparent px-4 py-3 sm:px-5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="t-card font-display font-bold text-text">{title}</span>
          {hint && <span className="hidden sm:block t-meta text-text-muted">{hint}</span>}
        </span>
      </span>
      {aside}
    </div>
    <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
  </section>
);

export const BuilderField = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <span className="t-meta font-display font-semibold text-text-secondary">{label}</span>
    {children}
    {hint && <span className="t-meta font-display font-medium text-primary-700 dark:text-primary-300">{hint}</span>}
  </div>
);
