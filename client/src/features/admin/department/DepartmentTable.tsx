import { memo } from 'react';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, Skeleton, StatusPill, StateChip } from '../../../components';
import type { Department } from '../../../api/departments';
import type { PeopleCount } from '../orgCounts';
import type { ExplorerRow } from '../../../api/scores';
import { ScoreCell } from '../directory/orgScores';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../../components/dataTable';

interface DepartmentTableProps {
  departments: Department[];
  storeNameById: Map<string, string> | undefined;
  memberCounts: Map<string, PeopleCount> | undefined;
  membersFailed: boolean;
  headByDepartment: Map<string, string> | undefined;
  scoreById: Map<string, ExplorerRow> | undefined;
  scoreWindow: { from: string; to: string; failed: boolean };
  updatingId: string | undefined;
  deletingId: string | undefined;
  onToggleActive: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete?: (department: Department) => void;
}

const DepartmentTableComponent = ({
  departments, storeNameById, memberCounts, membersFailed, headByDepartment, scoreById, scoreWindow, updatingId, deletingId, onToggleActive, onEdit, onDelete,
}: DepartmentTableProps) => {
  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full min-w-[54rem] border-collapse">
        <caption className="sr-only">Departments</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Department</th>
            <th scope="col" className={TH_CLASS}>Store</th>
            <th scope="col" className={TH_CLASS}>Head</th>
            <th scope="col" className={cn(TH_CLASS, 'text-right')}>Members</th>
            <th scope="col" className={cn(TH_CLASS, 'text-right')}>Score this month</th>
            <th scope="col" className={TH_CLASS}>Status</th>
            <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {departments.map((d) => {
            const store = d.storeId ? (storeNameById ? (storeNameById.get(d.storeId) ?? 'Unknown store') : undefined) : null;
            const count = memberCounts?.get(d.id);
            const active = memberCounts ? (count?.active ?? 0) : membersFailed ? null : undefined;
            const inactive = count?.inactive ?? 0;
            const isDeleting = deletingId === d.id;
            const head = headByDepartment ? (headByDepartment.get(d.id) ?? null) : undefined;

            return (
              <tr
                key={d.id}
                onClick={() => onEdit(d)}
                tabIndex={0}
                onKeyDown={activateOnKey(() => onEdit(d))}
                className={cn(TR_CLASS, isDeleting && 'opacity-50 pointer-events-none')}
              >
                <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <ColorIconTile icon={Building2} name={d.name} size="sm" />
                    <span
                      className={cn('text-sm font-display font-bold line-clamp-2 leading-snug break-words min-w-0', d.isActive ? 'text-text' : 'text-text-secondary')}
                      title={d.name}
                    >
                      {d.name}
                    </span>
                    {!d.isActive && (
                      <StateChip active={false} label="Inactive" size="sm" />
                    )}
                  </div>
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap')}>
                  {store === undefined ? (
                    <Skeleton className="h-3 w-24" />
                  ) : store ? (
                    store
                  ) : (
                    <span className="italic text-text-light">Not set</span>
                  )}
                </td>

                <td className={cn(TD_CLASS, 'whitespace-nowrap')}>
                  {head === undefined ? (
                    <Skeleton className="h-3 w-24" />
                  ) : head ? (
                    <span className="font-medium text-text">{head}</span>
                  ) : (
                    <span className="text-text-light">{d.headOptional ? 'Not needed' : 'No head'}</span>
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

                <td className={cn(TD_CLASS, 'whitespace-nowrap text-right')}>
                  <ScoreCell
                    kind="department"
                    id={d.id}
                    name={d.name}
                    row={scoreById ? (scoreById.get(d.id) ?? null) : scoreWindow.failed ? null : undefined}
                    from={scoreWindow.from}
                    to={scoreWindow.to}
                    failed={scoreWindow.failed}
                  />
                </td>

                <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                  <StatusPill
                    active={d.isActive}
                    isUpdating={updatingId === d.id}
                    onToggle={() => onToggleActive(d)}
                    ariaLabel={`${d.isActive ? 'Deactivate' : 'Activate'} ${d.name}`}
                  />
                </td>

                <td className={cn(TD_CLASS, 'w-24')} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    <EntityCardActions
                      onEdit={() => onEdit(d)}
                      onDelete={onDelete ? () => onDelete(d) : undefined}
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
