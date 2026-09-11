import { ShieldCheck, UserCheck } from 'lucide-react';
import { UserMultiSelect } from '../../../../components';
import { useDepartmentsQuery } from '../../hook';
import { LABEL_CLASS } from './formConstants';

interface ChecklistReviewersFieldProps {
  /** Every store this checklist targets — reviewers are scoped to "belongs to any of these",
   *  same as assignees. */
  storeIds: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// Explicit reviewers, additive on top of the role-based verify rule (ADMIN/PC always, any
// MANAGER/HOD in the assignees' own department) — naming someone here lets them approve/reject
// this checklist's instances regardless of role or department. Deliberately no bulk "select
// everyone"/"select a department" shortcuts here (unlike ChecklistAssigneesField) — a reviewer
// list is meant to stay small and hand-picked, not mirror the whole staff roster.
export const ChecklistReviewersField = ({
  storeIds,
  selected,
  onChange,
  className = '',
}: ChecklistReviewersFieldProps) => {
  const { data: allDepartments = [] } = useDepartmentsQuery();

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className={`${LABEL_CLASS} flex items-center gap-1.5 cursor-pointer`}>
          <ShieldCheck size={14} className="text-text-muted shrink-0" />
          <span>Reviewers <span className="text-text-muted/70 font-medium">(Optional)</span></span>
        </label>

        {selected.length > 0 && (
          <span className="text-[11px] font-display font-medium text-text-muted flex items-center gap-1">
            <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
            <span>{selected.length} reviewer{selected.length === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>

      <UserMultiSelect
        storeIds={storeIds}
        selected={selected}
        onChange={onChange}
        departments={allDepartments}
      />

      <p className="text-[11px] font-display text-text-muted">
        Anyone picked here can approve or reject this checklist's runs, on top of whoever already
        can (PC/Admin always, or the HOD of an assigned team member's department).
      </p>
    </div>
  );
};
