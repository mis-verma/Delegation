import { useState } from 'react';
import { History, AlertCircle } from 'lucide-react';
import { PageNav, EmptyState, GradientIconTile, Skeleton } from '../../../components';
import { useAuditLogsQuery } from './hook';
import { useUsersQuery } from '../hook';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogRow } from './AuditLogRow';
import { useAuditIdResolvers } from './useAuditIdResolvers';
import type { AuditLogFilter } from '../../../api/auditLogs';

export const AuditLogPage = () => {
  const [filter, setFilter] = useState<AuditLogFilter>({ page: 1, limit: 30 });
  const { data, isPending, isError } = useAuditLogsQuery(filter);
  const { data: users } = useUsersQuery();
  const resolvers = useAuditIdResolvers(true);

  const patchFilter = (patch: Partial<AuditLogFilter>) =>
    setFilter((prev) => ({ ...prev, ...patch, page: 1 }));

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={History} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Audit Log</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Every change recorded across the app — who did what, and when.
          </p>
        </div>
      </div>

      <AuditLogFilters filter={filter} onChange={patchFilter} users={users} />

      {isError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger font-display">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load the audit log. Please check your connection and try again.
        </div>
      )}

      {isPending && (
        // Row-shaped, matching AuditLogRow's own card layout — the same "skeleton mirrors the
        // real layout" convention list pages use elsewhere (e.g. TicketList's TicketListSkeleton)
        // rather than a generic centered spinner.
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
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
        />
      )}

      {!isPending && !isError && !!data?.data.length && (
        <>
          <div className="flex flex-col gap-2.5">
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
