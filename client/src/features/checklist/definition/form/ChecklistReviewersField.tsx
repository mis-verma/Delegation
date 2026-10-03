import { useId } from 'react';
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
// list is meant to stay small and hand-picked, not mirror the whole staff roster. Grouped by
// department (via UserMultiSelect's `departments` prop) so a department's HOD — badged "HOD" —
// is easy to spot and add without scanning the full org roster. A new checklist starts with every
// PC user pre-picked (see ChecklistBuilder's reviewerDefaultAppliedRef) — still just a starting
// point the maker can remove from or add to.
export const ChecklistReviewersField = ({
  storeIds,
  selected,
  onChange,
  className = '',
}: ChecklistReviewersFieldProps) => {
  const { data: allDepartments = [] } = useDepartmentsQuery();
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {/* A caption for the checkbox list below, not a label for one control, so a span. */}
        <span id={labelId} className={LABEL_CLASS}>
          <ShieldCheck size={14} className="text-text-muted shrink-0" />
          <span>Reviewers <span className="text-text-muted/70 font-medium">(Optional)</span></span>
        </span>

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
        Starts with PC pre-selected. Anyone you add here can approve or reject this checklist's
        runs, on top of PC/Admin and the department head of anyone assigned. Look for the
        "HOD" badge to add a department head directly.
      </p>
    </div>
  );
};
