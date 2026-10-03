import { useCallback, useState } from 'react';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageNav, EmptyState, InlineError, PageHeader, PANEL_CLASS, Skeleton } from '../../../components';
import { useAuditLogsQuery } from './hook';
import { useUsersQuery } from '../hook';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogRow } from './AuditLogRow';
import { useAuditIdResolvers } from './useAuditIdResolvers';
import type { AuditGroup, AuditLogFilter } from '../../../api/auditLogs';

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

export const AuditLogPage = () => {
  const [filter, setFilter] = useState<AuditLogFilter>({ page: 1, limit: 30 });
  // keepPrevious: paging or filtering keeps the old rows on screen (dimmed) instead of flashing skeletons.
  const { data, isPending, isError, isFetching, refetch } = useAuditLogsQuery(filter, { keepPrevious: true });
  const { data: users } = useUsersQuery();
  const resolvers = useAuditIdResolvers(true);

  const patchFilter = useCallback((patch: Partial<AuditLogFilter>) =>
    setFilter((prev) => ({ ...prev, ...patch, page: 1 })), []);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
      <PageHeader
        icon={History}
        title="Audit Log"
        subtitle="Every change recorded across the app: who did what, and when."
      />

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

      <AuditLogFilters filter={filter} onChange={patchFilter} users={users} />

      {isError && <InlineError message="We couldn't load the audit log. Check your connection and try again." onRetry={() => refetch()} />}

      {isPending && (
        // Row-shaped, matching AuditLogRow's own card layout (same "skeleton mirrors the real
        // layout" convention list pages use elsewhere) rather than a generic centered spinner.
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 min-h-24')}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-full ml-auto" />
              </div>
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      )}

      {!isPending && !isError && (data?.data.length ?? 0) === 0 && (
        <EmptyState
          icon={History}
          title="No history found"
          description="No changes match the current filters yet."
          action={filter.group || filter.entityType || filter.from || filter.to || filter.actorId || filter.action
            ? { label: 'Clear filters', onClick: () => setFilter({ page: 1, limit: filter.limit }) }
            : undefined}
        />
      )}

      {!isPending && !isError && !!data?.data.length && (
        <>
          <div className={cn('flex flex-col gap-2.5 transition-opacity duration-200', isFetching && 'opacity-60')} aria-busy={isFetching}>
            {data.data.map((log) => (
              <AuditLogRow key={log.id} log={log} resolvers={resolvers} />
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
