import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Building2, ChevronDown, UsersRound } from 'lucide-react';
import { Button, Dropdown, UserMultiSelect } from '../../components';
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

const LOAD_ERROR = "Couldn't load people. Try again.";

// Shared by ChecklistAssigneesField (who fills a checklist in) and AuditFields' auditor picker
// (who audits one AUDIT item) — same underlying need: pick a handful of specific people out of a
// store or department, with a bulk shortcut for "basically everyone here" so a real store roster
// (a dozen-plus people) doesn't have to be ticked one by one. Both bulk actions only ADD into
// whatever's already selected — they're a convenience, never a scope lock — and every person
// stays individually togglable afterward via the checkbox list below.
export const UserBulkPicker = ({ storeIds, selected, onChange, emptyHint, everyoneLabel = 'Select everyone at this store' }: UserBulkPickerProps) => {
  const { data: allDepartments = [] } = useDepartmentsQuery();
  const departments = useMemo(() => allDepartments.filter((d) => d.isActive), [allDepartments]);
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
    } catch {
      toast.error(LOAD_ERROR);
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
    } catch {
      toast.error(LOAD_ERROR);
    } finally {
      setLoadingEveryone(false);
    }
  };

  const departmentItems = departments.map((d) => ({ label: d.name, onClick: () => { void selectAllInDepartment(d.id); } }));

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {/* Bulk-select shortcuts — both only ADD into the checkbox list below, same as each other. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={selectEveryone} isLoading={loadingEveryone}>
          {!loadingEveryone && <UsersRound size={13} className="text-text-muted shrink-0" />}
          <span>{everyoneLabel}</span>
        </Button>

        {departments.length > 0 && (
          <Dropdown
            align="start"
            items={departmentItems}
            trigger={
              <Button variant="outline" size="sm" isLoading={!!loadingDeptId}>
                {!loadingDeptId && <Building2 size={13} className="text-text-muted shrink-0" />}
                <span>Select all in a department</span>
                <ChevronDown size={13} className="text-text-muted shrink-0" />
              </Button>
            }
          />
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
