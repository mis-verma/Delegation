import { useState, type ReactNode } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { useAssignableUsersQuery } from '../../features/tickets/hook';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import type { AssignableUser } from '../../api/users';

interface UserMultiSelectProps {
  departmentId?: string;
  storeId?: string;
  storeIds?: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
  departments?: { id: string; name: string }[];
  all?: boolean;
  emptyHint?: ReactNode;
}

const userLabel = (u: AssignableUser) => `${u.firstName} ${u.lastName ?? ''}`.trim();

export const UserMultiSelect = ({ departmentId, storeId, storeIds, selected, onChange, departments, emptyHint, all = false }: UserMultiSelectProps) => {
  const { data: allUsers, isLoading } = useAssignableUsersQuery(departmentId, storeId, storeIds);
  const [query, setQuery] = useState('');
  const showSearch = (allUsers?.length ?? 0) > 8;
  const needle = query.trim().toLowerCase();
  const users = needle ? allUsers?.filter((u) => userLabel(u).toLowerCase().includes(needle)) : allUsers;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  if (!all && !departmentId && !storeId && !storeIds?.length) {
    return (
      <div className="p-3 text-sm font-display text-text-muted bg-surface-hover/40 border border-border rounded-lg">
        Select a department or store first.
      </div>
    );
  }

  const renderUserRow = (u: AssignableUser) => {
    const name = userLabel(u);
    const checked = selected.includes(u.id);
    return (
      <button
        key={u.id}
        type="button"
        aria-pressed={checked}
        onClick={() => toggle(u.id)}
        className={`flex items-center gap-2.5 px-2 py-2 pointer-coarse:min-h-12 pointer-coarse:px-3 rounded-md text-sm font-display text-left transition-colors duration-150 cursor-pointer ${
          checked ? 'bg-primary-500/10 text-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
        }`}
      >
        <span className={`flex items-center justify-center size-7 pointer-coarse:size-8 rounded-full t-meta font-bold text-white shrink-0 ${avatarColorClass(name)}`}>
          {getInitials(name)}
        </span>
        <span className="flex-1 min-w-0 truncate">{name}</span>
        {(u.role === 'MANAGER' || u.role === 'SENIOR') && (
          <span className="shrink-0 text-xs font-display font-bold px-1.5 py-0.5 rounded-full bg-primary-500/10 text-primary-700 dark:text-primary-400">
            HOD
          </span>
        )}
        <span
          className={`flex items-center justify-center size-4 pointer-coarse:size-5 rounded-[4px] border shrink-0 transition-colors duration-150 ${
            checked ? 'bg-primary-600 border-primary-600 text-white' : 'border-border-hover text-transparent'
          }`}
        >
          <Check size={10} strokeWidth={3} />
        </span>
      </button>
    );
  };

  const groups = departments?.length
    ? (() => {
        const nameById = new Map(departments.map(d => [d.id, d.name]));
        const byDept = new Map<string, AssignableUser[]>();
        const unassigned: AssignableUser[] = [];
        for (const u of users ?? []) {
          const deptName = u.departmentId ? nameById.get(u.departmentId) : undefined;
          if (!deptName) { unassigned.push(u); continue; }
          const list = byDept.get(deptName) ?? [];
          list.push(u);
          byDept.set(deptName, list);
        }
        const sorted = [...byDept.entries()].sort(([a], [b]) => a.localeCompare(b));
        if (unassigned.length) sorted.push(['No department', unassigned]);
        return sorted;
      })()
    : null;

  return (
    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar p-1.5 bg-surface border border-border rounded-lg">
      {isLoading && (
        <p className="flex items-center gap-2 text-xs font-display text-text-muted px-2 py-2">
          <Loader2 size={13} className="animate-spin" /> Loading users…
        </p>
      )}
      {showSearch && (
        <div className="sticky top-0 z-10 -mt-1.5 -mx-1.5 px-1.5 pt-1.5 pb-1 bg-surface">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="w-full h-10 pointer-coarse:h-11 rounded-lg border border-border bg-background pl-8 pr-2 text-sm text-text placeholder:text-text-light outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
            />
          </div>
        </div>
      )}
      {!isLoading && !allUsers?.length && (
        emptyHint ?? <p className="text-xs font-display text-text-muted px-2 py-2">No assignable users in this scope.</p>
      )}
      {!isLoading && !!allUsers?.length && !users?.length && (
        <p className="text-xs font-display text-text-muted px-2 py-2">No one matches "{query.trim()}".</p>
      )}
      {!isLoading && groups
        ? groups.map(([deptName, deptUsers]) => (
            <div key={deptName} className="flex flex-col gap-0.5">
              <p className="px-2 pt-2 pb-1 t-meta font-display font-bold tracking-wider text-text-light first:pt-1">
                {deptName}
              </p>
              {deptUsers.map(renderUserRow)}
            </div>
          ))
        : users?.map(renderUserRow)}
    </div>
  );
};
