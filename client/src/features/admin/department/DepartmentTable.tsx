import { memo, type KeyboardEvent } from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, Skeleton, StatusPill } from '../../../components';
import type { Department } from '../../../api/departments';
import type { PeopleCount } from '../orgCounts';

interface DepartmentTableProps {
  departments: Department[];
  /** undefined while stores are loading. */
  storeNameById: Map<string, string> | undefined;
  /** undefined while the people list is loading. */
  memberCounts: Map<string, PeopleCount> | undefined;
  /** The people list failed to load, so counts can never arrive. */
  membersFailed: boolean;
  updatingId: string | undefined;
  deletingId: string | undefined;
  onToggleActive: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
}

// Same navy header and dense cells as the Tickets table.
const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS = 'px-3 py-3 text-left text-xs font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 align-middle text-xs text-text-secondary';

const DepartmentTableComponent = ({
  departments, storeNameById, memberCounts, membersFailed, updatingId, deletingId, onToggleActive, onEdit, onDelete,
}: DepartmentTableProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, department: Department) => {
    // Keys pressed on the status or action buttons inside the row are theirs, not the row's.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit(department);
    }
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[44rem] border-collapse">
        <thead className={HEAD_ROW_CLASS}>
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, 'sticky left-0 z-10', HEAD_ROW_CLASS)}>Department</th>
            <th scope="col" className={HEAD_CLASS}>Store</th>
            <th scope="col" className={HEAD_CLASS}>Members</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => {
            const store = d.storeId ? (storeNameById ? (storeNameById.get(d.storeId) ?? 'Unknown store') : undefined) : null;
            const count = memberCounts?.get(d.id);
            const active = memberCounts ? (count?.active ?? 0) : membersFailed ? null : undefined;
            const inactive = count?.inactive ?? 0;
            const isDeleting = deletingId === d.id;

            return (
              <tr
                key={d.id}
                onClick={() => onEdit(d)}
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, d)}
                className={cn(
                  'border-b border-border/40 last:border-b-0 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none cursor-pointer transition-colors duration-200 ease-in-out',
                  isDeleting && 'opacity-50 pointer-events-none',
                )}
              >
                <td className={cn(CELL_CLASS, 'sticky left-0 bg-surface z-10 max-w-[22rem]')}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ColorIconTile icon={Building2} name={d.name} size="sm" />
                    <span
                      className={cn('text-sm font-display font-bold truncate', d.isActive ? 'text-text' : 'text-text-secondary')}
                      title={d.name}
                    >
                      {d.name}
                    </span>
                    {!d.isActive && (
                      <span className="shrink-0 text-xs font-display font-bold px-1.5 py-0.5 rounded-md border border-border bg-surface-hover text-text-muted">
                        Deactivated
                      </span>
                    )}
                  </div>
                </td>

                <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
                  {store === undefined ? (
                    <Skeleton className="h-3 w-24" />
                  ) : store ? (
                    store
                  ) : (
                    <span className="italic text-text-light">Not set</span>
                  )}
                </td>

                <td className={cn(CELL_CLASS, 'whitespace-nowrap tabular-nums')}>
                  {active === undefined ? (
                    <Skeleton className="h-3 w-10" />
                  ) : active === null ? (
                    <span className="text-text-light">Count unavailable</span>
                  ) : (
                    <span title={inactive > 0 ? `${active} active, ${inactive} deactivated` : undefined}>{active}</span>
                  )}
                </td>

                <td className={CELL_CLASS} onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    active={d.isActive}
                    isUpdating={updatingId === d.id}
                    onToggle={() => onToggleActive(d)}
                    ariaLabel={`${d.isActive ? 'Deactivate' : 'Activate'} ${d.name}`}
                  />
                </td>

                <td className={cn(CELL_CLASS, 'w-24')} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    <EntityCardActions
                      onEdit={() => onEdit(d)}
                      onDelete={() => onDelete(d)}
                      isDeleting={isDeleting}
                      editLabel={`Edit ${d.name} department`}
                      deleteLabel={`Delete ${d.name} department`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">{departments.length} {departments.length === 1 ? 'department' : 'departments'} shown.</p>
    </div>
  );
};

export const DepartmentTable = memo(DepartmentTableComponent);
