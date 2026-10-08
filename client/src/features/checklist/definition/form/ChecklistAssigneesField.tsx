import { useId } from 'react';
import { Link } from 'react-router';
import { Users, UserCheck } from 'lucide-react';
import { UserBulkPicker } from '../../UserBulkPicker';
import { LABEL_CLASS } from './formConstants';

interface ChecklistAssigneesFieldProps {
  /** Every store this checklist targets — assignees are scoped to "belongs to any of these", not
   *  just the first store picked in the schedule step. */
  storeIds: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export const ChecklistAssigneesField = ({
  storeIds,
  selected,
  onChange,
  className = '',
}: ChecklistAssigneesFieldProps) => {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className={`flex flex-col gap-1.5 w-full ${className}`}>
      {/* Field Header & Count Badge */}
      <div className="flex items-center justify-between gap-2">
        {/* A caption for the checkbox list below, not a label for one control, so a span. */}
        <span id={labelId} className={LABEL_CLASS}>
          <Users size={14} className="text-text-muted shrink-0" />
          <span>Assigned Users</span>
        </span>

        {selected.length > 0 && (
          <span className="text-[0.6875rem] font-display font-medium text-text-muted flex items-center gap-1">
            <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
            <span>{selected.length} assigned</span>
          </span>
        )}
      </div>

      <UserBulkPicker
        storeIds={storeIds}
        selected={selected}
        onChange={onChange}
        emptyHint={
          // Assignees must belong to one of the checklist's stores (enforced server-side too), so
          // an empty list almost always means nobody has that store set on their profile yet.
          <div className="flex flex-col gap-1.5 px-2 py-2 text-xs font-display text-text-muted">
            <span className="font-semibold text-text">Nobody works at {storeIds.length === 1 ? 'this store' : 'these stores'} yet.</span>
            <span>
              Set each person's store in{' '}
              <Link to="/admin/directory" className="font-semibold text-primary-700 dark:text-primary-300 underline underline-offset-2 hover:text-primary-800 dark:hover:text-primary-200">
                People & Teams
              </Link>
              , or go back and pick a different store.
            </span>
          </div>
        }
      />

      {/* Helper Subtext */}
      <p className="hidden sm:block text-[0.6875rem] font-display text-text-muted">
        Tick the people who fill this in, or add a whole store or department at once.
      </p>
    </div>
  );
};
