import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AdminUser, Role, UserPresence } from '../../../api/admin';
import type { EntityStatusFilterValue } from '../../../components';
import { ROLE_LABEL, ROLE_ORDER, isDepartmentHead } from '../roleBadge';
import { fullName } from './userDisplay';

export type UserSortKey = 'name' | 'role' | 'department' | 'store' | 'status' | 'newest' | 'lastActive';
export type SortDir = 'asc' | 'desc';
export type UserView = 'cards' | 'table';

const SORT_KEYS: UserSortKey[] = ['name', 'role', 'department', 'store', 'status', 'newest', 'lastActive'];

// The direction each sort starts in: "Newest" and "Last active" read best newest first, the rest
// read best A to Z (role: the role with most access first, status: active first).
const DEFAULT_DIR: Record<UserSortKey, SortDir> = {
  name: 'asc',
  role: 'asc',
  department: 'asc',
  store: 'asc',
  status: 'asc',
  newest: 'desc',
  lastActive: 'desc',
};

// Admin first, User last.
const ROLE_RANK = new Map<Role, number>([...ROLE_ORDER].reverse().map((r, i) => [r, i]));

export interface UserFilters {
  q: string;
  role: Role | '';
  department: string;
  store: string;
  status: EntityStatusFilterValue;
  noDepartment: boolean;
  noStore: boolean;
  heads: boolean;
}

interface Options {
  users: AdminUser[];
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  presenceById: Map<string, UserPresence>;
  pageSize: number;
}

const isRole = (v: string | null): v is Role => !!v && (ROLE_ORDER as string[]).includes(v);
const isSortKey = (v: string | null): v is UserSortKey => !!v && (SORT_KEYS as string[]).includes(v);

const lastActiveValue = (p: UserPresence | undefined) => {
  if (!p) return -1;
  if (p.online) return Number.MAX_SAFE_INTEGER;
  return p.lastActiveAt ? new Date(p.lastActiveAt).getTime() : -1;
};

/**
 * Search, filters, sort, view and page for the Users tab, all kept in the URL so a filtered list
 * can be shared or survives a refresh. Any change to search or filters sends the list back to
 * page 1. Params it does not own (like the Directory's ?tab=) are left alone.
 */
export const useFilteredUsers = ({ users, departmentNames, storeNames, presenceById, pageSize }: Options) => {
  const [params, setParams] = useSearchParams();

  const urlQ = params.get('q') ?? '';
  const roleParam = params.get('role');
  const statusParam = params.get('status');
  const sortParam = params.get('sort');
  const dirParam = params.get('dir');
  const page = Math.max(1, Number(params.get('page')) || 1);

  const filters: UserFilters = useMemo(() => ({
    q: urlQ,
    role: isRole(roleParam) ? roleParam : '',
    department: params.get('dept') ?? '',
    store: params.get('store') ?? '',
    status: statusParam === 'active' || statusParam === 'inactive' ? statusParam : 'all',
    noDepartment: params.get('nodept') === '1',
    noStore: params.get('nostore') === '1',
    heads: params.get('heads') === '1',
  }), [params, urlQ, roleParam, statusParam]);

  const sort: UserSortKey = isSortKey(sortParam) ? sortParam : 'name';
  const dir: SortDir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : DEFAULT_DIR[sort];
  const view: UserView = params.get('view') === 'table' ? 'table' : 'cards';

  const update = useCallback((patch: Record<string, string | null>, keepPage = false) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if (!keepPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  // The search box types into local state and reaches the URL a moment later, so every keystroke
  // does not re-render the whole Directory.
  const [searchText, setSearchText] = useState(urlQ);
  useEffect(() => {
    if (searchText.trim() === urlQ) return;
    const t = setTimeout(() => update({ q: searchText.trim() || null }), 200);
    return () => clearTimeout(t);
  }, [searchText, urlQ, update]);

  const setFilters = useCallback((patch: Partial<UserFilters>) => {
    const out: Record<string, string | null> = {};
    if ('role' in patch) out.role = patch.role || null;
    if ('department' in patch) out.dept = patch.department || null;
    if ('store' in patch) out.store = patch.store || null;
    if ('status' in patch) out.status = patch.status && patch.status !== 'all' ? patch.status : null;
    if ('noDepartment' in patch) out.nodept = patch.noDepartment ? '1' : null;
    if ('noStore' in patch) out.nostore = patch.noStore ? '1' : null;
    if ('heads' in patch) out.heads = patch.heads ? '1' : null;
    update(out);
  }, [update]);

  const clearFilters = useCallback(() => {
    setSearchText('');
    update({ q: null, role: null, dept: null, store: null, status: null, nodept: null, nostore: null, heads: null });
  }, [update]);

  const setSort = useCallback((key: UserSortKey) => update({ sort: key === 'name' ? null : key, dir: null }), [update]);

  // Header click: same column flips direction, a new column starts in its natural direction.
  const toggleSort = useCallback((key: UserSortKey) => {
    if (key === sort) update({ sort: key === 'name' ? null : key, dir: dir === 'asc' ? 'desc' : 'asc' });
    else update({ sort: key === 'name' ? null : key, dir: null });
  }, [sort, dir, update]);

  const setView = useCallback((next: UserView) => update({ view: next === 'table' ? 'table' : null }, true), [update]);
  const setPage = useCallback((next: number) => update({ page: next > 1 ? String(next) : null }, true), [update]);

  // Everything except the status segment, so the Active / Deactivated counts describe the
  // people the other filters leave in.
  const beforeStatus = useMemo(() => {
    const tokens = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
    return users.filter((u) => {
      if (filters.role && u.role !== filters.role) return false;
      if (filters.department && u.departmentId !== filters.department) return false;
      if (filters.store && u.storeId !== filters.store) return false;
      if (filters.noDepartment && u.departmentId) return false;
      if (filters.noStore && u.storeId) return false;
      if (filters.heads && !isDepartmentHead(u.role)) return false;
      if (tokens.length === 0) return true;
      const haystack = `${fullName(u)} ${u.email} ${u.phone ?? ''} ${ROLE_LABEL[u.role]}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [users, filters]);

  const counts = useMemo(() => {
    const active = beforeStatus.filter((u) => u.isActive).length;
    return { all: beforeStatus.length, active, inactive: beforeStatus.length - active };
  }, [beforeStatus]);

  const filtered = useMemo(() => {
    const rows = filters.status === 'all' ? beforeStatus : beforeStatus.filter((u) => u.isActive === (filters.status === 'active'));
    const sign = dir === 'asc' ? 1 : -1;
    const byName = (a: AdminUser, b: AdminUser) => fullName(a).localeCompare(fullName(b));
    const text = (id: string | null, names: Map<string, string>) => (id ? (names.get(id) ?? '') : '');
    const compare = (a: AdminUser, b: AdminUser): number => {
      switch (sort) {
        case 'role': return (ROLE_RANK.get(a.role) ?? 0) - (ROLE_RANK.get(b.role) ?? 0);
        case 'department': {
          // People with no department sort last in either direction.
          const x = text(a.departmentId, departmentNames);
          const y = text(b.departmentId, departmentNames);
          if (!x !== !y) return (x ? -1 : 1) * sign;
          return x.localeCompare(y);
        }
        case 'store': {
          const x = text(a.storeId, storeNames);
          const y = text(b.storeId, storeNames);
          if (!x !== !y) return (x ? -1 : 1) * sign;
          return x.localeCompare(y);
        }
        case 'status': return Number(b.isActive) - Number(a.isActive);
        case 'newest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'lastActive': return lastActiveValue(presenceById.get(a.id)) - lastActiveValue(presenceById.get(b.id));
        default: return byName(a, b);
      }
    };
    return [...rows].sort((a, b) => compare(a, b) * sign || byName(a, b));
  }, [beforeStatus, filters.status, sort, dir, departmentNames, storeNames, presenceById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Status has its own segmented control, so it is not counted here.
  const activeFilterCount =
    Number(!!filters.role) + Number(!!filters.department) + Number(!!filters.store) +
    Number(filters.noDepartment) + Number(filters.noStore) + Number(filters.heads);
  const hasFilters = activeFilterCount > 0 || filters.status !== 'all' || filters.q !== '';

  return {
    filters,
    searchText,
    setSearchText,
    setFilters,
    clearFilters,
    activeFilterCount,
    hasFilters,
    sort,
    dir,
    setSort,
    toggleSort,
    view,
    setView,
    page: safePage,
    setPage,
    totalPages,
    counts,
    filtered,
    pageRows,
  };
};
