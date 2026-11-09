import { memo, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminUser, UserPresence } from '../../../api/admin';
import { presenceLabel } from '../presenceDisplay';
import { UserRow } from './UserRow';
import type { UserActionHandlers } from './UserActionsMenu';
import type { SortDir, UserSortKey } from './useFilteredUsers';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS } from '../../../components/dataTable';

interface UserTableProps extends UserActionHandlers {
  users: AdminUser[];
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  presenceById: Map<string, UserPresence>;
  selectedIds: Set<string>;
  canSelect: (user: AdminUser) => boolean;
  busyId: string | null;
  selfId?: string;
  sort: UserSortKey;
  dir: SortDir;
  onSort: (key: UserSortKey) => void;
  onToggleSelect: (id: string) => void;
  onTogglePage: (ids: string[], select: boolean) => void;
}

const HEAD_CLASS = TH_CLASS;

const COLUMNS: { key: UserSortKey; label: string }[] = [
  { key: 'role', label: 'Role' },
  { key: 'department', label: 'Department' },
  { key: 'store', label: 'Store' },
  { key: 'status', label: 'Status' },
  { key: 'lastActive', label: 'Last active' },
];

const SortHeader = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) => {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 -mx-1 px-1 min-h-8 pointer-coarse:min-h-11 rounded transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70', active ? 'text-white' : 'text-white/75 hover:text-white')}
    >
      {label}
      <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-50')} aria-hidden />
    </button>
  );
};

const UserTableComponent = ({
  users, departmentNames, storeNames, presenceById, selectedIds, canSelect, busyId, selfId, sort, dir,
  onSort, onToggleSelect, onTogglePage, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserTableProps) => {
  const selectable = users.filter(canSelect);
  const selectedOnPage = selectable.reduce((n, u) => n + (selectedIds.has(u.id) ? 1 : 0), 0);
  const allSelected = selectable.length > 0 && selectedOnPage === selectable.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const headCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headCheckbox.current) headCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  const ariaSort = (key: UserSortKey) => (sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className={TABLE_FRAME_CLASS}>
      <table className="w-full min-w-[66rem] border-collapse">
        <caption className="sr-only">People</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, TH_CORNER_CLASS, 'w-14 min-w-14')}>
              <label className="flex items-center justify-center size-8 pointer-coarse:size-11 cursor-pointer">
                <input
                  ref={headCheckbox}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onTogglePage(selectable.map((u) => u.id), !allSelected)}
                  aria-label="Select everyone on this page"
                  className="size-4 rounded accent-primary-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
                />
              </label>
            </th>
            <th scope="col" aria-sort={ariaSort('name')} className={cn(HEAD_CLASS, 'left-14 z-30')}>
              <SortHeader label="Name" active={sort === 'name'} dir={dir} onClick={() => onSort('name')} />
            </th>
            <th scope="col" className={HEAD_CLASS}>Employee ID</th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={ariaSort(c.key)} className={HEAD_CLASS}>
                <SortHeader label={c.label} active={sort === c.key} dir={dir} onClick={() => onSort(c.key)} />
              </th>
            ))}
            <th scope="col" className={cn(HEAD_CLASS, 'w-12')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const presence = presenceById.get(u.id);
            return (
              <UserRow
                key={u.id}
                user={u}
                departmentName={u.departmentId ? departmentNames.get(u.departmentId) : undefined}
                storeName={u.storeId ? storeNames.get(u.storeId) : undefined}
                online={presence?.online}
                presenceText={presenceLabel(presence)}
                selected={selectedIds.has(u.id)}
                selectable={canSelect(u)}
                busy={busyId === u.id}
                isSelf={u.id === selfId}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onResetPassword={onResetPassword}
                onDeactivate={onDeactivate}
                onReactivate={onReactivate}
                onDelete={onDelete}
              />
            );
          })}
        </tbody>
      </table>

      <p className="sr-only" aria-live="polite">{users.length} {users.length === 1 ? 'person' : 'people'}, sorted.</p>
    </div>
  );
};

export const UserTable = memo(UserTableComponent);
