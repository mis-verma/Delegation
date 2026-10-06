import { memo } from 'react';
import { Building2, Store, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, ColorIconTile, StatusPill, EntityCardActions, Skeleton } from '../../../components';
import type { Department } from '../../../api/departments';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DepartmentCardProps {
  department: Department;
  /** undefined = stores are still loading, null = no store assigned, string = the store's name. */
  storeLabel: string | null | undefined;
  /** undefined while the people list is loading, null if it failed; otherwise active people only. */
  activeCount: number | null | undefined;
  inactiveCount: number;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
}

const countTitle = (active: number, inactive: number) =>
  inactive > 0 ? `${active} active, ${inactive} deactivated` : undefined;

export const DepartmentCard = memo(({
  department,
  storeLabel,
  activeCount,
  inactiveCount,
  isUpdating,
  isDeleting,
  onToggleActive,
  onEdit,
  onDelete,
}: DepartmentCardProps) => (
  // justify-start: the footer pins itself with mt-auto, so a taller grid row never spreads the
  // header and footer apart unevenly.
  <article className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5', isDeleting && 'opacity-50 pointer-events-none')}>
    <header className="flex items-start justify-between gap-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <ColorIconTile icon={Building2} name={department.name} />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3
              className={cn(
                'text-sm font-display font-bold truncate transition-colors duration-150 group-hover:text-primary-600 dark:group-hover:text-primary-400',
                department.isActive ? 'text-text' : 'text-text-secondary'
              )}
              title={department.name}
            >
              {department.name}
            </h3>
            {!department.isActive && (
              <span className="shrink-0 text-xs font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                Deactivated
              </span>
            )}
          </div>
          {storeLabel === undefined ? (
            <Skeleton className="h-3 w-24" />
          ) : storeLabel ? (
            <p className="flex items-center gap-1 text-xs font-display text-text-muted min-w-0" title={storeLabel}>
              <Store className="size-3 shrink-0 text-text-light" aria-hidden />
              <span className="truncate">{storeLabel}</span>
            </p>
          ) : (
            <p className="text-xs font-display text-text-light italic">No store assigned</p>
          )}
        </div>
      </div>

      <StatusPill
        active={department.isActive}
        isUpdating={isUpdating}
        onToggle={() => onToggleActive(department)}
        ariaLabel={`${department.isActive ? 'Deactivate' : 'Activate'} ${department.name}`}
      />
    </header>

    <footer className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/60 min-h-14">
      {activeCount === undefined ? (
        <Skeleton className="h-6 w-24 rounded-lg" />
      ) : activeCount === null ? (
        <span className="text-xs font-display text-text-light">Count unavailable</span>
      ) : (
        <div className="flex items-center gap-2" title={countTitle(activeCount, inactiveCount)}>
          <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0">
            <Users className="size-3.5" aria-hidden />
          </span>
          <p className="flex items-baseline gap-1.5">
            <span className="text-base font-display font-bold tabular-nums text-text leading-none">{activeCount}</span>
            <span className="text-xs font-display text-text-muted">{activeCount === 1 ? 'member' : 'members'}</span>
          </p>
        </div>
      )}

      <EntityCardActions
        onEdit={() => onEdit(department)}
        onDelete={() => onDelete(department)}
        isDeleting={isDeleting}
        editLabel={`Edit ${department.name} department`}
        deleteLabel={`Delete ${department.name} department`}
      />
    </footer>
  </article>
));
DepartmentCard.displayName = 'DepartmentCard';

// Same chrome and gaps as the card above (header, then a footer that is at least 3.5rem tall), so
// the grid does not jump when the real rows arrive.
export const DepartmentCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'justify-start gap-3.5')} aria-hidden>
    <div className="flex items-start justify-between gap-2.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-[70%]">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-16 rounded-full shrink-0" />
    </div>
    <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/60 min-h-14">
      <Skeleton className="h-6 w-24 rounded-lg" />
      <div className="flex gap-1">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
    </div>
  </div>
);
