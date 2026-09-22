import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, ChevronDown, Bot } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAuditLogsQuery } from '../../features/admin/auditLog/hook';
import { actionConfig, diffAuditLog, type AuditIdResolvers } from '../../features/admin/auditLog/auditLogDisplay';
import { useAuditIdResolvers } from '../../features/admin/auditLog/useAuditIdResolvers';
import { AuditLogDiff } from '../../features/admin/auditLog/AuditLogDiff';
import { IconChip } from '../iconChip';
import { avatarColorClass } from '../../lib/avatarColors';
import { formatRelativeTime } from '../../features/dashboard/dashboardDisplay';
import { Skeleton } from '../skeleton';
import type { AuditEntityType, AuditLog } from '../../api/auditLogs';

interface ActivityTimelineProps {
  entityType: AuditEntityType;
  entityId: string;
  limit?: number;
}

/**
 * Per-entity "who changed what, when" — the compact counterpart to the org-wide Admin → Audit Log
 * browser (features/admin/auditLog/), reusing the same query hook and diff helpers rather than a
 * second implementation of either. Embedded inside an entity's own detail view (Ticket, Task, …)
 * instead of a standalone page, so it drops the entityType chip the admin page needs (redundant
 * here — the whole section is already scoped to one entity).
 *
 * Deliberately flat, not a card-per-entry — this section already lives inside the detail panel's
 * own bordered scroll area, and boxing every single row on top of that reads as a wall of nested
 * boxes once there are more than 3-4 entries. A plain rail with generous spacing and a hover tint
 * scans faster for a quick "who touched this" glance, while the one thing that IS a bounded
 * surface — the expanded field diff — stays visually distinct because it's the only box on the
 * rail, not one box among many.
 *
 * ADMIN/PC only, same as the underlying `/audit-logs` endpoint (audit rows carry full before/after
 * snapshots of a record, which is a wider view than what an assignee's own permissions elsewhere
 * imply) — renders nothing at all for any other role rather than a "you can't see this" notice, so
 * an ordinary agent's Ticket/Task detail view looks exactly as it always has.
 */
export const ActivityTimeline = ({ entityType, entityId, limit = 20 }: ActivityTimelineProps) => {
  const { user } = useAuth();
  const canView = user?.role === 'ADMIN' || user?.role === 'PC';
  const { data, isPending, isError } = useAuditLogsQuery({ entityType, entityId, limit }, { enabled: canView });
  const resolvers = useAuditIdResolvers(canView);

  if (!canView) return null;

  const rows = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-display font-bold text-text">
          <History size={16} className="text-primary-600 dark:text-primary-400" strokeWidth={2.5} />
          <span>Activity</span>
        </h3>
        {!isPending && !isError && rows.length > 0 && (
          <span className="text-[11px] font-bold text-text-muted tracking-wide">
            {rows.length} update{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isPending && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-6 rounded-full shrink-0" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="text-xs font-medium text-danger">Couldn't load activity history.</p>
      )}

      {!isPending && !isError && rows.length === 0 && (
        <p className="text-xs text-text-muted">No changes recorded yet.</p>
      )}

      {!isPending && !isError && rows.length > 0 && (
        <div className="relative pl-5 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {rows.map((log, index) => (
            <ActivityTimelineRow key={log.id} log={log} resolvers={resolvers} isLatest={index === 0} />
          ))}
        </div>
      )}
    </div>
  );
};

const actorInitials = (log: AuditLog) => (log.actor ? log.actor.firstName[0]?.toUpperCase() ?? '?' : null);

const ActivityTimelineRow = ({
  log,
  resolvers,
  isLatest,
}: {
  log: AuditLog;
  resolvers: AuditIdResolvers;
  isLatest: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const action = actionConfig(log.action);
  const Icon = action.icon;
  const diffRows = diffAuditLog(log.before, log.after, resolvers);
  const actorName = log.actor?.firstName;
  const initials = actorInitials(log);

  return (
    <div className="relative pb-4 last:pb-0">
      <span
        className={`absolute -left-[21px] top-1 flex items-center justify-center size-[18px] rounded-full ring-4 ring-background text-white shrink-0 transition-colors ${action.tone} ${
          isLatest ? 'shadow-[0_0_8px_color-mix(in_srgb,var(--color-primary-600)_45%,transparent)]' : ''
        }`}
      >
        <Icon size={10} strokeWidth={3} />
      </span>

      <div
        className={`flex flex-col gap-2 -mx-2 px-2 py-1.5 rounded-lg transition-colors ${
          isLatest ? 'bg-primary-500/[0.04]' : 'hover:bg-surface-hover/60'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            {actorName ? (
              <span className={`flex items-center justify-center size-6 rounded-full text-white text-[10px] font-black shrink-0 ${avatarColorClass(actorName)}`}>
                {initials}
              </span>
            ) : (
              <span className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-muted shrink-0 ring-1 ring-border">
                <Bot size={12} strokeWidth={2.5} />
              </span>
            )}
            <span className="text-sm font-bold text-text truncate">{log.actor ? log.actor.firstName : 'System'}</span>
            <IconChip icon={Icon} tone={action.tone} label={action.label} />
          </div>

          <span className="text-[11px] text-text-muted font-semibold tracking-wide shrink-0" title={new Date(log.createdAt).toLocaleString()}>
            {formatRelativeTime(log.createdAt)}
          </span>
        </div>

        {diffRows.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 w-fit ml-8 text-[11px] font-bold text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 hover:underline underline-offset-2 decoration-primary-500/40 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide details' : `${diffRows.length} field${diffRows.length === 1 ? '' : 's'} changed`}
            <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="ml-8">
                <AuditLogDiff rows={diffRows} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
