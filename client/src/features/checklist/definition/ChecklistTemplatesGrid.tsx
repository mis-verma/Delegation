import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, AlertCircle, ClipboardList, FileDown, Upload, ListChecks as SelectIcon, X, Trash2, Loader2 } from 'lucide-react';
import { Button, Skeleton, EmptyState } from '../../../components';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/confirmDialog';
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
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery(
    recurrence === 'all' ? {} : { recurrence },
  );
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
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
      title: `Delete ${ids.length} checklist${ids.length === 1 ? '' : 's'}?`,
      description: `${ids.length === 1 ? 'This checklist and every run tied to it' : 'These checklists and every run tied to them'} will disappear from the app — My Checklists, Compliance, the Dashboard, everywhere.`,
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
    if (succeeded) toast.success(`Deleted ${succeeded} checklist${succeeded === 1 ? '' : 's'}`);
    if (failed) toast.error(`Couldn't delete ${failed} checklist${failed === 1 ? '' : 's'} — try again`);
    exitSelectMode();
  };

  return (
    <div className={`flex flex-col gap-6 w-full ${className}`}>
      {/* Header & Page Actions */}
      <div className="flex items-center justify-between gap-3 sm:gap-4 pb-1">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text tracking-tight">
              Recurring Checklists
            </h1>
            {!isPending && !isError && (
              <Badge variant="outline" className="font-mono text-xs py-0.5 px-2 font-semibold">
                {total}
              </Badge>
            )}
          </div>
          <p className="hidden sm:block text-sm font-display text-text-muted leading-relaxed max-w-2xl">
            Build recurring checklists your stores run on a schedule — questions, proof requirements, and all.
          </p>
        </div>

        {/* Top Action Buttons — create/import/export are ADMIN-only (see isAdmin comment above);
            Select/bulk-delete is ADMIN-or-PC (see canBulkDelete comment above), so it renders on
            its own condition rather than nesting inside the isAdmin block. */}
        {selectMode ? (
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap justify-end">
            <Button size="sm" variant="secondary" className="gap-1.5 text-xs font-display font-medium" onClick={toggleSelectAll}>
              {allOnPageSelected ? 'Clear all' : 'Select all'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="gap-1.5 text-xs font-display font-medium"
              onClick={handleBulkDelete}
              disabled={!selectedIds.size || isBulkDeleting}
            >
              {isBulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</span>
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5 text-xs font-display font-medium" onClick={exitSelectMode} aria-label="Cancel selection">
              <X size={14} />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 text-xs font-display font-medium"
                  onClick={() => setShowExport(true)}
                  aria-label="Export"
                >
                  <FileDown size={14} className="text-text-muted" />
                  <span className="hidden sm:inline">Export</span>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 text-xs font-display font-medium"
                  onClick={() => setShowBulkImport(true)}
                  aria-label="Import"
                >
                  <Upload size={14} className="text-text-muted" />
                  <span className="hidden sm:inline">Import</span>
                </Button>

                <Button
                  size="sm"
                  variant="primary"
                  className="gap-1.5 text-xs font-display font-medium"
                  onClick={() => navigate('/admin/scheduled-checklists/builder')}
                >
                  <Plus size={14} />
                  <span className="sm:hidden">New</span>
                  <span className="hidden sm:inline">New checklist</span>
                </Button>
              </>
            )}

            {canBulkDelete && definitions.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 text-xs font-display font-medium"
                onClick={() => setSelectMode(true)}
                aria-label="Select checklists to delete"
              >
                <SelectIcon size={14} className="text-text-muted" />
                <span className="hidden sm:inline">Select</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Recurrence tabs — Daily/Weekly/Monthly/Quarterly/Yearly/One-time templates used to be one
          undifferentiated grid with recurrence buried as a line of text on each card; the server
          already supported filtering by it (ListChecklistDefinitionsParams' `recurrence`), it just
          wasn't wired to anything here. Same controlled Tabs primitive as EntityStatusFilter, not a
          hand-rolled control. */}
      <Tabs value={recurrence} onValueChange={(v) => setRecurrence(v as ChecklistRecurrence | 'all')}>
        {/* Scrolls horizontally instead of clipping on phone-width screens — seven tabs (All
            through One-time) don't fit in one row below ~500px, same fix/reasoning as
            OrgOverview's own section TabsList. */}
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

      {/* Loading Skeleton */}
      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 p-5 rounded-lg border border-border bg-surface"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-5 w-3/4 rounded-md" />
              <Skeleton className="h-4 w-1/2 rounded-md" />
              <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display shadow-xs"
        >
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">We couldn't load your checklists. Check your connection and try again.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State — a filtered-to-nothing tab ("no Yearly checklists yet") reads very differently
          from a genuinely empty org, so this only offers "Create new checklist" when there's no
          recurrence filter narrowing the view; with one active it offers to clear the tab instead,
          since a brand-new checklist wouldn't even match whatever recurrence is currently selected. */}
      {!isPending && !isError && definitions.length === 0 && (
        recurrence !== 'all' ? (
          <EmptyState
            icon={ClipboardList}
            title={`No ${RECURRENCE_LABEL[recurrence].toLowerCase()} checklists`}
            description="No templates on this schedule yet — try another tab, or switch to All."
            action={{ label: 'Show all', onClick: () => setRecurrence('all') }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 border border-dashed border-border/70 rounded-xl bg-surface/30 text-center">
            <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted mb-4">
              <ClipboardList className="size-6" strokeWidth={2.25} />
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-text mb-1.5">
              No checklist templates yet
            </h2>
            <p className="text-xs sm:text-sm font-display text-text-muted max-w-sm mb-6 leading-relaxed">
              {isAdmin
                ? 'Set up your first recurring checklist — for opening procedures, safety walkthroughs, audits, whatever your stores need to do on repeat.'
                : 'No recurring checklists yet — check back once an admin sets one up.'}
            </p>
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/admin/scheduled-checklists/builder')}
                className="gap-1.5 text-xs sm:text-sm font-display font-medium"
              >
                <Plus size={15} />
                <span>Create new checklist</span>
              </Button>
            )}
          </div>
        )
      )}

      {/* Templates Grid */}
      {!isPending && !isError && definitions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {definitions.map((d) => (
            <ChecklistDefinitionCard
              key={d.id}
              definition={d}
              selectionMode={selectMode}
              selected={selectedIds.has(d.id)}
              onToggleSelected={() => toggleSelected(d.id)}
            />
          ))}
        </div>
      )}

      {!isPending && !isError && hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="self-center inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isFetchingNextPage ? 'Loading…' : `Load more (${total - definitions.length} remaining)`}
        </button>
      )}

      {/* Export Dialog */}
      {showExport && (
        <ExportDialog
          reportModule="checklists"
          title="Export Checklists"
          description="Every recurring checklist instance generated in the selected period — completion progress per instance."
          onClose={() => setShowExport(false)}
        />
      )}

      <ChecklistBulkImportModal open={showBulkImport} onClose={() => setShowBulkImport(false)} />
    </div>
  );
};