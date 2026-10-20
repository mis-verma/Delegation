import { cn } from '@/lib/utils';
import type { NavBadge } from './useNavBadges';

export const NavCountBadge = ({ badge, className }: { badge: NavBadge; className?: string }) => {
  const late = badge.overdue > 0;
  const count = late ? badge.overdue : badge.due;
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 t-meta font-display font-bold leading-none tabular-nums ring-2 ring-surface',
        late ? 'bg-danger text-white' : 'bg-primary-600 text-white dark:bg-primary-500',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
