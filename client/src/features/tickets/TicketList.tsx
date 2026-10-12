import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, ChevronDown, Upload, AlertCircle, Inbox, LayoutList, Kanban, Table2, GanttChartSquare } from 'lucide-react';
import { PageNav, Fab, ViewToggle, SavedViewsMenu, useSavedViews, EmptyState, InlineError, Button, type ViewTab } from '../../components';
import { CreatedRangeBanner, CreatedRangePicker } from '../../components/createdRangeBanner';
import { useCreatedRange } from '../../lib/createdRange';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery, useTicketsBoardQuery, ticketDetailQueryOptions, BOARD_MAX_TICKETS } from './hook';
import { NoticeBanner } from '../../components/noticeBanner';
import { PhoneScopeSwitch } from '../../components/phoneScopeSwitch/PhoneScopeSwitch';
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
import { useTicketOrganizer, type TicketView, type TicketViewSnapshot } from './useTicketOrganizer';
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
  const queryClient = useQueryClient();
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
  const { data: allTicketsData, isPending, isError, refetch } = useTicketsBoardQuery(true, assigneeIdFilter);
  // Opened from a chart bar: only tickets created inside that bar's period (see lib/createdRange).
  const createdRange = useCreatedRange();
  const ticketsInRange = useMemo(() => {
    const everything = allTicketsData ?? [];
    return createdRange.range ? everything.filter((t) => createdRange.matches(t.createdAt)) : everything;
  }, [allTicketsData, createdRange]);
  const organizer = useTicketOrganizer(ticketsInRange, user, departmentNames);
  // Top of the results, so a page change brings the new page's first ticket into view.
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const changePage = (page: number) => {
    organizer.setPage(page);
    resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Named setups of this page (layout, filters, sort, grouping), kept in this browser for this person.
  const savedViews = useSavedViews<TicketViewSnapshot>(`savedViews:tickets:${user?.id ?? 'anon'}`);
  const activeSavedViewId = savedViews.views.find((v) => JSON.stringify(v.state) === JSON.stringify(organizer.snapshot))?.id ?? null;

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
    else {
      // Not in the loaded list (filtered out by a person link, or older than the list reaches):
      // ask for that one ticket. The server answers 403/404 when it was removed or isn't visible.
      queryClient
        .fetchQuery({ ...ticketDetailQueryOptions(openId), retry: false, staleTime: 30_000 })
        .then((ticket) => setSelectedTicket(ticket))
        .catch(() => toast.error("We couldn't open that ticket. It may have been removed, or it isn't one you can see."));
    }
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
    <div className="flex flex-col gap-3 pt-2.5 mx-auto w-full min-w-0 max-w-(--container-width) transition-all duration-300">
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
            <ViewToggle tabs={VIEW_TABS} value={organizer.view} onChange={organizer.setView} storageKey={`view:tickets:${user?.id ?? 'anon'}`} />
          </div>
          {/* Phones get one simple switch instead of saved views and the date picker. The filter
              sheet stays for team leads and above (see Options below). */}
          <PhoneScopeSwitch
            options={[
              { value: 'ASSIGNED_TO_ME', label: 'Assigned to me', shortLabel: 'Mine' },
              { value: 'CREATED_BY_ME', label: 'Created by me', shortLabel: 'By me' },
            ]}
            value={organizer.scopeFilter}
            allValue="ALL"
            onChange={(v) => { organizer.setScopeFilter(v); organizer.setPage(1); }}
          />
          <div className="hidden sm:contents">
            <SavedViewsMenu
              views={savedViews.views}
              activeId={activeSavedViewId}
              onSave={(name) => savedViews.save(name, organizer.snapshot)}
              onApply={(v) => organizer.applySnapshot(v.state)}
              onRemove={savedViews.remove}
            />
          </div>

          <TicketActiveTags organizer={organizer} allTickets={allTicketsData ?? []} />

          {/* `sm:ml-auto`, not a bare `ml-auto` — on mobile the Create button below is hidden and
              only Options is left, so an unconditional auto-margin pushed a single pill hard right
              and left a ~220px dead gap in front of it. Desktop still gets the intentional
              controls-left / actions-right split. */}
          {/* `order-first` below sm: Options stays put at the left edge and any active-filter chips
              wrap in after it, instead of Options jumping sideways each time a chip appears. */}
          <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap shrink-0 ml-auto">
            <CreatedRangePicker createdRange={createdRange} className="hidden sm:inline-flex shrink-0" />
            {/* One click opens the form. Admin/PC also get a small chevron for Bulk import (same
                gate as the server route: creating tickets for other people in bulk is theirs only). */}
            <div className="hidden md:flex items-center">
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                className={`h-9 font-display font-semibold ${isVerifier ? 'rounded-r-none' : ''}`}
              >
                <Plus size={16} strokeWidth={2.5} aria-hidden />
                New ticket
              </Button>
              {isVerifier && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      aria-label="More ways to add tickets"
                      className="h-9 px-2 rounded-l-none border-l-border/70"
                    >
                      <ChevronDown size={16} strokeWidth={2.5} aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-xl">
                    <DropdownMenuItem onClick={() => setShowBulkImport(true)} className="gap-2.5 py-2 cursor-pointer">
                      <Upload size={16} className="text-text-muted" />
                      <span className="font-medium text-sm">Bulk import</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Front-line staff only ever see their own tickets, so on a phone the scope pills are all
                they need. Anyone who looks after a team keeps filters and export on a phone too. */}
            <div className={ownScopeOnly ? 'hidden sm:contents' : 'contents'}>
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
            </div>
            <Fab
              sheetTitle="Create"
              actions={[
                { key: 'create', label: 'New ticket', description: 'Report an issue or ask for help', icon: Plus, onClick: () => setShowForm(true) },
                ...(isVerifier ? [{ key: 'bulk-import', label: 'Bulk import', description: 'Add many from an Excel sheet', icon: Upload, onClick: () => setShowBulkImport(true) }] : []),
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Display Area. The anchor sits just above the results, with room for the sticky
          navbar so a page change doesn't tuck the first ticket under it. */}
      <div ref={resultsTopRef} className="scroll-mt-24" aria-hidden />
      {isPending && <TicketListSkeleton view={organizer.view} />}

      {isError && (
        <InlineError
          message="Tickets didn't load. Check your connection and try again."
          onRetry={() => { void refetch(); }}
        />
      )}

      {/* Every page is loaded, up to a safety stop. Reaching it means older tickets exist that no
          view here shows, so say so rather than let the list look complete. */}
      {!isPending && !isError && (allTicketsData?.length ?? 0) >= BOARD_MAX_TICKETS && (
        <NoticeBanner tone="warning" icon={AlertCircle}>
          Showing the newest {BOARD_MAX_TICKETS.toLocaleString()} tickets. Older ones are not listed here.
        </NoticeBanner>
      )}

      {!isPending && !isError && organizer.sorted.length === 0 && (
        <EmptyState
          icon={Inbox}
          // Short and compact on phones, same as Delegation's empty state.
          size={isMobile ? 'compact' : undefined}
          title={isMobile ? 'Nothing here' : 'No tickets found'}
          description={isMobile ? undefined : organizer.hasActiveFilters
            ? 'No tickets match these filters. Clear them to see more.'
            : 'Nothing here yet. Tickets you raise or are given show up here.'}
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
          <PageNav page={organizer.safePage} totalPages={organizer.totalPages} onPageChange={changePage} />
        </div>
      )}

      {/* Popups & Modals */}
      {showForm && <TicketForm onClose={() => setShowForm(false)} />}
      {showBulkImport && <TicketBulkImportModal onClose={() => setShowBulkImport(false)} />}
      {showExport && (
        <ExportDialog
          reportModule="tickets"
          title="Export tickets"
          description="Every ticket created in the chosen period, with its status, priority, department, assignee and due time."
          onClose={() => setShowExport(false)}
        />
      )}
      {selectedTicket && <TicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}
    </div>
  );
};