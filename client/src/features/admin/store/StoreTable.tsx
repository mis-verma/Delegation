import { memo } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, Skeleton, StatusPill, StateChip } from '../../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../../components/dataTable';
import type { Store } from '../../../api/stores';
import type { PeopleCount } from '../orgCounts';
import type { ExplorerRow } from '../../../api/scores';
import { ScoreCell } from '../directory/orgScores';

interface StoreTableProps {
  stores: Store[];
  memberCounts: Map<string, PeopleCount> | undefined;
  membersFailed: boolean;
  departmentCountByStore: Map<string, number> | undefined;
  scoreById: Map<string, ExplorerRow> | undefined;
  scoreWindow: { from: string; to: string; failed: boolean };
  updatingId: string | undefined;
  deletingId: string | undefined;
  onToggleActive: (store: Store) => void;
  onEdit: (store: Store) => void;
  onDelete?: (store: Store) => void;
}

const StoreTableComponent = ({
  stores, memberCounts, membersFailed, departmentCountByStore, scoreById, scoreWindow, updatingId, deletingId, onToggleActive, onEdit, onDelete,
}: StoreTableProps) => {
  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full min-w-[60rem] border-collapse">
        <caption className="sr-only">Stores</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Store</th>
            <th scope="col" className={TH_CLASS}>Code</th>
            <th scope="col" className={TH_CLASS}>Address</th>
            <th scope="col" className={cn(TH_CLASS, 'text-right')}>Staff</th>
            <th scope="col" className={cn(TH_CLASS, 'text-right')}>Departments</th>
            <th scope="col" className={cn(TH_CLASS, 'text-right')}>Score this month</th>
            <th scope="col" className={TH_CLASS}>Status</th>
            <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
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
                onKeyDown={activateOnKey(() => onEdit(s))}
                className={cn(TR_CLASS, isDeleting && 'opacity-50 pointer-events-none')}
              >
                <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <ColorIconTile icon={StoreIcon} name={s.name} size="sm" />
                    <span
                      className={cn('text-sm font-display font-bold line-clamp-2 leading-snug break-words min-w-0', s.isActive ? 'text-text' : 'text-text-secondary')}
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    {!s.isActive && (
                      <StateChip active={false} label="Inactive" size="sm" />
                    )}
                  </div>
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap')}>
                  {s.code ?? <span className="italic text-text-light">No code</span>}
                </td>

                <td className={cn(TD_CLASS, 'max-w-[16rem]')}>
                  {s.address ? (
                    <span className="block truncate" title={s.address}>{s.address}</span>
                  ) : (
                    <span className="text-text-light">-</span>
                  )}
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap', NUM_CLASS)}>
                  {active === undefined ? (
                    <Skeleton className="h-3 w-10 ml-auto" />
                  ) : active === null ? (
                    <span className="text-text-light">Count unavailable</span>
                  ) : (
                    <span title={inactive > 0 ? `${active} active, ${inactive} deactivated` : undefined}>{active}</span>
                  )}
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap', NUM_CLASS)}>
                  {deptCount === undefined ? <Skeleton className="h-3 w-10 ml-auto" /> : deptCount}
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap text-right')}>
                  <ScoreCell
                    kind="store"
                    id={s.id}
                    name={s.name}
                    row={scoreById ? (scoreById.get(s.id) ?? null) : scoreWindow.failed ? null : undefined}
                    from={scoreWindow.from}
                    to={scoreWindow.to}
                    failed={scoreWindow.failed}
                  />
                </td>

                <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    active={s.isActive}
                    isUpdating={updatingId === s.id}
                    onToggle={() => onToggleActive(s)}
                    ariaLabel={`${s.isActive ? 'Deactivate' : 'Activate'} ${s.name}`}
                  />
                </td>

                <td className={cn(TD_CLASS, 'w-24')} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    <EntityCardActions
                      onEdit={() => onEdit(s)}
                      onDelete={onDelete ? () => onDelete(s) : undefined}
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
