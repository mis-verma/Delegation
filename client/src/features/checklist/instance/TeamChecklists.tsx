import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CheckCheck, CircleDashed, ClipboardList, Clock3, Eye, Hourglass, Repeat, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, EmptyState, IconChip, InlineError, PageHeader, Skeleton, SlidingTabs, ToggleChip, type SlidingTabOption } from '../../../components';
import { StatusFigureStats, type StatusFigureItem } from '../../dashboard/StatusFigureStats';
import { RunVerificationChip } from './RunVerificationChip';
import { PANEL_CLASS } from '../../../components/entityCard';
import { useAuth } from '../../../context/AuthContext';
import { useNow } from '../../../lib/useNow';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { checklistInstanceApi, type ChecklistInstanceStatus } from '../../../api/checklistInstances';
import { useStoresQuery, useAssignableUsersQuery } from '../../tickets/hook';
import { useChecklistInstanceSummaryQuery } from '../hook';
import { RECURRENCE_LABEL, formatPeriodSpan, getInstanceView, todayPeriodBoundIso } from '../checklistDisplay';

type Tab = 'pending' | 'overdue' | 'completed' | 'all';
type Window = 'today' | 'month';

const TABS: readonly Tab[] = ['pending', 'overdue', 'completed', 'all'];
const PAGE_SIZE = 40;

const SERVER_STATUS: Record<Tab, ChecklistInstanceStatus | undefined> = {
  pending: 'OPEN',
  overdue: 'OVERDUE',
  completed: 'COMPLETED',
  all: undefined,
};

const isTab = (value: string | null): value is Tab => !!value && (TABS as readonly string[]).includes(value);

interface StateLook {
  tone: string;
  icon: LucideIcon;
  label: string;
}

const progressState = (done: number, total: number): StateLook => {
  if (total === 0) return { tone: 'bg-text-muted', icon: CircleDashed, label: 'No questions' };
  if (done >= total) return { tone: 'bg-success', icon: CheckCheck, label: 'Completed' };
  if (done === 0) return { tone: 'bg-text-muted', icon: CircleDashed, label: 'Not started' };
  return { tone: 'bg-primary-600', icon: Clock3, label: `In progress ${done}/${total}` };
};

const TAB_ITEMS: readonly StatusFigureItem<Tab>[] = [
  { key: 'pending', kind: 'pending', label: 'Pending', help: 'Checklists still open right now.' },
  { key: 'overdue', kind: 'late', label: 'Overdue', short: 'Late', help: 'Checklists that missed their deadline.' },
  { key: 'completed', kind: 'completed', label: 'Completed', short: 'Done', help: 'Checklists that are finished.' },
  { key: 'all', kind: 'total', label: 'All', help: 'Every checklist in this period.' },
];

const WINDOW_OPTIONS: readonly SlidingTabOption<Window>[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month', shortLabel: 'Month' },
];

const RowSkeleton = () => (
  <div className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
    <Skeleton className="size-10 shrink-0 rounded-xl" />
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-6 w-1/2 rounded-full" />
    </div>
    <Skeleton className="h-2 w-20 shrink-0 rounded-full max-sm:hidden" />
  </div>
);

const namesOf = (ids: readonly string[], names: Map<string, string>): string => {
  const known = ids.map((id) => names.get(id)).filter((n): n is string => !!n);
  if (known.length === 0) return ids.length === 0 ? 'Nobody assigned' : `${ids.length} ${ids.length === 1 ? 'person' : 'people'}`;
  const shown = known.slice(0, 2).join(', ');
  return known.length > 2 ? `${shown} +${known.length - 2}` : shown;
};

export const TeamChecklists = () => {
  const { user } = useAuth();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const requested = params.get('status');
  const tab: Tab = isTab(requested) ? requested : 'pending';
  const windowKey: Window = params.get('window') === 'month' ? 'month' : 'today';
  const storeId = params.get('store') ?? '';
  const onlyNotStarted = params.get('started') === '0';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const patch = (next: Record<string, string | null>) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === '') out.delete(key);
        else out.set(key, value);
      }
      return out;
    }, { replace: true });
    setPage(1);
  };

  const todayBound = todayPeriodBoundIso();
  const to = todayBound.slice(0, 10);
  const from = windowKey === 'today' ? to : `${to.slice(0, 8)}01`;

  const { data: stores } = useStoresQuery();
  const { data: people } = useAssignableUsersQuery();
  const storeNames = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s.name])), [stores]);
  const storeOptions = useMemo(() => (stores ?? []).filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })), [stores]);
  const peopleNames = useMemo(() => new Map((people ?? []).map((u) => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()])), [people]);

  const excludeOwn = user?.role === 'PC';
  const summary = useChecklistInstanceSummaryQuery({ scope: 'visible', storeId: storeId || undefined, from, to, excludeOwn }, { keepPrevious: true });
  const s = summary.data;

  const list = useQuery({
    queryKey: ['checklist-instances', 'team', { tab, storeId, from, to, page, excludeOwn }] as const,
    queryFn: () => checklistInstanceApi.list({ status: SERVER_STATUS[tab], storeId: storeId || undefined, from, to, page, limit: PAGE_SIZE, excludeOwn }),
    placeholderData: keepPreviousData,
    retry: handleQueryRetry,
    staleTime: 30_000,
  });
  const rows = list.data?.data;
  const totalPages = Math.max(1, list.data?.meta.totalPages ?? 1);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows ?? []).filter((instance) => {
      if (onlyNotStarted && instance.items.some((i) => i.isDone)) return false;
      if (!term) return true;
      const haystack = `${instance.title} ${storeNames.get(instance.storeId) ?? ''} ${namesOf(instance.assigneeIds, peopleNames)}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, onlyNotStarted, storeNames, peopleNames]);

  const tabCounts: Record<Tab, number> = { pending: s?.pending ?? 0, overdue: s?.missed ?? 0, completed: s?.completed ?? 0, all: s?.total ?? 0 };

  const role = user?.role;
  const scopeText = role === 'ADMIN' || role === 'PC' ? 'Every store and department' : 'Your department';

  return (
    <div className="mx-auto flex w-full max-w-(--container-width) flex-col gap-4 pt-2.5">
      <PageHeader
        icon={ClipboardList}
        title="Team checklists"
        subtitle={`${scopeText}. Includes checklists nobody has started yet.`}
        actions={
          <Link to="/checklists" viewTransition className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:min-h-9">
            My checklists
          </Link>
        }
      />

      <StatusFigureStats
        items={TAB_ITEMS}
        counts={tabCounts}
        active={tab}
        onToggle={(key) => patch({ status: key === 'pending' ? null : key })}
        isLoading={summary.isPending && !s}
        error={!s && summary.isError}
        onRetry={() => void summary.refetch()}
        label="Team checklist numbers"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex min-h-11 flex-1 items-center sm:max-w-sm">
          <span className="sr-only">Search checklists, stores or people</span>
          <Search className="pointer-events-none absolute left-3 size-4 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checklist, store or person"
            className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-muted focus:border-primary-600 focus:ring-2 focus:ring-primary-500/30 pointer-fine:h-9"
          />
        </label>
        <div className="sm:w-56">
          <Combobox value={storeId} onChange={(v) => patch({ store: v || null })} options={storeOptions} emptyOptionLabel="All stores" placeholder="All stores" />
        </div>
        <div className="flex items-center gap-2">
          <SlidingTabs
            label="Period"
            value={windowKey}
            options={WINDOW_OPTIONS}
            onChange={(key) => patch({ window: key === 'today' ? null : key })}
            size="sm"
            fill="phone"
            className="max-sm:min-w-0 max-sm:flex-1"
          />
          <ToggleChip on={onlyNotStarted} onClick={() => patch({ started: onlyNotStarted ? null : '0' })} className="min-h-11 shrink-0 gap-1.5 rounded-full font-semibold sm:min-h-9">
            <CircleDashed className="size-3.5" aria-hidden="true" />
            Not started
          </ToggleChip>
        </div>
      </div>

      <section aria-label="Checklists" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
        {list.isError && !rows ? (
          <div className="p-4"><InlineError message="Couldn't load the checklists." onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="flex flex-col divide-y divide-border/60">{Array.from({ length: 5 }, (_, i) => <RowSkeleton key={i} />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={search || onlyNotStarted || storeId ? 'No checklists match' : tab === 'pending' ? 'Nothing pending' : 'Nothing here'}
            description={search || onlyNotStarted || storeId ? 'Try clearing a filter or the search.' : windowKey === 'today' ? 'Try This month to see earlier runs.' : 'No checklists in this period.'}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {visible.map((instance) => {
              const view = getInstanceView(instance, now);
              const progress = progressState(view.done, view.total);
              const reviewed = instance.verificationStatus !== 'NOT_SUBMITTED' || view.isComplete;
              const store = storeNames.get(instance.storeId);
              const late = view.overdue && !view.isComplete;
              return (
                <li key={instance.id} className="relative">
                  <span className={cn('absolute inset-y-2.5 left-0 w-1 rounded-r-full', late ? 'bg-vivid-red' : view.isComplete ? 'bg-vivid-green' : 'bg-primary-600 dark:bg-primary-400')} aria-hidden="true" />
                  <Link
                    to={`/checklists/${instance.id}`}
                    viewTransition
                    className="group flex min-h-16 items-center gap-3 py-3 pl-4 pr-4 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover active:bg-surface-hover sm:pl-5 sm:pr-5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-700 dark:text-primary-300">
                      <ClipboardList className="size-5" strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="line-clamp-2 leading-snug t-card font-display font-semibold text-text">{instance.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <IconChip icon={progress.icon} tone={progress.tone} label={progress.label} />
                        {late && <IconChip icon={Hourglass} tone="bg-danger" label="Overdue" labelClassName="text-danger" />}
                        {reviewed && <RunVerificationChip instance={instance} />}
                        <IconChip icon={Repeat} tone="bg-primary-700" label={`${RECURRENCE_LABEL[instance.recurrence]}, ${formatPeriodSpan(instance, true)}`} className="max-sm:hidden" />
                      </span>
                      <span className="line-clamp-1 t-meta font-medium text-text-muted">
                        {[store, namesOf(instance.assigneeIds, peopleNames)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex w-24 shrink-0 flex-col items-end gap-1 max-sm:hidden">
                      <span className="t-meta font-display font-bold tabular-nums text-text">{view.progress}%</span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-border/60" aria-hidden="true">
                        <span className={cn('block h-full rounded-full', late ? 'bg-vivid-red' : view.isComplete ? 'bg-vivid-green' : 'bg-primary-600 dark:bg-primary-400')} style={{ width: `${Math.max(0, Math.min(100, view.progress))}%` }} />
                      </span>
                    </span>
                    <Eye className="size-4 shrink-0 text-text-light" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 sm:px-5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-40 pointer-fine:min-h-9"
            >
              Previous
            </button>
            <span className="t-meta font-semibold tabular-nums text-text-muted">Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default disabled:opacity-40 pointer-fine:min-h-9"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
