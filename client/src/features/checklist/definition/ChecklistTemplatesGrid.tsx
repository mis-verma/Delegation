import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../../lib/queryHelpers';
import { toast } from 'sonner';
import { Plus, ClipboardList, FileDown, Upload, ListChecks as SelectIcon, X, Trash2, Repeat } from 'lucide-react';
import { Button, Skeleton, EmptyState, IconChip, InlineError, PageHeader, ToggleChip, ENTITY_CARD_CLASS } from '../../../components';
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

const RECURRENCE_TABS: Array<ChecklistRecurrence | 'all'> = ['all', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'];

type StatusFilter = 'all' | 'active' | 'draft' | 'paused';
const STATUS_CHIPS: Array<{ value: Exclude<StatusFilter, 'all'>; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
];

const BUILDER_PATH = '/admin/scheduled-checklists/builder';

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
  const canManage = user?.role === 'ADMIN' || user?.role === 'PC';
  const [showExport, setShowExport] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const recurrenceParam = searchParams.get('recurrence')?.toLowerCase();
  const recurrence = RECURRENCE_TABS.find((r) => r.toLowerCase() === recurrenceParam) ?? 'all';
  const statusParam = searchParams.get('status');
  const status: StatusFilter = statusParam === 'active' || statusParam === 'draft' || statusParam === 'paused' ? statusParam : 'all';
  const isFiltered = recurrence !== 'all' || status !== 'all';

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const { data, isPending, isError, isPlaceholderData, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery({
    ...(recurrence === 'all' ? {} : { recurrence }),
    ...(status === 'all' ? {} : status === 'active' ? { isActive: true } : { isActive: false, draft: status === 'draft' }),
  });
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;
  const isRefreshing = isPlaceholderData;

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
      setSelectedIds(new Set(failedIds));
    } else {
      exitSelectMode();
    }
  };

  const actions = selectMode ? (
    <>
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

      <div className="flex flex-col gap-3">
        <Tabs value={recurrence} onValueChange={(v) => setFilter('recurrence', v === 'all' ? 'all' : v.toLowerCase())}>
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
            <span className="ml-auto" aria-live="polite">
              <IconChip icon={Repeat} tone="bg-primary-600" label={plural(total, 'checklist')} labelClassName="tabular-nums" />
            </span>
          )}
        </div>
      </div>

      {isError && (
        <InlineError message="We couldn't load your checklists. Check your connection and try again." onRetry={() => refetch()} />
      )}

      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <ChecklistCardSkeleton key={i} />
          ))}
        </div>
      )}

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
