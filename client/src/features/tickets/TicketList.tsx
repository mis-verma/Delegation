import { useEffect, useMemo, useRef, useState } from 'react';
import { CreateButton } from '../../components/createButton';
import { useSearchParams } from 'react-router';
import { Plus, Upload, AlertCircle, Inbox, LayoutList, Kanban, Table2, GanttChartSquare, UserCheck, PenLine, FileClock } from 'lucide-react';
import { PageNav, Fab, ViewToggle, SavedViewsMenu, useSavedViews, EmptyState, InlineError, Button, type ViewTab } from '../../components';
import { CreatedRangeBanner, CreatedRangePicker, ScoreDrillBanner } from '../../components/createdRangeBanner';
import { useCreatedRange } from '../../lib/createdRange';
import { ticketMatchesDrill, useScoreDrill } from '../../lib/scoreDrill';
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
import type { Draft } from '../../api/drafts';
import { useDraftsQuery } from '../drafts/hook';
import { DraftsDialog } from '../drafts/DraftsDialog';

const VIEW_TABS: ViewTab<TicketView>[] = [
  { key: 'list', label: 'List', icon: LayoutList },
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
  const [showDrafts, setShowDrafts] = useState(false);
  const [openDraft, setOpenDraft] = useState<Draft | null>(null);
  const { data: drafts } = useDraftsQuery('TICKET');
  const draftCount = drafts?.length ?? 0;

  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const { data: categories } = useCategoriesQuery();
  const { data: assignableUsers } = useAssignableUsersQuery();
  const { data: tags } = useTagsQuery();
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
  const assigneeNames = useMemo(
    () => new Map((assignableUsers ?? []).map(u => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()])),
    [assignableUsers],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const assigneeIdFilter = searchParams.get('assigneeIds') ?? undefined;
  const selfLink = !!assigneeIdFilter && assigneeIdFilter === user?.id;
  const { data: allTicketsData, isPending, isError, refetch } = useTicketsBoardQuery(true, selfLink ? undefined : assigneeIdFilter);
  const createdRange = useCreatedRange();
  const scoreDrill = useScoreDrill(true);
  const ticketsInRange = useMemo(() => {
    const everything = allTicketsData ?? [];
    const created = createdRange.range ? everything.filter((t) => createdRange.matches(t.createdAt)) : everything;
    return scoreDrill.active ? created.filter((t) => ticketMatchesDrill(scoreDrill, t)) : created;
  }, [allTicketsData, createdRange, scoreDrill]);
  const organizer = useTicketOrganizer(ticketsInRange, user, departmentNames);
  const { setScopeFilter } = organizer;
  useEffect(() => {
    if (!selfLink) return;
    setScopeFilter('ASSIGNED_TO_ME');
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('assigneeIds');
      return params;
    }, { replace: true });
  }, [selfLink, setScopeFilter, setSearchParams]);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const changePage = (page: number) => {
    organizer.setPage(page);
    resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const savedViews = useSavedViews<TicketViewSnapshot>(`savedViews:tickets:${user?.id ?? 'anon'}`);
  const activeSavedViewId = savedViews.views.find((v) => JSON.stringify(v.state) === JSON.stringify(organizer.snapshot))?.id ?? null;

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !allTicketsData) return;
    const match = allTicketsData.find((t) => t.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setSelectedTicket(match);
    else {
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
      <ScoreDrillBanner
        drill={scoreDrill}
        noun="tickets"
        scopeLabel={[scoreDrill.departmentId && departmentNames.get(scoreDrill.departmentId), scoreDrill.storeId && storeNames.get(scoreDrill.storeId)].filter(Boolean).join(', ') || undefined}
      />

      <div className="flex flex-col gap-3 sm:gap-4">
        <h1 className="sr-only">Tickets</h1>

        <TicketQuickStats
          counts={organizer.quickCounts}
          total={organizer.scopedTotal}
          active={organizer.quickFilter}
          onToggle={organizer.toggleQuickFilter}
          onClear={organizer.clearQuickFilter}
          isLoading={isPending}
        />

        <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap min-w-0">
          <div className="hidden sm:block shrink-0">
            <ViewToggle tabs={VIEW_TABS} value={organizer.view} onChange={organizer.setView} storageKey={`view:tickets:${user?.id ?? 'anon'}`} />
          </div>
          <PhoneScopeSwitch
            options={[
              { value: 'ASSIGNED_TO_ME', label: 'Assigned to me', shortLabel: 'Mine', icon: UserCheck },
              { value: 'CREATED_BY_ME', label: 'Created by me', shortLabel: 'By me', icon: PenLine },
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

          <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap shrink-0 ml-auto">
            <CreatedRangePicker createdRange={createdRange} className="hidden sm:inline-flex shrink-0" />
            {draftCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowDrafts(true)} className="h-9 max-sm:h-11 font-display font-semibold">
                <FileClock size={15} aria-hidden />
                Drafts
                <span className="t-meta font-bold tabular-nums text-primary-700 dark:text-primary-300">{draftCount}</span>
              </Button>
            )}
            <CreateButton
              label="New ticket"
              onClick={() => setShowForm(true)}
              className="hidden md:inline-flex"
              menu={isVerifier ? [{ key: 'bulk', label: 'Bulk import', hint: 'Add many from an Excel sheet', icon: Upload, onSelect: () => setShowBulkImport(true) }] : undefined}
              menuLabel="More ways to add tickets"
            />

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

      <div ref={resultsTopRef} className="scroll-mt-24" aria-hidden />
      {isPending && <TicketListSkeleton view={organizer.view} />}

      {isError && (
        <InlineError
          message="Tickets didn't load. Check your connection and try again."
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isPending && !isError && (allTicketsData?.length ?? 0) >= BOARD_MAX_TICKETS && (
        <NoticeBanner tone="warning" icon={AlertCircle}>
          Showing the newest {BOARD_MAX_TICKETS.toLocaleString()} tickets. Older ones are not listed here.
        </NoticeBanner>
      )}

      {!isPending && !isError && organizer.sorted.length === 0 && (
        <EmptyState
          icon={Inbox}
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

      {showForm && <TicketForm onClose={() => setShowForm(false)} />}
      {openDraft && <TicketForm key={openDraft.id} draft={openDraft} onClose={() => setOpenDraft(null)} />}
      <DraftsDialog
        kind="TICKET"
        open={showDrafts}
        onClose={() => setShowDrafts(false)}
        onOpenDraft={(d) => { setShowDrafts(false); setOpenDraft(d); }}
      />
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