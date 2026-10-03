import { memo } from 'react';
import { Building2, Store, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, EntityIconTile, StatusPill, MetricPill, EntityCardActions, Skeleton } from '../../../components';
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
  <article className={cn(ENTITY_CARD_CLASS, isDeleting && 'opacity-50 pointer-events-none')}>
    <header className="flex items-start justify-between gap-2.5 mb-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <EntityIconTile icon={Building2} />
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3
              className={cn(
                'text-sm font-display font-bold truncate transition-colors duration-150 group-hover:text-primary-600',
                department.isActive ? 'text-text' : 'text-text-secondary'
              )}
              title={department.name}
            >
              {department.name}
            </h3>
            {!department.isActive && (
              <span className="shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                Deactivated
              </span>
            )}
          </div>
          {storeLabel === undefined ? (
            <Skeleton className="h-3 w-24" />
          ) : storeLabel ? (
            <p className="flex items-center gap-1 text-xs font-display text-text-muted truncate">
              <Store className="w-3 h-3 shrink-0" />
              {storeLabel}
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

    <footer className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/60 mt-auto">
      {activeCount === undefined ? (
        <Skeleton className="h-6 w-24 rounded-lg" />
      ) : activeCount === null ? (
        <span className="text-xs font-display text-text-light">Count unavailable</span>
      ) : (
        <div title={countTitle(activeCount, inactiveCount)}>
          <MetricPill icon={Users}>
            {activeCount} {activeCount === 1 ? 'member' : 'members'}
          </MetricPill>
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
