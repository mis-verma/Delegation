import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2, UsersRound } from 'lucide-react';
import { UserMultiSelect } from '../../components';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { userApi } from '../../api/users';
import { useDepartmentsQuery } from './hook';

interface UserBulkPickerProps {
  /** Every store this picker's scope targets — a person is assignable from any of them. */
  storeIds: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Replaces the plain "no users" line in the list below. */
  emptyHint?: ReactNode;
  /** Defaults to "Select everyone at this store" — overridden by callers picking a narrower role
   *  (e.g. auditors) so the button reads as "everyone", not implicitly "everyone assigned". */
  everyoneLabel?: string;
}

// Shared by ChecklistAssigneesField (who fills a checklist in) and AuditFields' auditor picker
// (who audits one AUDIT item) — same underlying need: pick a handful of specific people out of a
// store or department, with a bulk shortcut for "basically everyone here" so a real store roster
// (a dozen-plus people) doesn't have to be ticked one by one. Both bulk actions only ADD into
// whatever's already selected — they're a convenience, never a scope lock — and every person
// stays individually togglable afterward via the checkbox list below.
export const UserBulkPicker = ({ storeIds, selected, onChange, emptyHint, everyoneLabel = 'Select everyone at this store' }: UserBulkPickerProps) => {
  const { data: allDepartments = [] } = useDepartmentsQuery();
  const departments = allDepartments.filter((d) => d.isActive);
  const [loadingDeptId, setLoadingDeptId] = useState<string | null>(null);
  const [loadingEveryone, setLoadingEveryone] = useState(false);

  const selectAllInDepartment = async (departmentId: string) => {
    setLoadingDeptId(departmentId);
    try {
      const { data: deptUsers } = await userApi.getAssignable(departmentId, undefined, storeIds);
      const newIds = deptUsers.map((u) => u.id).filter((id) => !selected.includes(id));
      const deptName = departments.find((d) => d.id === departmentId)?.name ?? 'that department';
      if (newIds.length) {
        onChange([...selected, ...newIds]);
        toast.success(`Added ${newIds.length} ${newIds.length === 1 ? 'person' : 'people'} from ${deptName}`);
      } else {
        toast.info(`Everyone in ${deptName} is already selected`);
      }
    } finally {
      setLoadingDeptId(null);
    }
  };

  const selectEveryone = async () => {
    setLoadingEveryone(true);
    try {
      const { data: storeUsers } = await userApi.getAssignable(undefined, undefined, storeIds);
      const newIds = storeUsers.map((u) => u.id).filter((id) => !selected.includes(id));
      if (newIds.length) {
        onChange([...selected, ...newIds]);
        toast.success(`Added ${newIds.length} ${newIds.length === 1 ? 'person' : 'people'}`);
      } else {
        toast.info('Everyone at this store is already selected');
      }
    } finally {
      setLoadingEveryone(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Bulk-select shortcuts — both only ADD into the checkbox list below, same as each other. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectEveryone}
          disabled={loadingEveryone}
          className="press-feedback flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-display font-medium text-text-secondary hover:bg-surface-hover hover:border-border/80 hover:text-text transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        >
          {loadingEveryone ? <Loader2 size={13} className="animate-spin text-text-muted" /> : <UsersRound size={13} className="text-text-muted shrink-0" />}
          <span>{everyoneLabel}</span>
        </button>

        {departments.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={selectAllInDepartment}>
              <SelectTrigger size="sm" className="w-auto min-w-[13rem] h-8 rounded-md text-xs font-display font-medium" disabled={!!loadingDeptId}>
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

      {/* Grouped by department so a whole-store pick doesn't run every department's staff
          together in one undifferentiated list. */}
      <UserMultiSelect
        storeIds={storeIds}
        selected={selected}
        onChange={onChange}
        departments={allDepartments}
        emptyHint={emptyHint}
      />
    </div>
  );
};
