import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../skeleton';
import { Button } from '../../button';
import { InlineError } from '../../inlineError';
import { QUICK_MAX } from './quickShared';

interface QuickRowProps {
  title: string;
  to?: string;
  onOpen?: () => void;
  hot?: boolean;
  lead?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}

export const QuickRow = ({ title, to, onOpen, hot = false, lead, meta, action }: QuickRowProps) => {
  const body = (
    <>
      <span className="line-clamp-2 text-sm font-display font-semibold leading-snug text-text">{title}</span>
      {meta && <span className="flex flex-wrap items-center gap-1.5">{meta}</span>}
    </>
  );
  return (
    <li
      className={cn(
        'relative flex min-h-16 items-center gap-2 rounded-xl border bg-surface py-2 pl-3 pr-2 transition-colors duration-150',
        hot ? 'border-danger/30' : 'border-border/70',
      )}
    >
      {hot && <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-danger" aria-hidden="true" />}
      {lead}
      {to ? (
        <Link
          to={to}
          viewTransition
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:opacity-70"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">{body}</div>
      )}
      {action}
    </li>
  );
};

interface QuickActionProps {
  label: string;
  onClick?: () => void;
  to?: string;
  onOpen?: () => void;
  busy?: boolean;
}

export const QuickAction = ({ label, onClick, to, onOpen, busy = false }: QuickActionProps) => {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      size="sm"
      isLoading={busy}
      className="shrink-0"
      onClick={() => {
        if (to) {
          onOpen?.();
          void navigate(to, { viewTransition: true });
        } else {
          onClick?.();
        }
      }}
    >
      {label}
    </Button>
  );
};

interface QuickListProps {
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  total: number;
  emptyTitle: string;
  emptyHint: string;
  children: ReactNode;
}

export const QuickList = ({ pending, error, onRetry, total, emptyTitle, emptyHint, children }: QuickListProps) => {
  if (pending) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error) return <InlineError message="This list didn't load." onRetry={onRetry} />;
  if (total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success" aria-hidden="true">
          <CheckCheck className="size-5" strokeWidth={2.5} />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="t-card font-display font-bold text-text">{emptyTitle}</p>
          <p className="t-meta text-text-muted">{emptyHint}</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">{children}</ul>
      {total > QUICK_MAX && <p className="px-1 t-meta text-text-muted">And {total - QUICK_MAX} more. Open the full list to see them.</p>}
    </>
  );
};

