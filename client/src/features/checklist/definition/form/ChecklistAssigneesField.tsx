import { useState } from 'react';
import { Users, UserCheck, Building2, Loader2, UsersRound } from 'lucide-react';
import { UserMultiSelect } from '../../../../components';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../../components/ui/select';
import { userApi } from '../../../../api/users';
import { useDepartmentsQuery } from '../../hook';
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
  const { data: allDepartments = [] } = useDepartmentsQuery();
  const departments = allDepartments.filter((d) => d.isActive);
  const [loadingDeptId, setLoadingDeptId] = useState<string | null>(null);
  const [loadingEveryone, setLoadingEveryone] = useState(false);

  // "Pick a department -> everyone in it gets checked" is a bulk convenience, not a scope lock:
  // it only ADDS that department's people to whatever's already selected (never replaces), and
  // every checkbox below stays individually togglable afterward — a manager can still remove
  // specific people or add others from outside the department entirely.
  const selectAllInDepartment = async (departmentId: string) => {
    setLoadingDeptId(departmentId);
    try {
      const { data: deptUsers } = await userApi.getAssignable(departmentId, undefined, storeIds);
      const newIds = deptUsers.map((u) => u.id).filter((id) => !selected.includes(id));
      if (newIds.length) onChange([...selected, ...newIds]);
    } finally {
      setLoadingDeptId(null);
    }
  };

  // Same bulk-add pattern as selectAllInDepartment, but with no department filter at all — every
  // active user at the selected store(s), regardless of which department they're in. A checklist
  // like "Store Opening" genuinely needs every staff member on duty, not just one department's
  // worth, and picking each department one at a time (or naming people individually) was the only
  // way to get there before this.
  const selectEveryone = async () => {
    setLoadingEveryone(true);
    try {
      const { data: storeUsers } = await userApi.getAssignable(undefined, undefined, storeIds);
      const newIds = storeUsers.map((u) => u.id).filter((id) => !selected.includes(id));
      if (newIds.length) onChange([...selected, ...newIds]);
    } finally {
      setLoadingEveryone(false);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 w-full ${className}`}>
      {/* Field Header & Count Badge */}
      <div className="flex items-center justify-between gap-2">
        <label className={`${LABEL_CLASS} flex items-center gap-1.5 cursor-pointer`}>
          <Users size={14} className="text-text-muted shrink-0" />
          <span>Assigned Users</span>
        </label>

        {selected.length > 0 && (
          <span className="text-[11px] font-display font-medium text-text-muted flex items-center gap-1">
            <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
            <span>{selected.length} assigned</span>
          </span>
        )}
      </div>

      {/* Bulk-select shortcuts — both only ADD into the checkbox list below, same as each other. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectEveryone}
          disabled={loadingEveryone}
          className="press-feedback flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-display font-medium text-text-secondary hover:bg-surface-hover hover:border-border/80 hover:text-text transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        >
          {loadingEveryone ? <Loader2 size={13} className="animate-spin text-text-muted" /> : <UsersRound size={13} className="text-text-muted shrink-0" />}
          <span>Select everyone at this store</span>
        </button>

        {departments.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={selectAllInDepartment}>
              <SelectTrigger size="sm" className="w-auto min-w-[13rem]" disabled={!!loadingDeptId}>
                <Building2 size={13} className="text-text-muted shrink-0" />
                <SelectValue placeholder="Select all in a department…" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingDeptId && <Loader2 size={13} className="animate-spin text-text-muted" />}
          </div>
        )}
      </div>

      {/* Multi-Select Input — grouped by department so a whole-store pick doesn't run every
          department's staff together in one undifferentiated list. */}
      <UserMultiSelect
        storeIds={storeIds}
        selected={selected}
        onChange={onChange}
        departments={allDepartments}
      />

      {/* Helper Subtext */}
      <p className="text-[11px] font-display text-text-muted">
        Select specific store team members responsible for completing this checklist, or use the buttons above to check everyone at the store — or everyone in one department — at once.
      </p>
    </div>
  );
};
