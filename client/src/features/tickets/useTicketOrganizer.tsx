import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { useAuth } from '@/context/AuthContext';
import { SCOPE_FILTER_PREDICATES, type ScopeFilter } from './list/ticketFilters';
import { SORT_COMPARATORS, type TicketSortKey } from './list/ticketSort';
import { groupByDepartment, groupByAssignee } from './list/ticketGrouping';
import { readQuickFilterParam } from '../../lib/readQuickFilterParam';
import { clearKept, readKept, writeKept } from '../../lib/keptForm';
import type { Ticket, TicketListCounts, TicketListQuery } from '../../api/ticket';
import type { TicketQuickFilterKey, TicketQuickFilterCounts } from './list/TicketQuickStats';
import type { TicketFilters } from './list/TicketFilterFields';
import { isTicketHandedIn } from '../../lib/handedIn';
import { TICKET_PAGE_SIZE, type PagedTicketQuery } from './hook';

export type TicketView = 'list' | 'board' | 'table' | 'timeline';
const QUICK_FILTER_VALUES = ['pending', 'completed', 'due', 'delayed'] as const;
export interface TicketViewSnapshot {
  view: TicketView;
  filters: TicketFilters;
  sort: TicketSortKey;
  scopeFilter: ScopeFilter;
  search: string;
  groupBy: 'department' | 'assignee';
  quickFilter: TicketQuickFilterKey | null;
}
const DEFAULT_TICKET_FILTERS: TicketFilters = { status: 'all', priority: [], departmentId: '', assigneeIds: [], raisedByIds: [], labelIds: [] };

const QUICK_FILTER_PREDICATES: Record<TicketQuickFilterKey, (t: Ticket) => boolean> = {
  pending: (t) => !isTicketHandedIn(t),
  completed: (t) => isTicketHandedIn(t),
  due: (t) => !!t.tatDueAt && !isTicketHandedIn(t) && !t.isOverdue,
  delayed: (t) => t.isOverdue && !isTicketHandedIn(t),
};

type AuthUser = ReturnType<typeof useAuth>['user'];

export type TicketServerPage = {
  tickets: Ticket[];
  total: number;
  counts?: TicketListCounts;
};

export type TicketServerExtras = Pick<TicketListQuery, 'personId' | 'drillDepartmentId' | 'drillStoreId' | 'createdFrom' | 'createdTo' | 'dueFrom' | 'dueTo' | 'sla'>;

export const useTicketViewState = (user: AuthUser) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const assigneeIdFilter = searchParams.get('assigneeIds') ?? undefined;

  const keptKey = `tickets-view:${user?.id ?? 'anon'}`;
  const [restored] = useState(() =>
    readQuickFilterParam(searchParams, QUICK_FILTER_VALUES) || assigneeIdFilter ? null : readKept<Partial<TicketViewSnapshot>>(keptKey),
  );

  const [view, setView] = useState<TicketView>(restored?.view ?? 'list');
  const [filters, setFilters] = useState<TicketFilters>({ ...DEFAULT_TICKET_FILTERS, ...restored?.filters });
  const [sort, setSort] = useState<TicketSortKey>(restored?.sort ?? 'tatDueAt');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(restored?.scopeFilter ?? 'ALL');
  const [search, setSearch] = useState(restored?.search ?? '');
  const [groupBy, setGroupBy] = useState<'department' | 'assignee'>(restored?.groupBy ?? 'department');
  const [page, setPage] = useState(1);

  const [quickFilter, setQuickFilter] = useState<TicketQuickFilterKey | null>(() =>
    readQuickFilterParam(searchParams, QUICK_FILTER_VALUES) ?? restored?.quickFilter ?? null
  );

  const toggleQuickFilter = (key: TicketQuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
    setPage(1);
  };

  const clearQuickFilter = () => {
    setQuickFilter(null);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilters(DEFAULT_TICKET_FILTERS);
    setScopeFilter('ALL');
    setQuickFilter(null);
    setPage(1);
    clearKept(keptKey);
  };

  const activeCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority.length > 0 ? 1 : 0) +
    (filters.departmentId ? 1 : 0) +
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.raisedByIds.length > 0 ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0);

  const snapshot: TicketViewSnapshot = { view, filters, sort, scopeFilter, search, groupBy, quickFilter };
  const applySnapshot = (s: TicketViewSnapshot) => {
    setView(s.view);
    setFilters({ ...DEFAULT_TICKET_FILTERS, ...s.filters });
    setSort(s.sort);
    setScopeFilter(s.scopeFilter);
    setSearch(s.search);
    setGroupBy(s.groupBy);
    setQuickFilter(s.quickFilter);
    setPage(1);
  };

  useEffect(() => {
    writeKept(keptKey, { view, filters, sort, scopeFilter, search, groupBy, quickFilter });
  }, [keptKey, view, filters, sort, scopeFilter, search, groupBy, quickFilter]);

  const hasActiveFilters = search.length > 0 || activeCount > 0 || scopeFilter !== 'ALL' || quickFilter !== null;

  return {
    view, setView,
    snapshot, applySnapshot,
    filters, setFilters,
    sort, setSort,
    scopeFilter, setScopeFilter,
    search, setSearch,
    groupBy, setGroupBy,
    page, setPage,
    quickFilter, toggleQuickFilter, clearQuickFilter,
    handleResetFilters,
    activeCount, hasActiveFilters,
    assigneeIdFilter, searchParams, setSearchParams,
  };
};

export type TicketViewState = ReturnType<typeof useTicketViewState>;

export const ticketServerQuery = (
  state: Pick<TicketViewState, 'filters' | 'sort' | 'scopeFilter' | 'quickFilter' | 'page'>,
  search: string,
  extras: TicketServerExtras,
): PagedTicketQuery => ({
  page: state.page,
  sort: state.sort,
  bucket: state.quickFilter ?? undefined,
  handledBy: state.scopeFilter === 'ASSIGNED_TO_ME' ? 'assignee' : state.scopeFilter === 'CREATED_BY_ME' ? 'creator' : undefined,
  status: state.filters.status === 'all' ? undefined : state.filters.status,
  priority: state.filters.priority.length ? state.filters.priority : undefined,
  departmentId: state.filters.departmentId || undefined,
  assigneeIds: state.filters.assigneeIds.length ? state.filters.assigneeIds : undefined,
  raisedByIds: state.filters.raisedByIds.length ? state.filters.raisedByIds : undefined,
  labelIds: state.filters.labelIds.length ? state.filters.labelIds : undefined,
  search: search.trim() || undefined,
  ...extras,
});

export const useTicketOrganizer = (
  state: TicketViewState,
  allTickets: Ticket[],
  user: AuthUser,
  departmentNames: Map<string, string>,
  server: TicketServerPage | null,
) => {
  const { filters, scopeFilter, search, quickFilter, sort, groupBy, page } = state;

  const scopeFiltered = useMemo(
    () => (user ? allTickets.filter(t => SCOPE_FILTER_PREDICATES[scopeFilter](t, user.id)) : allTickets),
    [allTickets, user, scopeFilter],
  );

  const localQuickCounts: TicketQuickFilterCounts = useMemo(() => ({
    pending: scopeFiltered.filter(QUICK_FILTER_PREDICATES.pending).length,
    completed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.completed).length,
    due: scopeFiltered.filter(QUICK_FILTER_PREDICATES.due).length,
    delayed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.delayed).length,
  }), [scopeFiltered]);

  const localSorted = useMemo(() => {
    const statusFiltered = filters.status === 'all' ? scopeFiltered : scopeFiltered.filter(t => t.status === filters.status);
    const priorityFiltered = filters.priority.length === 0 ? statusFiltered : statusFiltered.filter(t => filters.priority.includes(t.priority));
    const departmentFiltered = filters.departmentId ? priorityFiltered.filter(t => t.departmentId === filters.departmentId) : priorityFiltered;
    const assigneeFiltered = filters.assigneeIds.length === 0 ? departmentFiltered : departmentFiltered.filter(t => !!t.assigneeId && filters.assigneeIds.includes(t.assigneeId));
    const raisedByFiltered = filters.raisedByIds.length === 0 ? assigneeFiltered : assigneeFiltered.filter(t => filters.raisedByIds.includes(t.userId));
    const labelFiltered = filters.labelIds.length === 0 ? raisedByFiltered : raisedByFiltered.filter(t => t.tags.some(tag => filters.labelIds.includes(tag.id)));
    const query = search.trim().toLowerCase();

    const searched = query
      ? labelFiltered.filter(t => t.title.toLowerCase().includes(query) || (t.description ?? '').toLowerCase().includes(query))
      : labelFiltered;

    const quickFiltered = quickFilter ? searched.filter(QUICK_FILTER_PREDICATES[quickFilter]) : searched;
    return [...quickFiltered].sort(SORT_COMPARATORS[sort]);
  }, [scopeFiltered, filters, search, quickFilter, sort]);

  const sorted = server ? server.tickets : localSorted;
  const resultTotal = server ? server.total : localSorted.length;
  const quickCounts: TicketQuickFilterCounts = server?.counts
    ? { pending: server.counts.pending, completed: server.counts.completed, due: server.counts.due, delayed: server.counts.delayed }
    : server ? { pending: 0, completed: 0, due: 0, delayed: 0 } : localQuickCounts;
  const scopedTotal = server ? server.counts?.scope ?? 0 : scopeFiltered.length;

  const totalPages = Math.max(1, Math.ceil(resultTotal / TICKET_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSorted = useMemo(
    () => (server ? server.tickets : localSorted.slice((safePage - 1) * TICKET_PAGE_SIZE, safePage * TICKET_PAGE_SIZE)),
    [server, localSorted, safePage],
  );

  const groups = useMemo(() => (
    groupBy === 'department'
      ? groupByDepartment(pagedSorted, departmentNames).map(g => ({ key: g.departmentId ?? '__none__', label: g.departmentName, tickets: g.tickets }))
      : groupByAssignee(pagedSorted).map(g => ({ key: g.assigneeId ?? '__unassigned__', label: g.assigneeName, tickets: g.tickets }))
  ), [groupBy, pagedSorted, departmentNames]);

  return {
    ...state,
    safePage, totalPages,
    quickCounts,
    scopedTotal,
    resultTotal,
    sorted, pagedSorted, groups,
  };
};
