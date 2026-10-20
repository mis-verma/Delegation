import { memo, type KeyboardEvent } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, Skeleton, StatusPill, StateChip } from '../../../components';
import type { Store } from '../../../api/stores';
import type { PeopleCount } from '../orgCounts';

interface StoreTableProps {
  stores: Store[];
  memberCounts: Map<string, PeopleCount> | undefined;
  membersFailed: boolean;
  departmentCountByStore: Map<string, number> | undefined;
  updatingId: string | undefined;
  deletingId: string | undefined;
  onToggleActive: (store: Store) => void;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => void;
}

const HEAD_ROW_CLASS = 'bg-primary-800';
const HEAD_CLASS = 'px-3 py-3 text-left t-meta font-semibold text-white tracking-tight whitespace-nowrap';
const CELL_CLASS = 'px-3 py-2.5 align-middle t-meta text-text-secondary';

const StoreTableComponent = ({
  stores, memberCounts, membersFailed, departmentCountByStore, updatingId, deletingId, onToggleActive, onEdit, onDelete,
}: StoreTableProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, store: Store) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit(store);
    }
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[56rem] border-collapse">
        <thead className={HEAD_ROW_CLASS}>
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, 'sticky left-0 z-10', HEAD_ROW_CLASS)}>Store</th>
            <th scope="col" className={HEAD_CLASS}>Code</th>
            <th scope="col" className={HEAD_CLASS}>Address</th>
            <th scope="col" className={HEAD_CLASS}>Staff</th>
            <th scope="col" className={HEAD_CLASS}>Departments</th>
            <th scope="col" className={HEAD_CLASS}>Status</th>
            <th scope="col" className={HEAD_CLASS}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => {
            const count = memberCounts?.get(s.id);
            const active = memberCounts ? (count?.active ?? 0) : membersFailed ? null : undefined;
            const inactive = count?.inactive ?? 0;
            const deptCount = departmentCountByStore ? (departmentCountByStore.get(s.id) ?? 0) : undefined;
            const isDeleting = deletingId === s.id;

            return (
              <tr
                key={s.id}
                onClick={() => onEdit(s)}
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, s)}
                className={cn(
                  'border-b border-border/40 last:border-b-0 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none cursor-pointer transition-colors duration-200 ease-in-out',
                  isDeleting && 'opacity-50 pointer-events-none',
                )}
              >
                <td className={cn(CELL_CLASS, 'sticky left-0 bg-surface z-10 max-w-[22rem]')}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ColorIconTile icon={StoreIcon} name={s.name} size="sm" />
                    <span
                      className={cn('text-sm font-display font-bold truncate', s.isActive ? 'text-text' : 'text-text-secondary')}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    {!s.isActive && (
                      <StateChip active={false} label="Inactive" size="sm" />
                    )}
                  </div>
                </td>

                <td className={cn(CELL_CLASS, 'whitespace-nowrap')}>
                  {s.code ?? <span className="italic text-text-light">No code</span>}
                </td>

                <td className={cn(CELL_CLASS, 'max-w-[16rem]')}>
                  {s.address ? (
                    <span className="block truncate" title={s.address}>{s.address}</span>
                  ) : (
                    <span className="text-text-light">-</span>
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

                <td className={cn(CELL_CLASS, 'whitespace-nowrap tabular-nums')}>
                  {deptCount === undefined ? <Skeleton className="h-3 w-10" /> : deptCount}
                </td>

                <td className={CELL_CLASS} onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    active={s.isActive}
                    isUpdating={updatingId === s.id}
                    onToggle={() => onToggleActive(s)}
                    ariaLabel={`${s.isActive ? 'Deactivate' : 'Activate'} ${s.name}`}
                  />
                </td>

                <td className={cn(CELL_CLASS, 'w-24')} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    <EntityCardActions
                      onEdit={() => onEdit(s)}
                      onDelete={() => onDelete(s)}
                      isDeleting={isDeleting}
                      editLabel={`Edit ${s.name} store`}
                      deleteLabel={`Delete ${s.name} store`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">{stores.length} {stores.length === 1 ? 'store' : 'stores'} shown.</p>
    </div>
  );
};

export const StoreTable = memo(StoreTableComponent);
