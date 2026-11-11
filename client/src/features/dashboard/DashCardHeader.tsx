import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashCardHeaderProps {
  id: string;
  title: string;
  count?: number | null;
  countLabel?: string;
  alert?: boolean;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export const DashCardHeader = ({ id, title, count, countLabel, alert = false, subtitle, action, className }: DashCardHeaderProps) => (
  <div className={cn('flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5 sm:pt-5', className)}>
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <h2 id={id} className="min-w-0 truncate t-section font-display font-bold tracking-tight text-text">{title}</h2>
        {count != null && count > 0 && (
          <span
            role="status"
            aria-label={countLabel ?? `${count}`}
            className={cn(
              'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-2 t-meta font-display font-bold tabular-nums',
              alert ? 'bg-danger/10 text-danger' : 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
            )}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      {subtitle && <p className="hidden t-meta text-text-muted sm:block">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const DashCardLink = ({ to, children, label }: { to: string; children: ReactNode; label?: string }) => (
  <Link
    viewTransition
    to={to}
    aria-label={label}
    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985] pointer-fine:min-h-9"
  >
    {children}
    <ChevronRight className="size-3.5" aria-hidden="true" />
  </Link>
);
