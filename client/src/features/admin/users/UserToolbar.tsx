import { useState, type ReactNode } from 'react';
import {
  ArrowDownAZ, ArrowUpDown, Building2, Clock, Crown, LayoutGrid, MapPinOff, Plus, Search, ShieldCheck, Store, Table2,
  UserCheck, UserX, Users, X, Activity, Layers, type LucideIcon,
} from 'lucide-react';
import {
  Button,
  Input,
  ViewToggle,
  type EntityStatusFilterValue,
  type SelectDropdownOption,
  type ViewTab,
} from '../../../components';
import {
  OptionsSheet, OptionSection, OptionSegmented, OptionSelect, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../../components/optionsSheet';
import { cn } from '@/lib/utils';
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
  shownCount: number;
  totalPeople: number;
  resultText: string | null;
  onNew: () => void;
  exportMenu?: ReactNode;
  onPreloadForm: () => void;
}

const VIEW_TABS: ViewTab<UserView>[] = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
];

const SORT_LABEL: Record<UserSortKey, string> = {
  name: 'Name',
  role: 'Role',
  department: 'Department',
  store: 'Store',
  status: 'Status',
  newest: 'Newest',
  lastActive: 'Last active',
};

const SORT_ICON: Record<UserSortKey, LucideIcon> = {
  name: ArrowDownAZ,
  role: ShieldCheck,
  department: Building2,
  store: Store,
  status: UserCheck,
  newest: Clock,
  lastActive: Activity,
};

export const UserToolbar = ({
  searchText, onSearchText, filters, onFilters, counts, sort, onSort, view, onView, hasFilters, onClear,
  departmentOptions, storeOptions, shownCount, totalPeople, resultText, onNew, onPreloadForm, exportMenu,
}: UserToolbarProps) => {
  const [showOptions, setShowOptions] = useState(false);

  const activeCount =
    Number(filters.status !== 'all') + Number(!!filters.role) + Number(!!filters.department) + Number(!!filters.store) +
    Number(filters.noDepartment) + Number(filters.noStore) + Number(filters.heads);

  const departments = departmentOptions.filter((o) => o.value !== '');
  const stores = storeOptions.filter((o) => o.value !== '');

  const roleKey = filters.role as keyof typeof ROLE_META | '';
  const filterChips: { key: string; label: string; icon: LucideIcon; clear: () => void }[] = [
    ...(roleKey ? [{ key: 'role', label: ROLE_META[roleKey].label, icon: ShieldCheck, clear: () => onFilters({ role: '' }) }] : []),
    ...(filters.department ? [{ key: 'department', label: departments.find((d) => d.value === filters.department)?.label ?? 'Department', icon: Building2, clear: () => onFilters({ department: '' }) }] : []),
    ...(filters.store ? [{ key: 'store', label: stores.find((o) => o.value === filters.store)?.label ?? 'Store', icon: Store, clear: () => onFilters({ store: '' }) }] : []),
    ...(filters.heads ? [{ key: 'heads', label: 'Department heads', icon: Crown, clear: () => onFilters({ heads: false }) }] : []),
    ...(filters.noDepartment ? [{ key: 'noDepartment', label: 'No department', icon: MapPinOff, clear: () => onFilters({ noDepartment: false }) }] : []),
    ...(filters.noStore ? [{ key: 'noStore', label: 'No store', icon: MapPinOff, clear: () => onFilters({ noStore: false }) }] : []),
  ];

  const resetOptions = () => {
    onClear();
    onSort('name');
  };

  const statusOptions: { value: EntityStatusFilterValue; label: string; icon: LucideIcon }[] = [
    { value: 'all', label: `All ${counts.all}`, icon: Users },
    { value: 'active', label: `Active ${counts.active}`, icon: UserCheck },
    { value: 'inactive', label: `Deactivated ${counts.inactive}`, icon: UserX },
  ];

  const statusTabs: { value: EntityStatusFilterValue; label: string; icon: LucideIcon; count: number }[] = [
    { value: 'all', label: 'All', icon: Users, count: counts.all },
    { value: 'active', label: 'Active', icon: UserCheck, count: counts.active },
    { value: 'inactive', label: 'Deactivated', icon: UserX, count: counts.inactive },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 basis-36 sm:basis-64 min-w-0">
          <Input
            id="user-search"
            type="text"
            aria-label="Search people"
            placeholder="Search people by name, email or phone"
            autoComplete="off"
            value={searchText}
            onChange={(e) => onSearchText(e.target.value)}
            suffix={
              searchText ? (
                <button
                  type="button"
                  onClick={() => onSearchText('')}
                  aria-label="Clear search"
                  className="flex items-center justify-center size-8 pointer-coarse:size-11 -mr-2 rounded-md text-text-light hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                >
                  <X size={15} />
                </button>
              ) : (
                <Search size={15} aria-hidden />
              )
            }
          />
        </div>

        <ViewToggle tabs={VIEW_TABS} value={view} onChange={onView} storageKey="view:people" />

        <OptionsSheet
          isOpen={showOptions}
          setIsOpen={setShowOptions}
          activeCount={activeCount}
          subtitle={`${shownCount} of ${totalPeople} people`}
          onReset={resetOptions}
          canReset={hasFilters || sort !== 'name'}
          showLabel={`Show ${shownCount} ${shownCount === 1 ? 'person' : 'people'}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <OptionSection icon={Users} label="Status">
              <OptionSegmented
                options={statusOptions}
                value={filters.status}
                onChange={(status) => onFilters({ status })}
              />
            </OptionSection>
            <OptionSection icon={ArrowUpDown} label="Sort by">
              <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={onSort} />
            </OptionSection>
          </div>

          <OptionSection icon={ShieldCheck} label="Role" aside={!!filters.role && <ChoiceClear onClick={() => onFilters({ role: '' })} />}>
            <ChoiceWrap>
              {ROLE_ORDER.map((r) => (
                <ChoiceChip
                  key={r}
                  active={filters.role === r}
                  onClick={() => onFilters({ role: filters.role === r ? '' : r })}
                  lead={<ChoiceIcon icon={ShieldCheck} tone="bg-primary-700" />}
                >
                  {ROLE_META[r].label}
                </ChoiceChip>
              ))}
            </ChoiceWrap>
          </OptionSection>

          {departments.length > 0 && (
            <OptionSection icon={Building2} label="Department" aside={!!filters.department && <ChoiceClear onClick={() => onFilters({ department: '' })} />}>
              <ChoiceWrap>
                {departments.map((d) => (
                  <ChoiceChip
                    key={d.value}
                    active={filters.department === d.value}
                    onClick={() => onFilters({ department: filters.department === d.value ? '' : d.value, noDepartment: false })}
                    lead={<ChoiceIcon icon={Building2} tone="bg-primary-600" />}
                  >
                    {d.label}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
          )}

          {stores.length > 0 && (
            <OptionSection icon={Store} label="Store" aside={!!filters.store && <ChoiceClear onClick={() => onFilters({ store: '' })} />}>
              <ChoiceWrap>
                {stores.map((s) => (
                  <ChoiceChip
                    key={s.value}
                    active={filters.store === s.value}
                    onClick={() => onFilters({ store: filters.store === s.value ? '' : s.value, noStore: false })}
                    lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}
                  >
                    {s.label}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
          )}

          <OptionSection icon={Layers} label="Quick filters">
            <ChoiceWrap>
              <ChoiceChip
                active={filters.heads}
                onClick={() => onFilters({ heads: !filters.heads })}
                lead={<ChoiceIcon icon={Crown} tone="bg-primary-700" />}
              >
                Department heads
              </ChoiceChip>
              <ChoiceChip
                active={filters.noDepartment}
                onClick={() => onFilters({ noDepartment: !filters.noDepartment, department: '' })}
                lead={<ChoiceIcon icon={MapPinOff} tone="bg-primary-600" />}
              >
                No department
              </ChoiceChip>
              <ChoiceChip
                active={filters.noStore}
                onClick={() => onFilters({ noStore: !filters.noStore, store: '' })}
                lead={<ChoiceIcon icon={MapPinOff} tone="bg-primary-600" />}
              >
                No store
              </ChoiceChip>
            </ChoiceWrap>
          </OptionSection>
        </OptionsSheet>

        {exportMenu}

        <Button
          variant="primary"
          size="sm"
          onClick={onNew}
          onMouseEnter={onPreloadForm}
          onFocus={onPreloadForm}
          aria-label="New user"
          className="group max-sm:size-11 max-sm:px-0"
        >
          <Plus className="size-4 sm:size-3.5 transition-transform duration-300 group-hover:rotate-90" aria-hidden />
          <span className="max-sm:sr-only">New user</span>
        </Button>
      </div>

      <span className="sr-only" aria-live="polite">{resultText ?? ''}</span>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Show people" className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border/60 bg-surface-hover/50 p-0.5 no-scrollbar">
          {statusTabs.map(({ value, label, icon: Icon, count }) => {
            const active = filters.status === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onFilters({ status: value })}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 t-meta font-display font-semibold outline-none transition-all duration-200 cursor-pointer active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:h-8',
                  active ? 'bg-primary-600 text-white' : 'text-text-secondary hover:bg-surface hover:text-text',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
                <span className={cn('min-w-5 rounded-full px-1.5 text-center tabular-nums', active ? 'bg-white/20' : 'bg-text/8')}>{count}</span>
              </button>
            );
          })}
        </div>

        {filterChips.map(({ key, label, icon: Icon, clear }) => (
          <button
            key={key}
            type="button"
            onClick={clear}
            aria-label={`Remove filter ${label}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary-500/25 bg-primary-500/10 pl-2.5 pr-2 t-meta font-display font-semibold text-primary-700 outline-none transition-all duration-200 cursor-pointer hover:bg-primary-500/15 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300 sm:h-8"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
            <X className="size-3 opacity-70" aria-hidden />
          </button>
        ))}

        {resultText && <span aria-hidden className="t-meta font-display font-medium text-text-muted">{resultText}</span>}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} className="min-h-11 sm:min-h-8">
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
};
