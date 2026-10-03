import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ClipboardList, FileDown, Upload, ListChecks as SelectIcon, X, Trash2, Repeat } from 'lucide-react';
import { Button, Skeleton, EmptyState, InlineError, PageHeader, ENTITY_CARD_CLASS } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistDefinitionsQuery } from '../hook';
import { ChecklistDefinitionCard } from './ChecklistDefinitionCard';
import { ChecklistBulkImportModal } from './bulkImport/ChecklistBulkImportModal';
import { ExportDialog } from '../../reports';
import { RECURRENCE_LABEL } from '../checklistDisplay';
import { checklistDefinitionApi, type ChecklistRecurrence } from '../../../api/checklistDefinitions';

interface ChecklistTemplatesGridProps {
  className?: string;
}

// 'all' first, then every real recurrence in the same order the builder's own RECURRENCE_OPTIONS
// offers them (Daily -> Weekly -> Monthly -> Quarterly -> Yearly -> One-time) — so "how often does
// this repeat" reads in the same order everywhere it shows up, not a re-shuffled one here.
const RECURRENCE_TABS: Array<ChecklistRecurrence | 'all'> = ['all', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'];

const BUILDER_PATH = '/admin/scheduled-checklists/builder';
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

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
  // This grid's route (`/admin/scheduled-checklists`) is open to ADMIN and PC alike, but creating,
  // importing, and exporting checklist definitions is an ADMIN-only action — PC gets read access
  // to the grid (browsing/opening existing definitions) without the ability to add or bulk-change
  // them.
  const isAdmin = user?.role === 'ADMIN';
  // Bulk multi-select + delete is available to both — same role gate as the delete route itself
  // (checklistDefinitionRouter is ADMIN/PC), unlike the single-card pause/edit/delete actions
  // (ChecklistDefinitionCard's own isAdmin), which are deliberately narrower.
  const canBulkDelete = user?.role === 'ADMIN' || user?.role === 'PC';
  const [showExport, setShowExport] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [recurrence, setRecurrence] = useState<ChecklistRecurrence | 'all'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const { data, isPending, isError, isPlaceholderData, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery(
    recurrence === 'all' ? {} : { recurrence },
  );
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;
  // keepPreviousData keeps the old list up while a new tab loads, so dim it instead of flashing
  // skeletons (those are only for "no data at all").
  const isRefreshing = isPlaceholderData;

  const exitSelectMode = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const allOnPageSelected = definitions.length > 0 && definitions.every((d) => selectedIds.has(d.id));
  const toggleSelectAll = () => setSelectedIds(allOnPageSelected ? new Set() : new Set(definitions.map((d) => d.id)));

  // Fires every delete in parallel and reports one combined result — same soft-delete remove()
  // as the single-card action, just looped, since there's no dedicated bulk-delete endpoint (each
  // definition's own delete is independent and cheap; nothing here needs a transaction across
  // definitions that don't relate to each other).
  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
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
    await queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });

    const failed = results.filter((r) => r.status === 'rejected').length;
    const succeeded = results.length - failed;
    if (succeeded) toast.success(`Deleted ${plural(succeeded, 'checklist')}`);
    if (failed) toast.error(`Couldn't delete ${plural(failed, 'checklist')}. Try again.`);
    exitSelectMode();
  };

  // Top action buttons: create/import/export are ADMIN-only (see isAdmin comment above);
  // Select/bulk-delete is ADMIN-or-PC (see canBulkDelete comment above), so it renders on its own
  // condition rather than nesting inside the isAdmin block.
  const actions = selectMode ? (
    <>
      <Button size="sm" variant="secondary" onClick={toggleSelectAll}>
        {allOnPageSelected ? 'Clear all' : 'Select all'}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={handleBulkDelete}
        isLoading={isBulkDeleting}
        disabled={!selectedIds.size}
      >
        {!isBulkDeleting && <Trash2 size={14} />}
        <span>Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</span>
      </Button>
      <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={exitSelectMode} aria-label="Cancel selection">
        <X size={14} />
        <span className="hidden sm:inline">Cancel</span>
      </Button>
    </>
  ) : (
    <>
      {!isPending && !isError && (
        <Badge variant="outline" className="font-mono text-xs py-0.5 px-2 font-semibold" aria-label={`${plural(total, 'checklist')} in total`}>
          {total}
        </Badge>
      )}
      {isAdmin && (
        <>
          <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setShowExport(true)} aria-label="Export">
            <FileDown size={14} className="text-text-muted" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setShowBulkImport(true)} aria-label="Import">
            <Upload size={14} className="text-text-muted" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" variant="primary" onClick={() => navigate(BUILDER_PATH)}>
            <Plus size={14} />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New checklist</span>
          </Button>
        </>
      )}
      {canBulkDelete && definitions.length > 0 && (
        <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setSelectMode(true)} aria-label="Select checklists to delete">
          <SelectIcon size={14} className="text-text-muted" />
          <span className="hidden sm:inline">Select</span>
        </Button>
      )}
    </>
  );

  return (
    <div className={cn('flex flex-col gap-6 w-full max-w-5xl mx-auto', className)}>
      <PageHeader
        icon={Repeat}
        title="Recurring Checklists"
        subtitle="Build checklists your stores run on a schedule, with the questions and proof each one needs."
        actions={actions}
      />

      {/* Recurrence tabs. The server already filters by recurrence (ListChecklistDefinitionsParams'
          `recurrence`). Same controlled Tabs primitive as EntityStatusFilter, not a hand-rolled
          control. */}
      <Tabs value={recurrence} onValueChange={(v) => setRecurrence(v as ChecklistRecurrence | 'all')}>
        {/* Scrolls horizontally instead of clipping on phone-width screens: seven tabs (All
            through One-time) don't fit in one row below ~500px. */}
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="w-fit">
            {RECURRENCE_TABS.map((r) => (
              <TabsTrigger key={r} value={r} className="font-display font-semibold">
                {r === 'all' ? 'All' : RECURRENCE_LABEL[r]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {isError && (
        <InlineError message="We couldn't load your checklists. Check your connection and try again." onRetry={() => refetch()} />
      )}

      {/* Loading skeleton: only when there is no data at all (a tab change keeps the old list). */}
      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <ChecklistCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state: a filtered-to-nothing tab ("no Yearly checklists yet") reads very differently
          from a genuinely empty org, so "Create new checklist" is only offered when no recurrence
          filter is narrowing the view; with one active it offers to clear the tab instead, since a
          brand-new checklist wouldn't even match whatever recurrence is currently selected. */}
      {!isPending && !isError && definitions.length === 0 && (
        recurrence !== 'all' ? (
          <EmptyState
            icon={ClipboardList}
            title={`No ${RECURRENCE_LABEL[recurrence].toLowerCase()} checklists`}
            description="Nothing runs on this schedule yet. Try another tab, or switch to All."
            action={{ label: 'Show all', onClick: () => setRecurrence('all') }}
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No checklists yet"
            description={
              isAdmin
                ? 'Set up your first recurring checklist for opening routines, safety walkthroughs, audits, or anything your stores repeat.'
                : 'Nothing here yet. Check back once an admin sets one up.'
            }
            action={isAdmin ? { label: 'Create new checklist', icon: Plus, onClick: () => navigate(BUILDER_PATH) } : undefined}
          />
        )
      )}

      {definitions.length > 0 && (
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 transition-opacity', isRefreshing && 'opacity-60')}>
          {definitions.map((d) => (
            <ChecklistDefinitionCard
              key={d.id}
              definition={d}
              selectionMode={selectMode}
              selected={selectedIds.has(d.id)}
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
