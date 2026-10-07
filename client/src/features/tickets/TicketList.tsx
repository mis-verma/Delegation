import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, ChevronDown, Upload, AlertCircle, Inbox, LayoutList, Kanban, Table2, GanttChartSquare } from 'lucide-react';
import { Button, PageNav, Fab, ViewToggle, EmptyState, type ViewTab } from '../../components';
import { CreatedRangeBanner, CreatedRangePicker } from '../../components/createdRangeBanner';
import { useCreatedRange } from '../../lib/createdRange';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery, useTicketsBoardQuery } from './hook';
import { useCategoriesQuery } from '../settings/hook';
import { useTagsQuery } from '../tags/hook';
import { TicketForm } from './TicketForm';
import { TicketDetail } from './TicketDetail';
import { TicketBoard } from './TicketBoard';
import { TicketTable } from './TicketTable';
import { TicketTimeline } from './TicketTimeline';
import { TicketBulkImportModal } from './bulkImport/TicketBulkImportModal';
import { ExportDialog } from '../reports';
import { TicketListSkeleton } from './list/TicketListSkeleton';
import { TicketGroupedList } from './list/TicketGroupedList';
import { TicketQuickStats } from './list/TicketQuickStats';
import { useTicketOrganizer, type TicketView } from './useTicketOrganizer';
import { TicketSettingsMenu } from './TicketSettingsMenu';
import { TicketActiveTags } from './TicketActiveTags';
import type { Ticket } from '../../api/ticket';
import { useIsMobile } from '../../lib/useMediaQuery';

// Module scope so the array is referentially stable, same convention as TaskList's own VIEW_TABS.
const VIEW_TABS: ViewTab<TicketView>[] = [
  { key: 'list', label: 'List', icon: LayoutList },
  // Phones get cards only, same as Delegation: a kanban board needs width a phone doesn't have.
  { key: 'board', label: 'Board', icon: Kanban, mobileHidden: true },
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
  { key: 'timeline', label: 'Timeline', icon: GanttChartSquare, mobileHidden: true },
];

export const TicketList = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: assignableUsers } = useAssignableUsersQuery();
  const { data: tags } = useTagsQuery();
  // useMemo, not a plain `new Map(...)` on every render — TicketBoard's own drag state
  // (activeTicket) re-renders TicketList's whole tree on every pickup/drop, and an unstable Map
  // reference here would defeat the board's column memoization further down, forcing every ticket
  // card to redo its own rendering work before the card can visually lift (the same "laggy
  // pickup" bug fixed on the Delegation board — see TaskBoard.tsx's Column memo comment).
  const departmentNames = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.name])),
    [departments],
  );
  const storeNames = useMemo(
    () => new Map((stores ?? []).map(s => [s.id, s.name])),
    [stores],
  );
  const categoryNames = useMemo(
    () => new Map((categories ?? []).map(c => [c.id, c.name])),
    [categories],
  );
  // For Table's "Raised by" column — same assignable-users roster the Assignee/Raised By filters
  // already use, so a raiser outside that roster (rare) just shows as "—" rather than crashing.
  const assigneeNames = useMemo(
    () => new Map((assignableUsers ?? []).map(u => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()])),
    [assignableUsers],
  );

  // Read once, same as the deep-link's own `assigneeIdFilter` — fetching a second time with
  // organizer.assigneeIdFilter (derived only after organizer runs) meant the rendered list came
  // from an earlier, unfiltered fetch while the correctly-scoped fetch was thrown away.
  const [searchParams, setSearchParams] = useSearchParams();
  const assigneeIdFilter = searchParams.get('assigneeIds') ?? undefined;
  const { data: allTicketsData, isPending, isError } = useTicketsBoardQuery(true, assigneeIdFilter);
  // Opened from a chart bar: only tickets created inside that bar's period (see lib/createdRange).
  const createdRange = useCreatedRange();
  const ticketsInRange = useMemo(() => {
    const everything = allTicketsData ?? [];
    return createdRange.range ? everything.filter((t) => createdRange.matches(t.createdAt)) : everything;
  }, [allTicketsData, createdRange]);
  const organizer = useTicketOrganizer(ticketsInRange, user, departmentNames);

  // `/tickets?open=<id>` opens that ticket's detail sheet directly, then drops the param so it
  // doesn't reopen on every render. Mirrors TaskList's existing `?open=` handling — the Dashboard's
  // Recent Activity rows deep-link into both, and previously both kinds of row just dumped you on
  // the unfiltered list to go find the item you'd already clicked.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !allTicketsData) return;
    const match = allTicketsData.find((t) => t.id === openId);
    // Syncing from an external system (the URL, set by whatever navigated here) into local state,
    // not reacting to React state — and the param is stripped immediately after, so this fires
    // once per navigation rather than looping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelectedTicket(match);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allTicketsData]);

  // Same one-shot-param pattern as `open` above — the sidebar's "+" quick-create link has no
  // route of its own to land on (TicketForm opens from local state, not a route), so it deep-
  // links here instead and this effect is what actually opens the form on arrival.
  useEffect(() => {
    if (!searchParams.get('create')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowForm(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isVerifier = user?.role === 'PC' || user?.role === 'ADMIN';
  const canExport = user?.role === 'ADMIN' || user?.role === 'PC';
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);

  return (
    <div className="flex flex-col gap-3 mx-auto w-full min-w-0 max-w-(--container-width) transition-all duration-300">
      <CreatedRangeBanner range={createdRange.range} onClear={createdRange.clear} noun="tickets" />

      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Same header treatment as Delegation: the visible title block is gone — you arrive from
            a nav item that already says Tickets, and the lead "Total" tile states the same count
            as a number you can click. The heading stays in the accessibility tree so the page
            still has one landmark to land on. */}
        <h1 className="sr-only">Tickets</h1>

        <TicketQuickStats
          counts={organizer.quickCounts}
          total={organizer.scopedTotal}
          active={organizer.quickFilter}
          onToggle={organizer.toggleQuickFilter}
          onClear={organizer.clearQuickFilter}
          isLoading={isPending}
        />

        {/* One controls band below the stats, matching Delegation: view toggle + active filters
            on the left, the create action and Options on the right. */}
        <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap min-w-0">
          {/* View lives in the toolbar, not inside Options — same as Delegation. It changes what
              the whole page looks like, so it reads as a place you are rather than a setting you
              went and configured. */}
          {/* Hidden on phones (only List is available there), but still mounted: ViewToggle's own
              effect is what switches a saved Board/Table view back to List on a small screen. */}
          <div className="hidden sm:block shrink-0">
            <ViewToggle tabs={VIEW_TABS} value={organizer.view} onChange={organizer.setView} />
          </div>

          <TicketActiveTags organizer={organizer} allTickets={allTicketsData ?? []} />

          {/* `sm:ml-auto`, not a bare `ml-auto` — on mobile the Create button below is hidden and
              only Options is left, so an unconditional auto-margin pushed a single pill hard right
              and left a ~220px dead gap in front of it. Desktop still gets the intentional
              controls-left / actions-right split. */}
          {/* `order-first` below sm: Options stays put at the left edge and any active-filter chips
              wrap in after it, instead of Options jumping sideways each time a chip appears. */}
          <div className="order-first sm:order-none flex items-center gap-x-3 gap-y-2.5 flex-wrap shrink-0 sm:ml-auto">
            <CreatedRangePicker createdRange={createdRange} className="shrink-0" />
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="primary" size="sm" className="group gap-2 rounded-full">
                    <Plus size={16} strokeWidth={2.5} className="transition-transform duration-300 group-hover:rotate-90" />
                    <span>Create Ticket</span>
                    <ChevronDown size={14} className="opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl">
                  <DropdownMenuItem onClick={() => setShowForm(true)} className="gap-2.5 py-2 cursor-pointer">
                    <Plus size={15} className="text-primary-600" />
                    <span className="font-medium text-sm">New Ticket</span>
                  </DropdownMenuItem>
                  {/* Admin/PC only, same gate as the server route — bulk-creating tickets for
                      other people is a distinct, more powerful capability than a plain create. */}
                  {isVerifier && (
                    <DropdownMenuItem onClick={() => setShowBulkImport(true)} className="gap-2.5 py-2 cursor-pointer">
                      <Upload size={15} className="text-primary-600" />
                      <span className="font-medium text-sm">Bulk Import</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <TicketSettingsMenu
              isOpen={showOptions}
              setIsOpen={setShowOptions}
              organizer={organizer}
              departments={ownScopeOnly ? undefined : departments}
              assignableUsers={ownScopeOnly ? undefined : assignableUsers}
              tags={tags}
              canExport={canExport}
              onExport={() => setShowExport(true)}
            />
            <Fab
              actions={[
                { key: 'create', label: 'New Ticket', icon: Plus, onClick: () => setShowForm(true) },
                ...(isVerifier ? [{ key: 'bulk-import', label: 'Bulk Import', icon: Upload, onClick: () => setShowBulkImport(true) }] : []),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Display Area */}
      {isPending && <TicketListSkeleton view={organizer.view} />}

      {isError && (
        <div className="flex items-start sm:items-center gap-2.5 p-3 sm:p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-display">
          <AlertCircle size={16} className="shrink-0" />
          <span>Failed to load tickets. Please check your network connection and try again.</span>
        </div>
      )}

      {!isPending && !isError && organizer.sorted.length === 0 && (
        <EmptyState
          icon={Inbox}
          // Short and compact on phones, same as Delegation's empty state.
          size={isMobile ? 'compact' : undefined}
          title={isMobile ? 'Nothing here' : 'No tickets found'}
          description={isMobile ? undefined : organizer.hasActiveFilters
            ? "No tickets match the current filters. Try adjusting or clearing them to see more."
            : "You're all caught up! There are no tickets assigned to this view."}
          action={organizer.hasActiveFilters ? { label: 'Clear all filters', onClick: organizer.handleResetFilters } : undefined}
        />
      )}

      {organizer.view === 'list' && !isPending && organizer.sorted.length > 0 && (
        <TicketGroupedList
          groups={organizer.groups}
          groupBy={organizer.groupBy}
          onSelectTicket={setSelectedTicket}
          departmentNames={departmentNames}
        />
      )}

      {organizer.view === 'board' && !isPending && organizer.sorted.length > 0 && (
        <TicketBoard
          tickets={organizer.sorted}
          departmentNames={departmentNames}
          isVerifier={isVerifier}
          onOpen={setSelectedTicket}
        />
      )}

      {organizer.view === 'table' && !isPending && organizer.sorted.length > 0 && (
        <TicketTable
          tickets={organizer.sorted}
          departmentNames={departmentNames}
          storeNames={storeNames}
          categoryNames={categoryNames}
          assigneeNames={assigneeNames}
          onOpen={setSelectedTicket}
        />
      )}

      {organizer.view === 'timeline' && !isPending && organizer.sorted.length > 0 && (
        <TicketTimeline tickets={organizer.sorted} onOpen={setSelectedTicket} />
      )}

      {organizer.view === 'list' && organizer.totalPages > 1 && (
        <div className="pt-4 border-t border-border/40 flex justify-center">
          <PageNav page={organizer.safePage} totalPages={organizer.totalPages} onPageChange={organizer.setPage} />
        </div>
      )}

      {/* Popups & Modals */}
      {showForm && <TicketForm onClose={() => setShowForm(false)} />}
      {showBulkImport && <TicketBulkImportModal onClose={() => setShowBulkImport(false)} />}
      {showExport && (
        <ExportDialog
          reportModule="tickets"
          title="Export Tickets"
          description="Every ticket created in the selected period — status, priority, department, assignee, and TAT."
          onClose={() => setShowExport(false)}
        />
      )}
      {selectedTicket && <TicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}
    </div>
  );
};