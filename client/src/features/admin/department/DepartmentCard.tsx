import { Building2, Store, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ENTITY_CARD_CLASS, EntityIconTile, StatusPill, MetricPill, EntityCardActions } from '../../../components';
import type { Department } from '../../../api/departments';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DepartmentCardProps {
  department: Department;
  /** Resolved from department.storeId by the parent list — undefined when unassigned. */
  storeName?: string;
  memberCount: number;
  isUpdating: boolean;
  isDeleting: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onEdit: (department: Department) => void;
  onDelete: (id: string) => void;
}

export const DepartmentCard = ({
  department,
  storeName,
  memberCount,
  isUpdating,
  isDeleting,
  onToggleActive,
  onEdit,
  onDelete,
}: DepartmentCardProps) => {
  return (
    <article
      className={cn(
        ENTITY_CARD_CLASS,
        // Inactive departments read as visibly muted, not just via the small text pill, so a scan
        // of the grid shows who's active/inactive at a glance.
        !department.isActive && 'opacity-65 saturate-50',
        isDeleting && 'opacity-50 pointer-events-none grayscale-[0.3]'
      )}
    >
      <header className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <EntityIconTile icon={Building2} />
          <div className="min-w-0 space-y-0.5">
            <h3
              className="text-sm font-display font-bold text-text truncate group-hover:text-primary-600 transition-colors duration-300"
              title={department.name}
            >
              {department.name}
            </h3>
            {storeName ? (
              <p className="flex items-center gap-1 text-xs font-display text-text-muted truncate">
                <Store className="w-3 h-3 shrink-0" />
                {storeName}
              </p>
            ) : (
              <p className="text-xs font-display text-text-light italic">No store assigned</p>
            )}
          </div>
        </div>

        <StatusPill
          active={department.isActive}
          isUpdating={isUpdating}
          onToggle={() => onToggleActive(department.id, department.isActive)}
          ariaLabel={`${department.isActive ? 'Deactivate' : 'Activate'} ${department.name}`}
        />
      </header>

      <footer className="flex items-center justify-between pt-2.5 border-t border-border/60 mt-auto">
        <MetricPill icon={Users}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </MetricPill>

        <EntityCardActions
          onEdit={() => onEdit(department)}
          onDelete={() => onDelete(department.id)}
          isDeleting={isDeleting}
          editLabel={`Edit ${department.name} department`}
          deleteLabel={`Delete ${department.name} department`}
        />
      </footer>
    </article>
  );
};
