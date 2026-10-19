import { useId, useState } from 'react';
import { Globe2, ShieldCheck, UserCheck } from 'lucide-react';
import { UserMultiSelect } from '../../../../components';
import { useAssignableUsersQuery, useDepartmentsQuery } from '../../hook';
import { LABEL_CLASS } from './formConstants';

interface ChecklistReviewersFieldProps {
  storeIds: string[];
  selected: string[];
  totalSelected?: number;
  onChange: (ids: string[]) => void;
  isNew?: boolean;
  className?: string;
}

export const ChecklistReviewersField = ({
  storeIds,
  selected,
  onChange,
  totalSelected,
  isNew = false,
  className = '',
}: ChecklistReviewersFieldProps) => {
  const { data: allDepartments = [] } = useDepartmentsQuery();
  const labelId = useId();
  const [anywhere, setAnywhere] = useState(false);
  const everyone = useAssignableUsersQuery();
  const pcIds = (everyone.data ?? []).filter((u) => u.role === 'PC').map((u) => u.id);
  const hasAllPc = pcIds.length > 0 && pcIds.every((id) => selected.includes(id));

  return (
    <div role="group" aria-labelledby={labelId} className={`flex flex-col gap-1.5 w-full ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className={LABEL_CLASS}>
          <ShieldCheck size={14} className="text-text-muted shrink-0" />
          <span>Reviewers <span className="text-text-muted/70 font-medium">(Optional)</span></span>
        </span>

        {(totalSelected ?? selected.length) > 0 && (
          <span className="t-meta font-display font-medium text-text-muted flex items-center gap-1">
            <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
            <span>{totalSelected ?? selected.length} reviewer{(totalSelected ?? selected.length) === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>

      <UserMultiSelect
        all={anywhere}
        storeIds={anywhere ? undefined : storeIds}
        selected={selected}
        onChange={onChange}
        departments={allDepartments}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={anywhere}
          onClick={() => setAnywhere((v) => !v)}
          className={`inline-flex items-center gap-1.5 h-9 pointer-coarse:h-11 px-3 rounded-lg border t-meta font-display font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer ${anywhere ? 'border-primary-500/60 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border bg-surface text-text-secondary hover:border-primary-300'}`}
        >
          <Globe2 className="size-3.5" aria-hidden />
          {anywhere ? 'Showing everyone' : 'Search everyone, any store'}
        </button>
        {pcIds.length > 0 && !hasAllPc && (
          <button
            type="button"
            onClick={() => onChange([...new Set([...selected, ...pcIds])])}
            className="inline-flex items-center gap-1.5 h-9 pointer-coarse:h-11 px-3 rounded-lg border border-border bg-surface t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-primary-300 focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Add all PC
          </button>
        )}
      </div>

      <p className="t-meta font-display text-text-muted">
        {isNew && 'Starts with PC pre-selected. '}Anyone you add here can approve or reject this checklist's
        runs, on top of PC/Admin and the department head of anyone assigned. Look for the
        "HOD" badge to add a department head directly.
      </p>
    </div>
  );
};
