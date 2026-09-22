import { Plus } from 'lucide-react';
import { STATUS_LABEL } from './taskDisplay';
import { SelectFilterRow, MultiSelectFilterRow, PeopleFilterRow, type FilterOption } from '../../components/filterRow';
import { toFilterPeople } from '../../lib/filterPeople';
import { labelDotClass } from '../../lib/labelColors';
import type { CategoryFilterKey, TaskFilters } from './taskFilters';
import type { Task } from '../../api/task';
import type { AssignableUser } from '../../api/users';
import type { Tag } from '../../api/tags';

interface TaskFilterFieldsProps {
  filters:          TaskFilters;
  onChange:         (patch: Partial<TaskFilters>) => void;
  assignableUsers?: AssignableUser[];
  tags?:            Tag[];
  /** Already filtered to active stores by TaskList. */
  storeOptions:     { id: string; name: string }[];
  /** Already narrowed to the selected store's departments by TaskList. */
  departmentOptions: { id: string; name: string }[];
  isAdmin?:         boolean;
  onAddUser?:       () => void;
  /** Omit the Category row entirely — for a page that's already locked to one category (Smart
   *  Delegations), where there's nothing left to pick between. */
  hideCategory?:    boolean;
}

const STATUS_OPTIONS: FilterOption<TaskFilters['status']>[] = [
  { value: 'all', label: 'All' },
  ...(Object.entries(STATUS_LABEL) as [Task['status'], string][]).map(([value, label]) => ({ value, label })),
];

const CATEGORY_OPTIONS: FilterOption<CategoryFilterKey>[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'issue', label: 'Issue' },
  { value: 'delegation', label: 'Delegation' },
  { value: 'task', label: 'Direct Task' },
];

const PRIORITY_OPTIONS: FilterOption<Task['priority']>[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// Same shape as tickets/list/TicketFilterFields.tsx — renders Category/Status/Priority/Department/
// Assignee/Raised by as ordinary rows inside the Options modal's own list, no separate trigger,
// header, or Apply/Clear footer of its own. Both now build those rows from the shared
// components/filterRow set rather than each assembling them out of the primitives.
export const TaskFilterFields = ({ filters, onChange, assignableUsers, tags, storeOptions, departmentOptions, isAdmin = false, onAddUser, hideCategory = false }: TaskFilterFieldsProps) => {
  const people = toFilterPeople(assignableUsers);

  return (
    <>
      {!hideCategory && (
        <SelectFilterRow
          label="Category"
          options={CATEGORY_OPTIONS}
          value={filters.category}
          onSelect={(category) => onChange({ category })}
        />
      )}

      <SelectFilterRow label="Status" options={STATUS_OPTIONS} value={filters.status} onSelect={(status) => onChange({ status })} />

      <MultiSelectFilterRow
        label="Priority"
        options={PRIORITY_OPTIONS}
        selected={filters.priority}
        onChange={(priority) => onChange({ priority })}
      />

      {/* Labels. Hidden entirely when none exist rather than shown as an empty row — an ADMIN/PC
          creates them under Settings, and until someone has, this control has nothing to offer.
          Matched as OR server-side: a delegation carrying any selected label passes. */}
      {!!tags?.length && (
        <MultiSelectFilterRow
          label="Labels"
          options={tags.map((tag) => ({ value: tag.id, label: tag.name, dotClassName: labelDotClass(tag.name) }))}
          selected={filters.tagIds}
          onChange={(tagIds) => onChange({ tagIds })}
        />
      )}

      {/* Store and Department are the org scope the page is read in. They spent a while as
          permanent boxes in the toolbar; they're rows here now, so the toolbar carries only the
          view strip and the primary actions. Each is hidden when there's nothing to choose
          between — one store and one department is not a choice, it's the whole org.

          Store is listed before Department because picking one narrows the other: with a store
          selected, `storeOptions`/`departmentOptions` upstream only offers that store's
          departments, and TaskList clears a department that no longer belongs to the new store. */}
      {storeOptions.length > 1 && (
        <SelectFilterRow
          label="Store"
          options={[{ value: '', label: 'All stores' }, ...storeOptions.map(s => ({ value: s.id, label: s.name }))]}
          value={filters.storeId}
          onSelect={(storeId) => onChange({ storeId })}
        />
      )}

      {departmentOptions.length > 1 && (
        <SelectFilterRow
          label="Department"
          options={[{ value: '', label: 'All departments' }, ...departmentOptions.map(d => ({ value: d.id, label: d.name }))]}
          value={filters.departmentId}
          onSelect={(departmentId) => onChange({ departmentId })}
        />
      )}

      {!!people.length && (
        <PeopleFilterRow
          label="Assignee"
          people={people}
          selected={filters.assigneeIds}
          onChange={(assigneeIds) => onChange({ assigneeIds })}
          action={
            isAdmin && onAddUser ? (
              <button
                type="button"
                onClick={onAddUser}
                title="Add a new user"
                aria-label="Add a new user"
                className="flex items-center justify-center size-7 rounded-full border border-dashed border-border-hover text-text-light hover:text-primary-600 hover:border-primary-400 hover:bg-primary-50/50 transition-all cursor-pointer bg-surface"
              >
                <Plus size={13} strokeWidth={2.5} />
              </button>
            ) : undefined
          }
        />
      )}

      {!!people.length && (
        <PeopleFilterRow
          label="Raised by"
          people={people}
          selected={filters.raisedByIds}
          onChange={(raisedByIds) => onChange({ raisedByIds })}
        />
      )}
    </>
  );
};
