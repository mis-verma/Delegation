import { memo, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Check, ClipboardCheck, History, ListChecks, SearchX, Store, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DateRangePicker, EmptyState, ImageLightbox, InlineError, PageHeader, PageNav, PANEL_CLASS, SelectDropdown, Skeleton,
  type DateRangeValue,
} from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { ADMIN_AREA_ROLES } from '../../../api/auth';
import { UPLOADS_BASE } from '../../../lib/uploadsBase';
import { endOfDay } from '../../../lib/dateRange';
import { useAuditHistoryQuery, useChecklistInstancesBoardQuery, useStoresQuery } from '../hook';
import { AccessoryTile } from './ChecklistInstanceItemAuditCard';
import { ChecklistInstanceRow } from './ChecklistInstanceRow';
import { formatDate, formatTimeOnly } from '../checklistDisplay';
import type { AuditHistoryRow } from '../../../api/checklistInstances';

const PAGE_SIZE = 20;
const noop = () => {};

type Tab = 'audits' | 'checklists';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const lastDays = (n: number): DateRangeValue => {
  const to = new Date();
  const from = startOfDay(new Date(to.getFullYear(), to.getMonth(), to.getDate() - (n - 1)));
  return { from, to };
};
const ALL_TIME: DateRangeValue = { from: null, to: null };

const personName = (row: AuditHistoryRow) => {
  const name = `${row.personFirstName} ${row.personLastName ?? ''}`.trim();
  return row.personIsActive === false ? `${name} (left)` : name;
};

export const AuditRowCard = memo(({ row }: { row: AuditHistoryRow }) => {
  const missing = row.accessories.filter(a => !a.checked).length;
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const closePreview = useCallback(() => setPreviewSrc(null), []);
  return (
    <article className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 sm:p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-0.5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <User size={13} className="text-text-muted shrink-0" aria-hidden />
            <span className="truncate">{personName(row) || 'Unknown person'}</span>
          </h3>
          <p className="text-xs text-text-muted">
            {row.itemLabel} · {row.checklistTitle}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-text-muted flex-wrap">
            {row.storeName && <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{row.storeName}</span>}
            <span>{formatDate(row.periodStart)}{row.completedAt ? ` · checked ${formatTimeOnly(row.completedAt)}` : ''}</span>
          </p>
        </div>
        {row.isNotApplicable ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-hover text-xs font-medium text-text-secondary shrink-0">
            <Ban size={12} strokeWidth={2.5} aria-hidden />
            Not applicable
          </span>
        ) : row.accessories.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium shrink-0 tabular-nums',
              missing === 0 ? 'bg-success/10 dark:bg-success/15 text-text-secondary' : 'bg-danger/10 dark:bg-danger/15 text-text-secondary',
            )}
          >
            {missing === 0 ? (
              <>
                <Check size={12} strokeWidth={3} className="text-success" aria-hidden />
                All in order
              </>
            ) : (
              `${missing} missing`
            )}
          </span>
        )}
      </div>

      {row.accessories.length > 0 && !row.isNotApplicable && (
        <ul className="flex flex-wrap gap-2">
          {row.accessories.map(a => (
            <li key={a.name}>
              <AccessoryTile name={a.name} checked={a.checked} missing={!a.checked} interactive={false} onToggle={noop} />
            </li>
          ))}
        </ul>
      )}

      {row.images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {row.images.map(img => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setPreviewSrc(`${UPLOADS_BASE}${img.url}`)}
                aria-label="View photo larger"
                className="block rounded-lg outline-none cursor-pointer transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <img
                  src={`${UPLOADS_BASE}${img.url}`}
                  alt={img.originalFilename ?? `Photo from the audit of ${personName(row)}`}
                  loading="lazy"
                  className="size-16 rounded-lg border border-border object-cover bg-surface-hover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {row.remarks && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-secondary">{row.isNotApplicable ? 'Reason' : 'Remarks'}</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{row.remarks}</p>
        </div>
      )}
      {previewSrc && createPortal(<ImageLightbox src={previewSrc} onClose={closePreview} />, document.body)}
    </article>
  );
});
AuditRowCard.displayName = 'AuditRowCard';


// Same card shape as a history row, so nothing shifts when the real rows arrive.
const ListSkeleton = () => (
  <div className="flex flex-col gap-3" aria-hidden>
    {[0, 1, 2].map(i => (
      <div key={i} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 sm:p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-7 w-24 rounded-full shrink-0" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    ))}
  </div>
);

const TAB_TRIGGER_CLASS =
  'min-h-11 sm:min-h-8 px-3.5 text-xs border border-transparent data-[state=active]:border-border data-[state=active]:shadow-none';

/**
 * Where past days go. Audit results and finished/unfinished checklists used to pile up at the
 * bottom of every person's checklist panel; now they live here, for the people who oversee them.
 * ADMIN and PC see every store; a department head (MANAGER/SENIOR) sees only their own department,
 * and the server enforces that, this page just asks.
 */
export const ChecklistHistory = () => {
  const { user } = useAuth();
  const orgWide = !!user && ADMIN_AREA_ROLES.includes(user.role);

  const [tab, setTab] = useState<Tab>('audits');
  const [range, setRangeState] = useState<DateRangeValue>(() => lastDays(7));
  const [storeId, setStoreIdState] = useState('');
  const [page, setPage] = useState(1);

  // Any filter or tab change returns to page one: page 4 of the old result is meaningless against
  // the new one. Done in the setters, not an effect, so the stale page never renders.
  const setRange = (value: DateRangeValue) => { setRangeState(value); setPage(1); };
  const setStoreId = (value: string) => { setStoreIdState(value); setPage(1); };
  const changeTab = (next: string) => { setTab(next as Tab); setPage(1); };
  const clearFilters = () => { setRangeState(ALL_TIME); setStoreIdState(''); setPage(1); };

  const from = range.from ? startOfDay(range.from).toISOString() : undefined;
  const to = range.to ? endOfDay(range.to).toISOString() : undefined;

  const { data: stores = [], isLoading: storesLoading } = useStoresQuery();
  const storeNameById = useMemo(() => new Map(stores.map(s => [s.id, s.name])), [stores]);
  const storeOptions = useMemo(
    () => [{ value: '', label: 'All stores' }, ...stores.map(s => ({ value: s.id, label: s.name }))],
    [stores],
  );

  // Only the visible tab's query runs: the other tab's list isn't fetched until it's opened.
  const audits = useAuditHistoryQuery(
    { storeId: storeId || undefined, from, to },
    { page, limit: PAGE_SIZE },
    { enabled: tab === 'audits' },
  );
  const checklists = useChecklistInstancesBoardQuery(
    { storeId: storeId || undefined, from, to, page, limit: PAGE_SIZE },
    { enabled: tab === 'checklists' },
  );

  const active = tab === 'audits' ? audits : checklists;
  const auditRows = audits.data?.data;
  const checklistRows = checklists.data?.data;
  const rowCount = (tab === 'audits' ? auditRows : checklistRows)?.length ?? 0;
  const totalPages = active.data?.meta.totalPages ?? 1;
  const hasFilters = !!range.from || !!range.to || !!storeId;
  // keepPreviousData keeps the old page on screen while a new filter loads: dim it, don't blank it.
  const refreshing = active.isPlaceholderData;

  const panel = (
    <>
      {active.isPending && !active.isError && <ListSkeleton />}

      {active.isError && (
        <InlineError message="We couldn't load the history. Check your connection and try again." onRetry={() => active.refetch()} />
      )}

      {!active.isPending && !active.isError && rowCount === 0 && (
        <EmptyState
          icon={SearchX}
          title={tab === 'audits' ? 'No audits in this range' : 'No checklists in this range'}
          description="Try a wider date range or another store."
          action={hasFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      )}

      {rowCount > 0 && (
        <div className={cn('flex flex-col gap-3 transition-opacity', refreshing && 'opacity-60')}>
          {tab === 'audits'
            ? auditRows?.map(row => <AuditRowCard key={row.id} row={row} />)
            : checklistRows?.map(instance => (
              <ChecklistInstanceRow
                key={instance.id}
                instance={instance}
                storeName={storeNameById.get(instance.storeId) ?? (storesLoading ? '' : 'Unknown store')}
              />
            ))}
        </div>
      )}

      {!active.isPending && !active.isError && totalPages > 1 && (
        <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <PageHeader
        icon={History}
        title="History"
        subtitle={orgWide
          ? 'Past audits and checklists across every store.'
          : 'Past audits and checklists for the people in your department.'}
      />

      <Tabs value={tab} onValueChange={changeTab} className="gap-6">
        <div className={cn(PANEL_CLASS, 'flex flex-col gap-4 p-4 sm:p-5')}>
          <TabsList aria-label="History type" className="self-start">
            <TabsTrigger value="audits" className={TAB_TRIGGER_CLASS}>
              <ClipboardCheck size={14} aria-hidden />
              Audits
            </TabsTrigger>
            <TabsTrigger value="checklists" className={TAB_TRIGGER_CLASS}>
              <ListChecks size={14} aria-hidden />
              Checklists
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 w-full sm:w-64">
              <span className="text-xs font-display font-medium text-text-secondary">Dates</span>
              <DateRangePicker value={range} onChange={setRange} placeholder="All time" placeholderIsValue />
            </div>
            <div className="flex flex-col gap-1.5 w-full sm:w-48">
              <span className="text-xs font-display font-medium text-text-secondary">Store</span>
              <SelectDropdown
                value={storeId}
                onChange={setStoreId}
                options={storeOptions}
                aria-label="Filter by store"
              />
            </div>
          </div>
        </div>

        <TabsContent value="audits" className="flex flex-col gap-4">{panel}</TabsContent>
        <TabsContent value="checklists" className="flex flex-col gap-4">{panel}</TabsContent>
      </Tabs>
    </div>
  );
};
