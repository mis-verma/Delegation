import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Ban, Check, ClipboardCheck, History, ListChecks, SearchX, Store, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  DateRangePicker, EmptyState, PageNav, SelectDropdown, Skeleton, StatusChip, type DateRangeValue,
} from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { ADMIN_AREA_ROLES } from '../../../api/auth';
import { UPLOADS_BASE } from '../../../lib/uploadsBase';
import { endOfDay } from '../../../lib/dateRange';
import { useAuditHistoryQuery, useChecklistInstancesBoardQuery, useStoresQuery } from '../hook';
import { AccessoryTile } from './ChecklistInstanceItemAuditCard';
import {
  formatDate, formatTimeOnly, instanceProgressBarClass, instanceProgressToneClass, isInstanceOverdue,
  VERIFICATION_BADGE_VARIANT, VERIFICATION_STATUS_LABEL,
} from '../checklistDisplay';
import type { AuditHistoryRow, ChecklistInstance } from '../../../api/checklistInstances';

const PAGE_SIZE = 20;
const noop = () => {};

type Tab = 'audits' | 'checklists';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const lastDays = (n: number): DateRangeValue => {
  const to = new Date();
  const from = startOfDay(new Date(to.getFullYear(), to.getMonth(), to.getDate() - (n - 1)));
  return { from, to };
};

const personName = (row: AuditHistoryRow) => {
  const name = `${row.personFirstName} ${row.personLastName ?? ''}`.trim();
  return row.personIsActive === false ? `${name} (left)` : name;
};

export const AuditRowCard = ({ row }: { row: AuditHistoryRow }) => {
  const missing = row.accessories.filter(a => !a.checked).length;
  return (
    <article className="flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface">
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
              <img
                src={`${UPLOADS_BASE}${img.url}`}
                alt={img.originalFilename ?? `Photo from the audit of ${personName(row)}`}
                loading="lazy"
                className="size-16 rounded-lg border border-border object-cover bg-surface-hover"
              />
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
    </article>
  );
};

const ChecklistRow = ({ instance, storeName }: { instance: ChecklistInstance; storeName: string }) => {
  const total = instance.items.length;
  const done = instance.items.filter(i => i.isDone).length;
  const isComplete = total > 0 && done === total;
  const overdue = isInstanceOverdue(instance, isComplete);
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      to={`/checklists/${instance.id}`}
      className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface hover:border-border-hover transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-display font-bold text-text line-clamp-2 leading-snug">{instance.title}</p>
          <p className="flex items-center gap-2 mt-1 text-xs text-text-muted font-display flex-wrap">
            <span className="inline-flex items-center gap-1"><Store size={11} aria-hidden />{storeName}</span>
            <span>{formatDate(instance.periodStart)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={isComplete ? 'completed' : overdue ? 'overdue' : 'due'} />
          <Badge variant={VERIFICATION_BADGE_VARIANT[instance.verificationStatus]}>
            {VERIFICATION_STATUS_LABEL[instance.verificationStatus]}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 bg-surface-hover rounded-full overflow-hidden border border-border/50">
          <div className={`h-full rounded-full ${instanceProgressBarClass(overdue, isComplete)}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-xs font-display font-medium shrink-0 tabular-nums ${instanceProgressToneClass(overdue, isComplete)}`}>
          {done}/{total}
        </span>
      </div>
    </Link>
  );
};

const ListSkeleton = () => (
  <div className="flex flex-col gap-3">
    {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
  </div>
);

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
  const changeTab = (next: Tab) => { setTab(next); setPage(1); };

  const from = range.from ? startOfDay(range.from).toISOString() : undefined;
  const to = range.to ? endOfDay(range.to).toISOString() : undefined;

  const { data: stores = [] } = useStoresQuery();
  const storeNameById = useMemo(() => new Map(stores.map(s => [s.id, s.name])), [stores]);

  const audits = useAuditHistoryQuery(
    { storeId: storeId || undefined, from, to },
    { page, limit: PAGE_SIZE },
  );
  const checklists = useChecklistInstancesBoardQuery({
    storeId: storeId || undefined, from, to, page, limit: PAGE_SIZE,
  });

  const active = tab === 'audits' ? audits : checklists;
  const rows = tab === 'audits' ? (audits.data?.data ?? []) : (checklists.data?.data ?? []);
  const totalPages = active.data?.meta.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center size-10 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300 shrink-0">
          <History size={20} aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Checklist History</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {orgWide
              ? 'Past audits and checklists across every store.'
              : 'Past audits and checklists for the people in your department.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5 rounded-xl border border-border bg-surface">
        <div role="tablist" aria-label="History type" className="inline-flex self-start p-1 rounded-lg bg-surface-hover/70 border border-border/60">
          {([
            { key: 'audits', label: 'Audits', icon: ClipboardCheck },
            { key: 'checklists', label: 'Checklists', icon: ListChecks },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => changeTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                tab === t.key ? 'bg-surface text-text border border-border' : 'text-text-muted hover:text-text border border-transparent',
              )}
            >
              <t.icon size={14} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5 w-full sm:w-64">
            <label className="text-xs font-display font-medium text-text-secondary">Dates</label>
            <DateRangePicker value={range} onChange={setRange} placeholder="All time" placeholderIsValue />
          </div>
          <div className="flex flex-col gap-1.5 w-full sm:w-48">
            <label className="text-xs font-display font-medium text-text-secondary">Store</label>
            <SelectDropdown
              value={storeId}
              onChange={setStoreId}
              options={[{ value: '', label: 'All stores' }, ...stores.map(s => ({ value: s.id, label: s.name }))]}
              aria-label="Filter by store"
            />
          </div>
        </div>
      </div>

      {active.isPending && <ListSkeleton />}

      {active.isError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-danger/10 text-danger text-sm font-display">
          <AlertCircle size={15} />
          <span className="flex-1">We couldn't load the history.</span>
          <button
            type="button"
            onClick={() => active.refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {!active.isPending && !active.isError && rows.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={tab === 'audits' ? 'No audits in this range' : 'No checklists in this range'}
          description="Try a wider date range or another store."
        />
      )}

      {tab === 'audits' && (
        <div className="flex flex-col gap-3">
          {(audits.data?.data ?? []).map(row => <AuditRowCard key={row.id} row={row} />)}
        </div>
      )}
      {tab === 'checklists' && (
        <div className="flex flex-col gap-3">
          {(checklists.data?.data ?? []).map(instance => (
            <ChecklistRow key={instance.id} instance={instance} storeName={storeNameById.get(instance.storeId) ?? 'Store'} />
          ))}
        </div>
      )}

      {!active.isPending && !active.isError && totalPages > 1 && (
        <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
};
