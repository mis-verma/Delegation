import { cn } from '@/lib/utils';
import { usePcApprovalBuckets } from '../../features/pc/usePcApprovalBuckets';
import { NavCountBadge } from './NavCountBadge';

interface VerifyQueueBadgeProps {
  compact?: boolean;
  srOnly?: boolean;
  className?: string;
}

export const VerifyQueueBadge = ({ compact = false, srOnly = false, className }: VerifyQueueBadgeProps) => {
  const { total } = usePcApprovalBuckets();
  if (total.pending <= 0) return null;

  const late = total.old > 0;
  const title = late
    ? `${total.pending} waiting for you, ${total.old} of them over 24 hours`
    : `${total.pending} waiting for you`;

  if (srOnly) return <span className="sr-only">, {title}</span>;

  if (compact) return <NavCountBadge badge={{ due: total.pending, overdue: late ? total.pending : 0 }} className={className ?? '-top-1 -right-1'} />;

  return (
    <span
      title={title}
      aria-hidden="true"
      className={cn(
        'ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 t-meta font-display font-bold leading-none tabular-nums text-white',
        late ? 'bg-danger' : 'bg-primary-600 dark:bg-primary-500',
        className,
      )}
    >
      {total.pending > 99 ? '99+' : total.pending}
    </span>
  );
};
