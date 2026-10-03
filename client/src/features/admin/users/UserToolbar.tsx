import { LayoutGrid, Plus, Search, Table2, X } from 'lucide-react';
import {
  Button,
  EntityStatusFilter,
  Input,
  SelectDropdown,
  ToggleChip,
  ViewToggle,
  type EntityStatusFilterValue,
  type SelectDropdownOption,
  type ViewTab,
} from '../../../components';
import type { Role } from '../../../api/admin';
import { ROLE_META, ROLE_ORDER } from '../roleBadge';
import type { SortDir, UserFilters, UserSortKey, UserView } from './useFilteredUsers';

interface UserToolbarProps {
  searchText: string;
  onSearchText: (value: string) => void;
  filters: UserFilters;
  onFilters: (patch: Partial<UserFilters>) => void;
  counts: { all: number; active: number; inactive: number };
  sort: UserSortKey;
  dir: SortDir;
  onSort: (key: UserSortKey) => void;
  view: UserView;
  onView: (view: UserView) => void;
  hasFilters: boolean;
  onClear: () => void;
  departmentOptions: SelectDropdownOption<string>[];
  storeOptions: SelectDropdownOption<string>[];
  /** "12 of 48 people", shown while something narrows the list. */
  resultText: string | null;
  onNew: () => void;
  /** Starts downloading the form's code before it is needed. */
  onPreloadForm: () => void;
}

const VIEW_TABS: ViewTab<UserView>[] = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  // A wide table is not usable one-handed, so phones keep the cards.
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
];

const ROLE_FILTER_OPTIONS: SelectDropdownOption<Role | ''>[] = [
  { value: '', label: 'All roles' },
  ...ROLE_ORDER.map((r) => ({ value: r, label: ROLE_META[r].label })),
];

const SORT_OPTIONS: SelectDropdownOption<UserSortKey>[] = [
  { value: 'name', label: 'Sort: Name' },
  { value: 'role', label: 'Sort: Role' },
  { value: 'department', label: 'Sort: Department' },
  { value: 'store', label: 'Sort: Store' },
  { value: 'status', label: 'Sort: Status' },
  { value: 'newest', label: 'Sort: Newest' },
  { value: 'lastActive', label: 'Sort: Last active' },
];

export const UserToolbar = ({
  searchText, onSearchText, filters, onFilters, counts, sort, onSort, view, onView, hasFilters, onClear,
  departmentOptions, storeOptions, resultText, onNew, onPreloadForm,
}: UserToolbarProps) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 basis-64 min-w-0">
        <Input
          id="user-search"
          type="text"
          aria-label="Search people"
          placeholder="Search by name, email, phone or role"
          autoComplete="off"
          value={searchText}
          onChange={(e) => onSearchText(e.target.value)}
          suffix={
            searchText ? (
              <button
                type="button"
                onClick={() => onSearchText('')}
                aria-label="Clear search"
                className="flex items-center justify-center size-8 -mr-2 rounded-md text-text-light hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              >
                <X size={15} />
              </button>
            ) : (
              <Search size={15} aria-hidden />
            )
          }
        />
      </div>
      <ViewToggle tabs={VIEW_TABS} value={view} onChange={onView} />
      <Button
        variant="primary"
        size="sm"
        onClick={onNew}
        onMouseEnter={onPreloadForm}
        onFocus={onPreloadForm}
        className="group"
      >
        <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
        New user
      </Button>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <EntityStatusFilter
        value={filters.status}
        onChange={(status: EntityStatusFilterValue) => onFilters({ status })}
        counts={counts}
        inactiveLabel="Deactivated"
      />
      <div className="w-full sm:w-52">
        <SelectDropdown value={sort} onChange={onSort} options={SORT_OPTIONS} aria-label="Sort people" align="end" />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <SelectDropdown
        value={filters.role}
        onChange={(role) => onFilters({ role })}
        options={ROLE_FILTER_OPTIONS}
        aria-label="Filter by role"
      />
      <SelectDropdown
        value={filters.department}
        onChange={(department) => onFilters({ department, noDepartment: false })}
        options={departmentOptions}
        aria-label="Filter by department"
      />
      <SelectDropdown
        value={filters.store}
        onChange={(store) => onFilters({ store, noStore: false })}
        options={storeOptions}
        aria-label="Filter by store"
      />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <ToggleChip on={filters.heads} onClick={() => onFilters({ heads: !filters.heads })}>Department heads</ToggleChip>
      <ToggleChip on={filters.noDepartment} onClick={() => onFilters({ noDepartment: !filters.noDepartment, department: '' })}>No department</ToggleChip>
      <ToggleChip on={filters.noStore} onClick={() => onFilters({ noStore: !filters.noStore, store: '' })}>No store</ToggleChip>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-3.5" aria-hidden />
          Clear filters
        </Button>
      )}
      <span className="sr-only" aria-live="polite">{resultText ?? ''}</span>
      {resultText && <span aria-hidden className="text-xs font-display text-text-muted sm:ml-auto">{resultText}</span>}
    </div>
  </div>
);
