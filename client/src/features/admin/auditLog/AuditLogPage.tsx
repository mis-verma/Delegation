import { useCallback, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageNav, EmptyState, InlineError, PageHeader, PANEL_CLASS, Skeleton } from '../../../components';
import { useAuditLogsQuery } from './hook';
import { useUsersQuery } from '../hook';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogRow } from './AuditLogRow';
import { useAuditIdResolvers } from './useAuditIdResolvers';
import { dayKey, dayHeading, countActiveFilters } from './auditLogDisplay';
import type { AuditGroup, AuditLog, AuditLogFilter } from '../../../api/auditLogs';

const TABS: { value: AuditGroup | ''; label: string }[] = [
  { value: '', label: 'Everything' },
  { value: 'checklists', label: 'Checklists' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'tasks', label: 'Delegations' },
  { value: 'people', label: 'People' },
  { value: 'settings', label: 'Settings' },
];

// Radix tab values can't usefully be empty, so "Everything" travels as 'all' and maps back here.
const ALL = 'all';

type DayGroup = { key: string; heading: string; logs: AuditLog[] };

// Rows arrive newest first, so a new group starts whenever the calendar day changes.
const groupByDay = (logs: AuditLog[]): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const log of logs) {
    const key = dayKey(log.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.logs.push(log);
    else groups.push({ key, heading: dayHeading(log.createdAt), logs: [log] });
  }
  return groups;
};

// Mirrors AuditLogRow: avatar, a one-line sentence, a chip row and a couple of change pills.
const RowSkeleton = () => (
  <div className="flex items-stretch gap-3">
    <Skeleton className="size-8 rounded-full shrink-0 mt-3" />
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-2.5 flex-1 min-w-0 p-3.5')}>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-3/4 max-w-md" />
        <Skeleton className="h-4 w-20 shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
    </div>
  </div>
);

export const AuditLogPage = () => {
  const [filter, setFilter] = useState<AuditLogFilter>({ page: 1, limit: 30 });
  // keepPrevious: paging or filtering keeps the old rows on screen (dimmed) instead of flashing skeletons.
  const { data, isPending, isError, isFetching, refetch } = useAuditLogsQuery(filter, { keepPrevious: true });
  const { data: users } = useUsersQuery();
  const resolvers = useAuditIdResolvers(true);

  const patchFilter = useCallback((patch: Partial<AuditLogFilter>) =>
    setFilter((prev) => ({ ...prev, ...patch, page: 1 })), []);

  // Clears the panel's filters but stays on the current section tab.
  const clearPanelFilters = useCallback(() =>
    setFilter((prev) => ({ page: 1, limit: prev.limit, group: prev.group })), []);

  const groups = useMemo(() => groupByDay(data?.data ?? []), [data?.data]);
  const hasFilters = countActiveFilters(filter) > 0 || !!filter.group;
  const shown = data?.data.length ?? 0;

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        icon={History}
        title="Audit Log"
        subtitle="Every change recorded across the app: who did what, and when."
      />

      <div className="flex flex-col gap-2">
        {/* Scrolls sideways on a narrow screen rather than wrapping the tab strip into two rows. */}
        <div className="overflow-x-auto">
          <Tabs
            value={filter.group || ALL}
            onValueChange={(value) => patchFilter({ group: value === ALL ? undefined : (value as AuditGroup), entityType: undefined })}
          >
            <TabsList aria-label="Section" className="max-w-none">
              {TABS.map(tab => (
                <TabsTrigger key={tab.value || ALL} value={tab.value || ALL} className="shrink-0 min-h-11 sm:min-h-8">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {data && (
          <p className="text-xs font-display font-medium text-text-muted tabular-nums" aria-live="polite">
            {shown} of {data.meta.total} {data.meta.total === 1 ? 'change' : 'changes'}
          </p>
        )}
      </div>

      <AuditLogFilters filter={filter} onChange={patchFilter} onClearAll={clearPanelFilters} users={users} />

      {isError && <InlineError message="We couldn't load the audit log. Check your connection and try again." onRetry={() => refetch()} />}

      {isPending && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      )}

      {!isPending && !isError && shown === 0 && (
        <EmptyState
          icon={History}
          title="Nothing recorded here yet"
          description="No changes match what you picked. Try another section, person or date range."
          action={hasFilters
            ? { label: 'Clear filters', onClick: () => setFilter({ page: 1, limit: filter.limit }) }
            : undefined}
        />
      )}

      {!isPending && !isError && shown > 0 && data && (
        <>
          <div className={cn('flex flex-col gap-6 transition-opacity duration-200', isFetching && 'opacity-60')} aria-busy={isFetching}>
            {groups.map((group) => (
              <section key={group.key} aria-label={group.heading} className="flex flex-col gap-3">
                <h2 className="sticky top-0 z-10 -mx-1 px-1 py-1 w-fit">
                  <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-border bg-surface text-xs font-display font-bold text-text-secondary">
                    <span aria-hidden className="size-1.5 rounded-full bg-primary-500" />
                    {group.heading}
                    <span className="tabular-nums font-semibold text-text-muted">{group.logs.length}</span>
                  </span>
                </h2>
                <div className="flex flex-col">
                  {group.logs.map((log) => (
                    <AuditLogRow key={log.id} log={log} resolvers={resolvers} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <PageNav
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={(page) => setFilter((prev) => ({ ...prev, page }))}
          />
        </>
      )}
    </div>
  );
};
