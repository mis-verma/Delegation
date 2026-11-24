import { useCallback, useMemo, useState } from 'react';
import { CreateButton } from '../../../components/createButton';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../../lib/queryHelpers';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { toast } from 'sonner';
import { DraftsDialog } from '../../drafts/DraftsDialog';
import { useDraftsQuery } from '../../drafts/hook';
import { Plus, ClipboardList, FileClock, FileDown, Upload, UserPlus, ListChecks as SelectIcon, X, Trash2, Repeat, ChevronDown, Store, Building2, User, Layers } from 'lucide-react';
import { Button, Skeleton, EmptyState, InlineError, PageHeader, ViewToggle, ENTITY_CARD_CLASS, SearchField, AppliedFilters, SlidingTabs, type AppliedFilter, type SlidingTabOption, type ViewTab } from '../../../components';
import { ChoiceChip, ChoiceClear, ChoiceIcon, ChoiceWrap, OptionSection, OptionsSheet } from '../../../components/optionsSheet';
import { QuickFilterStats, statusTiles } from '../../../components/quickFilterStats';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '../../../context/AuthContext';
import { useChecklistDefinitionsQuery, useChecklistDefinitionsSummaryQuery, useStoresQuery, useDepartmentsQuery, useAssignableUsersQuery } from '../hook';
import { ChecklistDefinitionCard } from './ChecklistDefinitionCard';
import { ChecklistBulkImportModal } from './bulkImport/ChecklistBulkImportModal';
import { ChecklistCreateImportModal } from './bulkImport/ChecklistCreateImportModal';
import { ExportDialog } from '../../reports';
import { plural } from '../checklistDisplay';
import { RECURRENCE_LABEL, RECURRENCE_ORDER } from '../recurrenceRegistry';
import { ChecklistDefinitionRows, ChecklistDefinitionTable } from './ChecklistDefinitionViews';
import { checklistDefinitionApi, type ChecklistRecurrence } from '../../../api/checklistDefinitions';

interface ChecklistTemplatesGridProps {
  className?: string;
}

const RECURRENCE_TABS: Array<ChecklistRecurrence | 'all'> = ['all', ...RECURRENCE_ORDER];

type DefinitionView = 'cards' | 'list' | 'table';
const VIEW_TABS: ViewTab<DefinitionView>[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'list', label: 'List' },
  { key: 'table', label: 'Table', mobileHidden: true },
];
const VIEW_KEYS: readonly string[] = VIEW_TABS.map((t) => t.key);

type StatusFilter = 'all' | 'active' | 'draft' | 'paused';
const STATUS_TILES = statusTiles<Exclude<StatusFilter, 'all'>>(['active', 'draft', 'paused']);

type Period = 'all' | 'week' | 'month' | 'year';
const PERIOD_OPTIONS: readonly SlidingTabOption<Period>[] = [
  { value: 'all', label: 'All time', shortLabel: 'All' },
  { value: 'week', label: 'This week', shortLabel: 'Week' },
  { value: 'month', label: 'This month', shortLabel: 'Month' },
  { value: 'year', label: 'This year', shortLabel: 'Year' },
];

const periodStartIso = (period: Period): string | undefined => {
  if (period === 'all') return undefined;
  const now = new Date();
  if (period === 'week') {
    const mondayOffset = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset).toISOString();
  }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return new Date(now.getFullYear(), 0, 1).toISOString();
};

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
  const [showCreateImport, setShowCreateImport] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const { data: checklistDrafts } = useDraftsQuery('CHECKLIST', canManage);
  const recurrenceParam = searchParams.get('recurrence')?.toLowerCase();
  const recurrence = RECURRENCE_TABS.find((r) => r.toLowerCase() === recurrenceParam) ?? 'all';
  const statusParam = searchParams.get('status');
  const status: StatusFilter = statusParam === 'active' || statusParam === 'draft' || statusParam === 'paused' ? statusParam : 'all';
  const storeId = searchParams.get('store') ?? '';
  const departmentId = searchParams.get('department') ?? '';
  const assigneeId = searchParams.get('user') ?? '';
  const viewParam = searchParams.get('view');
  const view: DefinitionView = VIEW_KEYS.includes(viewParam ?? '') ? (viewParam as DefinitionView) : 'cards';
  const periodParam = searchParams.get('period');
  const period: Period = periodParam === 'week' || periodParam === 'month' || periodParam === 'year' ? periodParam : 'all';
  const groupByStore = searchParams.get('group') === 'store';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const isFiltered = recurrence !== 'all' || status !== 'all' || period !== 'all' || !!storeId || !!departmentId || !!assigneeId || !!search.trim();
  const [showFilters, setShowFilters] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: stores } = useStoresQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: people } = useAssignableUsersQuery();
  const storeOptions = useMemo(() => (stores ?? []).filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })), [stores]);
  const departmentOptions = useMemo(() => (departments ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name })), [departments]);
  const peopleOptions = useMemo(() => (people ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName ?? ''}`.trim() })), [people]);
  const storeNames = useMemo(() => new Map(storeOptions.map((o) => [o.value, o.label])), [storeOptions]);
  const departmentNames = useMemo(() => new Map(departmentOptions.map((o) => [o.value, o.label])), [departmentOptions]);
  const peopleNames = useMemo(() => new Map(peopleOptions.map((o) => [o.value, o.label])), [peopleOptions]);

  const createdFrom = useMemo(() => periodStartIso(period), [period]);

  const { data, isPending, isError, isPlaceholderData, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChecklistDefinitionsQuery({
    ...(recurrence === 'all' ? {} : { recurrence }),
    ...(status === 'all' ? {} : status === 'active' ? { isActive: true } : { isActive: false, draft: status === 'draft' }),
    ...(storeId ? { storeId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(createdFrom ? { createdFrom } : {}),
  });
  const definitions = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.meta?.total ?? definitions.length;
  const isRefreshing = isPlaceholderData;
  const activeFilterCount = (storeId ? 1 : 0) + (departmentId ? 1 : 0) + (assigneeId ? 1 : 0);

  const { data: statusSummary, isPending: isSummaryPending } = useChecklistDefinitionsSummaryQuery({
    ...(recurrence === 'all' ? {} : { recurrence }),
    ...(storeId ? { storeId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(createdFrom ? { createdFrom } : {}),
  });

  const storeSections = useMemo(() => {
    if (!groupByStore) return null;
    const byStore = new Map<string, typeof definitions>();
    const noStore: typeof definitions = [];
    for (const d of definitions) {
      if (!d.storeIds.length) { noStore.push(d); continue; }
      for (const sid of d.storeIds) byStore.set(sid, [...(byStore.get(sid) ?? []), d]);
    }
    const sections = [...byStore.entries()]
      .map(([id, defs]) => ({ id, name: storeNames.get(id) ?? 'Unknown store', defs }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (noStore.length) sections.push({ id: 'none', name: 'No store yet', defs: noStore });
    return sections;
  }, [groupByStore, definitions, storeNames]);

  const selection = useMemo(() => {
    const loaded = new Set(definitions.map((d) => d.id));
    return new Set([...selectedIds].filter((id) => loaded.has(id)));
  }, [definitions, selectedIds]);

  const setFilter = (key: 'recurrence' | 'status' | 'view' | 'store' | 'department' | 'user' | 'period' | 'group', value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === 'all' || value === '' || (key === 'view' && value === 'cards')) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
    if (key !== 'view' && key !== 'group') setSelectedIds(new Set());
  };
  const clearFilters = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('recurrence');
      next.delete('status');
      next.delete('store');
      next.delete('department');
      next.delete('user');
      next.delete('period');
      return next;
    }, { replace: true });
    setSearch('');
    setSelectedIds(new Set());
  };

  const appliedFilters: AppliedFilter[] = [];
  if (storeId) appliedFilters.push({ key: 'store', label: storeNames.get(storeId) ?? 'One store', onRemove: () => setFilter('store', '') });
  if (departmentId) appliedFilters.push({ key: 'department', label: departmentNames.get(departmentId) ?? 'One department', onRemove: () => setFilter('department', '') });
  if (assigneeId) appliedFilters.push({ key: 'user', label: peopleNames.get(assigneeId) ?? 'One person', onRemove: () => setFilter('user', '') });

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" aria-label="Bulk upload options">
              <Upload size={14} className="text-text-muted" />
              <span className="hidden sm:inline">Import</span>
              <ChevronDown size={12} className="hidden text-text-muted sm:inline" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={() => setShowBulkImport(true)}>
              <Upload size={14} className="shrink-0 text-text-muted" />
              <span className="flex min-w-0 flex-col">
                <span className="font-display font-semibold text-text">Assign an existing checklist</span>
                <span className="t-meta text-text-muted">Give a checklist you already built to more stores or people</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowCreateImport(true)}>
              <UserPlus size={14} className="shrink-0 text-text-muted" />
              <span className="flex min-w-0 flex-col">
                <span className="font-display font-semibold text-text">Create new checklists</span>
                <span className="t-meta text-text-muted">Build whole new checklists, with their questions, from a sheet</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {definitions.length > 0 && (
          <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setSelectMode(true)} aria-label="Select checklists to delete">
            <SelectIcon size={14} className="text-text-muted" />
            <span className="hidden sm:inline">Select</span>
          </Button>
        )}
        <Button size="sm" variant="secondary" className="min-w-11 sm:min-w-0" onClick={() => setShowDrafts(true)} aria-label="Drafts">
          <FileClock size={14} className="text-text-muted" />
          <span className="hidden sm:inline">Drafts{checklistDrafts?.length ? ` (${checklistDrafts.length})` : ''}</span>
        </Button>
        <CreateButton label="New checklist" onClick={() => navigate(BUILDER_PATH)} />
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

      <QuickFilterStats
        tiles={STATUS_TILES}
        counts={{ active: statusSummary?.active ?? 0, draft: statusSummary?.draft ?? 0, paused: statusSummary?.paused ?? 0 }}
        active={status === 'all' ? null : status}
        onToggle={(key) => setFilter('status', status === key ? 'all' : key)}
        onClearFilter={() => setFilter('status', 'all')}
        total={statusSummary?.total}
        totalLabel="All"
        itemLabel="checklists"
        variant="navy"
        isLoading={isSummaryPending && !statusSummary}
      />

      {/* Search & filter bar with surface background for visual separation */}
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-700/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search checklists"
            placeholder="Search checklists"
            className="w-full flex-none sm:w-auto sm:flex-1 sm:max-w-sm"
          />
          <OptionsSheet
            isOpen={showFilters}
            setIsOpen={setShowFilters}
            activeCount={activeFilterCount}
            subtitle={plural(total, 'checklist')}
            onReset={clearFilters}
            canReset={activeFilterCount > 0}
            triggerLabel="Store, department or person"
            showLabel={`Show ${plural(total, 'checklist')}`}
          >
            {storeOptions.length > 0 && (
              <OptionSection icon={Store} label="Store" aside={!!storeId && <ChoiceClear onClick={() => setFilter('store', '')} />}>
                <ChoiceWrap>
                  {storeOptions.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      active={storeId === o.value}
                      onClick={() => setFilter('store', storeId === o.value ? '' : o.value)}
                      lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}
                    >
                      {o.label}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}
            {departmentOptions.length > 0 && (
              <OptionSection icon={Building2} label="Department" aside={!!departmentId && <ChoiceClear onClick={() => setFilter('department', '')} />}>
                <ChoiceWrap>
                  {departmentOptions.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      active={departmentId === o.value}
                      onClick={() => setFilter('department', departmentId === o.value ? '' : o.value)}
                      lead={<ChoiceIcon icon={Building2} tone="bg-coral-400" />}
                    >
                      {o.label}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}
            {peopleOptions.length > 0 && (
              <OptionSection icon={User} label="Person" aside={!!assigneeId && <ChoiceClear onClick={() => setFilter('user', '')} />}>
                <ChoiceWrap>
                  {peopleOptions.map((o) => (
                    <ChoiceChip
                      key={o.value}
                      active={assigneeId === o.value}
                      onClick={() => setFilter('user', assigneeId === o.value ? '' : o.value)}
                      lead={<ChoiceIcon icon={User} tone="bg-success" />}
                    >
                      {o.label}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}
          </OptionsSheet>
        </div>

        {/* Recurrence tabs with enhanced visual treatment */}
        <Tabs value={recurrence} onValueChange={(v) => setFilter('recurrence', v === 'all' ? 'all' : v.toLowerCase())}>
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0">
            <TabsList className="w-fit bg-white/70 dark:bg-slate-800/50 shadow-sm border border-slate-200/40 dark:border-slate-700/30">
              {RECURRENCE_TABS.map((r) => (
                <TabsTrigger key={r} value={r} className="min-h-11 sm:min-h-8 font-display font-bold">
                  {r === 'all' ? 'All' : RECURRENCE_LABEL[r]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        {/* Period & group controls row with better spacing */}
        <div className="flex flex-wrap items-center gap-2.5">
          <SlidingTabs
            label="Period"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(next) => setFilter('period', next)}
            size="sm"
            fill="phone"
            className="min-w-0 flex-1 sm:flex-none"
          />
          {view !== 'table' && (
            <Button
              size="sm"
              variant={groupByStore ? 'secondary' : 'ghost'}
              aria-pressed={groupByStore}
              onClick={() => setFilter('group', groupByStore ? '' : 'store')}
            >
              <Layers size={14} className={groupByStore ? 'text-primary-600' : 'text-text-muted'} />
              Group by store
            </Button>
          )}
          {isFiltered && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <span className="ml-auto">
            <ViewToggle tabs={VIEW_TABS} value={view} onChange={(next) => setFilter('view', next)} storageKey="view:recurring-checklists" />
          </span>
        </div>
      </div>

      <AppliedFilters items={appliedFilters} onClearAll={clearFilters} />

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

      {definitions.length > 0 && view === 'table' && (
        <div className={cn('transition-opacity', isRefreshing && 'opacity-60')}>
          <ChecklistDefinitionTable definitions={definitions} selectionMode={selectMode} selection={selection} onToggleSelected={toggleSelected} />
        </div>
      )}

      {definitions.length > 0 && view === 'list' && (
        <div className={cn('flex flex-col gap-5 transition-opacity', isRefreshing && 'opacity-60')}>
          {storeSections ? (
            storeSections.map((section) => (
              <div key={section.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <Store size={14} className="text-text-muted shrink-0" aria-hidden />
                  <h3 className="t-card font-display font-bold text-text">{section.name}</h3>
                  <span className="t-meta font-display text-text-muted">{plural(section.defs.length, 'checklist')}</span>
                </div>
                <ChecklistDefinitionRows definitions={section.defs} selectionMode={selectMode} selection={selection} onToggleSelected={toggleSelected} />
              </div>
            ))
          ) : (
            <ChecklistDefinitionRows definitions={definitions} selectionMode={selectMode} selection={selection} onToggleSelected={toggleSelected} />
          )}
        </div>
      )}

      {definitions.length > 0 && view === 'cards' && (
        <div className={cn('flex flex-col gap-6 transition-opacity', isRefreshing && 'opacity-60')}>
          {storeSections ? (
            storeSections.map((section) => (
              <div key={section.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1">
                  <Store size={14} className="text-text-muted shrink-0" aria-hidden />
                  <h3 className="t-card font-display font-bold text-text">{section.name}</h3>
                  <span className="t-meta font-display text-text-muted">{plural(section.defs.length, 'checklist')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                  {section.defs.map((d) => (
                    <ChecklistDefinitionCard
                      key={d.id}
                      definition={d}
                      selectionMode={selectMode}
                      selected={selection.has(d.id)}
                      onToggleSelected={toggleSelected}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
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
        </div>
      )}

      {!isPending && !isError && hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="self-center px-6 py-2.5 font-display font-semibold border-2 border-primary-500/40 text-primary-600 dark:text-primary-400 hover:border-primary-500 hover:bg-primary-50/60 dark:hover:bg-primary-900/20 transition-all duration-200 shadow-sm hover:shadow-md"
          onClick={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
        >
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
      <ChecklistCreateImportModal open={showCreateImport} onClose={() => setShowCreateImport(false)} />
      <DraftsDialog kind="CHECKLIST" open={showDrafts} onClose={() => setShowDrafts(false)} onOpenDraft={(d) => { setShowDrafts(false); navigate(`${BUILDER_PATH}?draft=${d.id}`); }} />
    </div>
  );
};
