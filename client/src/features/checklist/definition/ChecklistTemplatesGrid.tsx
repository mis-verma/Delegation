import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../../lib/queryHelpers';
import { toast } from 'sonner';
import { Plus, ClipboardList, FileDown, Upload, ListChecks as SelectIcon, X, Trash2, Repeat } from 'lucide-react';
import { Button, Skeleton, EmptyState, InlineError, PageHeader, ToggleChip, ENTITY_CARD_CLASS } from '../../../components';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistDefinitionsQuery } from '../hook';
import { ChecklistDefinitionCard } from './ChecklistDefinitionCard';
import { ChecklistBulkImportModal } from './bulkImport/ChecklistBulkImportModal';
import { ExportDialog } from '../../reports';
import { RECURRENCE_LABEL, plural } from '../checklistDisplay';
import { checklistDefinitionApi, type ChecklistRecurrence } from '../../../api/checklistDefinitions';

interface ChecklistTemplatesGridProps {
  className?: string;
}

// 'all' first, then every real recurrence in the same order the builder's own RECURRENCE_OPTIONS
// offers them (Daily -> Weekly -> Monthly -> Quarterly -> Yearly -> One-time) — so "how often does
// this repeat" reads in the same order everywhere it shows up, not a re-shuffled one here.
const RECURRENCE_TABS: Array<ChecklistRecurrence | 'all'> = ['all', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'];

type StatusFilter = 'all' | 'active' | 'paused';
const STATUS_CHIPS: Array<{ value: Exclude<StatusFilter, 'all'>; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

const BUILDER_PATH = '/admin/scheduled-checklists/builder';

// Same chrome and rows as the real card (icon + status, title, chips, progress), so nothing jumps
// when the data lands.
const ChecklistCardSkeleton = () => (
  <div className={cn(ENTITY_CARD_CLASS, 'gap-3 sm:gap-4 justify-start')}>
    <div className="flex items-start justify-between gap-3">
      <Skeleton className="size-10 rounded-xl shrink-0" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <Skeleton className="h-5 w-3/4" />
    <div className="flex flex-wrap gap-1.5">
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-6 w-24 rounded-full" />
    </div>
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  </div>
);

export const ChecklistTemplatesGrid = ({ className = '' }: ChecklistTemplatesGridProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  // ADMIN and PC work with checklist definitions alike: create, import, export, pause, edit,
  // delete. The server allows both roles for every one of those, so there is one gate here.
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';
  const [showExport, setShowExport] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  // The filters live in the URL (?recurrence=weekly&status=paused), so opening a checklist and
  // pressing Back lands on the same tab, and a filtered view can be shared as a link.
  const recurrenceParam = searchParams.get('recurrence')?.toLowerCase();
  const recurrence = RECURRENCE_TABS.find((r) => r.toLowerCase() === recurrenceParam) ?? 'all';
  const statusParam = searchParams.get('status');
  const status: StatusFilter = statusParam === 'active' || statusParam === 'paused' ? statusParam : 'all';
  const isFiltered = recurrence !== 'all' || status !== 'all';

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const { data, isPending, isError, isPlaceholderData, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery({
    ...(recurrence === 'all' ? {} : { recurrence }),
    ...(status === 'all' ? {} : { isActive: status === 'active' }),
  });
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;
  // keepPreviousData keeps the old list up while a new tab loads, so dim it instead of flashing
  // skeletons (those are only for "no data at all").
  const isRefreshing = isPlaceholderData;

  // What is really selected: ids that are still in the loaded list. A checklist that vanished
  // (deleted elsewhere, filtered out by a refetch) can never be deleted by a stale selection.
  const selection = useMemo(() => {
    const loaded = new Set(definitions.map((d) => d.id));
    return new Set([...selectedIds].filter((id) => loaded.has(id)));
  }, [definitions, selectedIds]);

  const setFilter = (key: 'recurrence' | 'status', value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === 'all') next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
    // A different list is a different selection: never carry ticked cards across a filter change.
    setSelectedIds(new Set());
  };
  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('recurrence');
      next.delete('status');
      return next;
    }, { replace: true });
    setSelectedIds(new Set());
  };

  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const allLoadedSelected = definitions.length > 0 && definitions.every((d) => selection.has(d.id));
  const toggleSelectAll = () => setSelectedIds(allLoadedSelected ? new Set() : new Set(definitions.map((d) => d.id)));

  // Fires every delete in parallel and reports one combined result — same soft-delete remove()
  // as the single-card action, just looped, since there's no dedicated bulk-delete endpoint (each
  // definition's own delete is independent and cheap; nothing here needs a transaction across
  // definitions that don't relate to each other).
  const handleBulkDelete = async () => {
    const ids = [...selection];
    if (!ids.length) return;
    const ok = await confirm({
      title: `Delete ${plural(ids.length, 'checklist')}?`,
      description: `${ids.length === 1 ? 'This checklist and every run tied to it' : 'These checklists and every run tied to them'} will disappear from the app: My Checklists, Compliance, the Dashboard, everywhere.`,
      confirmLabel: `Yes, delete ${ids.length === 1 ? 'it' : 'all'}`,
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;

    setIsBulkDeleting(true);
    const results = await Promise.allSettled(ids.map((id) => checklistDefinitionApi.remove(id)));
    setIsBulkDeleting(false);
    // Same three caches the single delete refreshes (useDeleteChecklistDefinitionMutation): the
    // runs and the analytics numbers change too, not just this list.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] }),
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      invalidateScoreCaches(queryClient),
    ]);

    const failedIds = ids.filter((_, i) => results[i].status === 'rejected');
    const succeeded = ids.length - failedIds.length;
    if (succeeded) toast.success(`Deleted ${plural(succeeded, 'checklist')}`);
    if (failedIds.length) {
      toast.error(`Couldn't delete ${plural(failedIds.length, 'checklist')}. They stay selected so you can try again.`);
      // Only the ones that failed stay ticked; the deleted ones are gone from the list anyway.
      setSelectedIds(new Set(failedIds));
    } else {
      exitSelectMode();
    }
  };

  // Top action buttons. Select/bulk-delete shares the same ADMIN-or-PC gate as the rest, but only
  // shows once there is something to select.
  const actions = selectMode ? (
    <>
      {/* While more pages are still on the server, "all" would be a lie: this only ticks what is loaded. */}
      <Button size="sm" variant="secondary" onClick={toggleSelectAll}>
        {allLoadedSelected ? 'Clear all' : hasNextPage ? 'Select loaded' : 'Select all'}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={handleBulkDelete}
        isLoading={isBulkDeleting}
        disabled={!selection.size}
      >
        {!isBulkDeleting && <Trash2 size={14} />}
        <span>Delete{selection.size > 0 ? ` (${selection.size})` : ''}</span>
      </Button>
      <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={exitSelectMode} aria-label="Cancel selection">
        <X size={14} />
        <span className="hidden sm:inline">Cancel</span>
      </Button>
    </>
  ) : (
    canManage && (
      <>
        <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setShowExport(true)} aria-label="Export">
          <FileDown size={14} className="text-text-muted" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setShowBulkImport(true)} aria-label="Import">
          <Upload size={14} className="text-text-muted" />
          <span className="hidden sm:inline">Import</span>
        </Button>
        {definitions.length > 0 && (
          <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setSelectMode(true)} aria-label="Select checklists to delete">
            <SelectIcon size={14} className="text-text-muted" />
            <span className="hidden sm:inline">Select</span>
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={() => navigate(BUILDER_PATH)}>
          <Plus size={14} />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New checklist</span>
        </Button>
      </>
    )
  );

  return (
    <div className={cn('flex flex-col gap-6 w-full', className)}>
      <PageHeader
        icon={Repeat}
        title="Recurring Checklists"
        subtitle="Build checklists your stores run on a schedule, with the questions and proof each one needs."
        actions={actions}
      />

      {/* Filters. The server already filters by recurrence and by isActive
          (ListChecklistDefinitionsParams). Same controlled Tabs primitive as EntityStatusFilter,
          not a hand-rolled control. */}
      <div className="flex flex-col gap-3">
        <Tabs value={recurrence} onValueChange={(v) => setFilter('recurrence', v === 'all' ? 'all' : v.toLowerCase())}>
          {/* Scrolls horizontally instead of clipping: seven tabs (All through One-time) don't fit
              in one row below ~500px. On a phone the strip bleeds to the screen edge (the page
              padding is 12px), so the last tab is never sliced against an invisible margin. */}
          <div className="overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
            <TabsList className="w-fit">
              {RECURRENCE_TABS.map((r) => (
                <TabsTrigger key={r} value={r} className="min-h-11 sm:min-h-8 font-display font-bold">
                  {r === 'all' ? 'All' : RECURRENCE_LABEL[r]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-display font-medium text-text-muted pr-1">Status</span>
          {STATUS_CHIPS.map((chip) => (
            <ToggleChip key={chip.value} on={status === chip.value} onClick={() => setFilter('status', status === chip.value ? 'all' : chip.value)}>
              {chip.label}
            </ToggleChip>
          ))}
          {isFiltered && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          {!isPending && !isError && (
            <span className="ml-auto text-xs font-display font-medium text-text-muted tabular-nums" aria-live="polite">
              {plural(total, 'checklist')}
            </span>
          )}
        </div>
      </div>

      {isError && (
        <InlineError message="We couldn't load your checklists. Check your connection and try again." onRetry={() => refetch()} />
      )}

      {/* Loading skeleton: only when there is no data at all (a tab change keeps the old list). */}
      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <ChecklistCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state: a filtered-to-nothing view ("no Yearly checklists yet") reads very differently
          from a genuinely empty org, so "Create new checklist" is only offered when no filter is
          narrowing the view; with one active it offers to clear the filters instead, since a
          brand-new checklist wouldn't even match whatever is currently selected. */}
      {!isPending && !isError && definitions.length === 0 && (
        isFiltered ? (
          <EmptyState
            icon={ClipboardList}
            title={`No ${status === 'all' ? '' : `${status} `}${recurrence === 'all' ? '' : `${RECURRENCE_LABEL[recurrence].toLowerCase()} `}checklists`}
            description="Nothing matches these filters yet. Try another tab, or clear the filters."
            action={{ label: 'Clear filters', onClick: clearFilters }}
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No checklists yet"
            description={
              canManage
                ? 'Set up your first recurring checklist for opening routines, safety walkthroughs, audits, or anything your stores repeat.'
                : 'Nothing here yet. Check back once an admin sets one up.'
            }
            action={canManage ? { label: 'Create new checklist', icon: Plus, onClick: () => navigate(BUILDER_PATH) } : undefined}
          />
        )
      )}

      {definitions.length > 0 && (
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 transition-opacity', isRefreshing && 'opacity-60')}>
          {definitions.map((d) => (
            <ChecklistDefinitionCard
              key={d.id}
              definition={d}
              selectionMode={selectMode}
              selected={selection.has(d.id)}
              onToggleSelected={toggleSelected}
            />
          ))}
        </div>
      )}

      {!isPending && !isError && hasNextPage && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading' : `Load more (${total - definitions.length} remaining)`}
        </Button>
      )}

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog
          reportModule="checklists"
          title="Export Checklists"
          description="Every recurring checklist instance generated in the selected period, with completion progress per instance."
          onClose={() => setShowExport(false)}
        />
      )}

      <ChecklistBulkImportModal open={showBulkImport} onClose={() => setShowBulkImport(false)} />
    </div>
  );
};
