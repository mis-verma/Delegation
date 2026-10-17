import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { useAuth } from '@/context/AuthContext';
import { SCOPE_FILTER_PREDICATES, type ScopeFilter } from './list/ticketFilters';
import { SORT_COMPARATORS, type TicketSortKey } from './list/ticketSort';
import { groupByDepartment, groupByAssignee } from './list/ticketGrouping';
import { readQuickFilterParam } from '../../lib/readQuickFilterParam';
import type { Ticket } from '../../api/ticket';
import type { TicketQuickFilterKey, TicketQuickFilterCounts } from './list/TicketQuickStats';
import type { TicketFilters } from './list/TicketFilterFields';
import { isTicketHandedIn } from '../../lib/handedIn';

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

// Module scope, not recreated per render/hook call — referencing it from inside a useMemo would
// otherwise need it in the dependency array, and a fresh object every render would defeat the memo.
const QUICK_FILTER_PREDICATES: Record<TicketQuickFilterKey, (t: Ticket) => boolean> = {
  // Handed in (waiting for approval) counts as completed, the same as in the scores.
  pending: (t) => !isTicketHandedIn(t),
  completed: (t) => isTicketHandedIn(t),
  due: (t) => !!t.tatDueAt && !isTicketHandedIn(t) && !t.isOverdue,
  delayed: (t) => t.isOverdue && !isTicketHandedIn(t),
};

const PAGE_SIZE = 20;

type AuthUser = ReturnType<typeof useAuth>['user'];

export const useTicketOrganizer = (allTickets: Ticket[], user: AuthUser, departmentNames: Map<string, string>) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const assigneeIdFilter = searchParams.get('assigneeIds') ?? undefined;

  const [view, setView] = useState<TicketView>('list');
  const [filters, setFilters] = useState<TicketFilters>(DEFAULT_TICKET_FILTERS);
  const [sort, setSort] = useState<TicketSortKey>('tatDueAt');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'department' | 'assignee'>('department');
  const [page, setPage] = useState(1);

  const [quickFilter, setQuickFilter] = useState<TicketQuickFilterKey | null>(() =>
    readQuickFilterParam(searchParams, QUICK_FILTER_VALUES)
  );

  const toggleQuickFilter = (key: TicketQuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
    setPage(1);
  };

  // Backs the stat row's lead "Total" tile: clears the bucket filter only, leaving search/scope/
  // field filters alone — unlike handleResetFilters, which clears everything.
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
  };

  // Every computed value below is memoized on the state that actually changes it — opening the
  // detail sheet, a modal, or Options toggles unrelated state (selectedTicket/showForm/showOptions)
  // that lives in TicketList, which re-renders this hook's caller. Without memoization every one
  // of these re-filtered/re-sorted/re-grouped the full ticket list and hand a fresh array down to
  // TicketGroupedList/TicketCard on every such toggle, forcing every card to redo its own render
  // work before the sheet/modal could even start its (otherwise instant) open animation — the same
  // "laggy pickup" root cause fixed on the Task/Ticket boards' drag state, just triggered by a
  // click instead of a drag.
  const scopeFiltered = useMemo(
    () => (user ? allTickets.filter(t => SCOPE_FILTER_PREDICATES[scopeFilter](t, user.id)) : allTickets),
    [allTickets, user, scopeFilter],
  );

  const quickCounts: TicketQuickFilterCounts = useMemo(() => ({
    pending: scopeFiltered.filter(QUICK_FILTER_PREDICATES.pending).length,
    completed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.completed).length,
    due: scopeFiltered.filter(QUICK_FILTER_PREDICATES.due).length,
    delayed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.delayed).length,
  }), [scopeFiltered]);

  const sorted = useMemo(() => {
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSorted = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );

  const groups = useMemo(() => (
    groupBy === 'department'
      ? groupByDepartment(pagedSorted, departmentNames).map(g => ({ key: g.departmentId ?? '__none__', label: g.departmentName, tickets: g.tickets }))
      : groupByAssignee(pagedSorted).map(g => ({ key: g.assigneeId ?? '__unassigned__', label: g.assigneeName, tickets: g.tickets }))
  ), [groupBy, pagedSorted, departmentNames]);

  const activeCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority.length > 0 ? 1 : 0) +
    (filters.departmentId ? 1 : 0) +
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.raisedByIds.length > 0 ? 1 : 0) +
    (filters.labelIds.length > 0 ? 1 : 0);

  // Everything that makes up "how I have this page set up", for a saved view.
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

  const hasActiveFilters = search.length > 0 || activeCount > 0 || scopeFilter !== 'ALL' || quickFilter !== null;

  return {
    view, setView,
    snapshot, applySnapshot,
    filters, setFilters,
    sort, setSort,
    scopeFilter, setScopeFilter,
    search, setSearch,
    groupBy, setGroupBy,
    page, setPage, safePage, totalPages,
    quickFilter, toggleQuickFilter, clearQuickFilter, quickCounts,
    // The number the page header's "N total tickets" subtitle used to state — scope-aware, so it
    // matches what the tiles beside it are counting.
    scopedTotal: scopeFiltered.length,
    handleResetFilters,
    sorted, pagedSorted, groups, activeCount, hasActiveFilters,
    assigneeIdFilter, searchParams, setSearchParams
  };
};
