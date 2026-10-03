import { memo, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../components';
import type { AdminUser, UserPresence } from '../../../api/admin';
import { presenceLabel } from '../presenceDisplay';
import { UserRow } from './UserRow';
import type { UserActionHandlers } from './UserActionsMenu';
import type { SortDir, UserSortKey } from './useFilteredUsers';

interface UserTableProps extends UserActionHandlers {
  users: AdminUser[];
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  presenceById: Map<string, UserPresence>;
  selectedIds: Set<string>;
  busyId: string | null;
  selfId?: string;
  sort: UserSortKey;
  dir: SortDir;
  onSort: (key: UserSortKey) => void;
  onToggleSelect: (id: string) => void;
  onTogglePage: (ids: string[], select: boolean) => void;
}

// Solid navy header, same treatment as every other dense table in the product (see TicketTable).
const HEAD_CLASS = 'px-3 py-2.5 text-left text-xs font-semibold text-white tracking-tight whitespace-nowrap';

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
      className="inline-flex items-center gap-1.5 -mx-1 px-1 min-h-8 rounded text-white cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {label}
      <Icon className={cn('size-3.5 shrink-0', !active && 'opacity-50')} aria-hidden />
    </button>
  );
};

const UserTableComponent = ({
  users, departmentNames, storeNames, presenceById, selectedIds, busyId, selfId, sort, dir,
  onSort, onToggleSelect, onTogglePage, onEdit, onResetPassword, onDeactivate, onReactivate, onDelete,
}: UserTableProps) => {
  const selectedOnPage = users.reduce((n, u) => n + (selectedIds.has(u.id) ? 1 : 0), 0);
  const allSelected = users.length > 0 && selectedOnPage === users.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const headCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headCheckbox.current) headCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  const ariaSort = (key: UserSortKey) => (sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');

  return (
    <div className={cn(PANEL_CLASS, 'w-full overflow-x-auto')}>
      <table className="w-full min-w-[60rem] border-collapse">
        <thead className="bg-primary-800">
          <tr>
            <th scope="col" className={cn(HEAD_CLASS, 'w-10')}>
              <label className="flex items-center justify-center size-8 cursor-pointer">
                <input
                  ref={headCheckbox}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onTogglePage(users.map((u) => u.id), !allSelected)}
                  aria-label="Select everyone on this page"
                  className="size-4 rounded accent-primary-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                />
              </label>
            </th>
            <th scope="col" aria-sort={ariaSort('name')} className={HEAD_CLASS}>
              <SortHeader label="Name" active={sort === 'name'} dir={dir} onClick={() => onSort('name')} />
            </th>
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
    </div>
  );
};

export const UserTable = memo(UserTableComponent);
