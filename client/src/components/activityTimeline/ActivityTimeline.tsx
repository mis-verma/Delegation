import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, ChevronDown, Bot, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAuditLogsQuery } from '../../features/admin/auditLog/hook';
import { actionConfig, entityTypeConfig, diffAuditLog, type AuditIdResolvers, type DiffRow } from '../../features/admin/auditLog/auditLogDisplay';
import { useAuditIdResolvers } from '../../features/admin/auditLog/useAuditIdResolvers';
import { AuditLogDiff } from '../../features/admin/auditLog/AuditLogDiff';
import { ROLE_LABEL } from '../../features/admin/roleBadge';
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

// How many field changes a row shows before "Show all" — enough to read what happened at a
// glance without one big edit pushing every other entry off screen.
const INLINE_DIFF_ROWS = 2;
const PAGE_STEP = 20;

const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const full = date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (date.toDateString() === today.toDateString()) return { lead: 'Today', full };
  if (date.toDateString() === yesterday.toDateString()) return { lead: 'Yesterday', full };
  return { lead: null, full };
};

const timeLabel = (date: Date) => date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

// Consecutive rows (already newest-first from the API) bucketed by calendar day.
const groupByDay = (rows: AuditLog[]) => {
  const groups: Array<{ key: string; date: Date; rows: AuditLog[] }> = [];
  for (const row of rows) {
    const date = new Date(row.createdAt);
    const key = date.toDateString();
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, date, rows: [row] });
  }
  return groups;
};

const actorFullName = (log: AuditLog) =>
  log.actor ? `${log.actor.firstName}${log.actor.lastName ? ` ${log.actor.lastName}` : ''}` : 'System';

// One plain sentence per entry so the rail reads without opening anything.
const summaryLine = (log: AuditLog, diffRows: DiffRow[]) => {
  const thing = entityTypeConfig(log.entityType).label.toLowerCase();
  if (log.action === 'CREATE') return `Created this ${thing}`;
  if (log.action === 'DELETE') return `Deleted this ${thing}`;
  if (diffRows.length === 0) return null;
  const names = diffRows.map((r) => r.label);
  if (names.length <= 3) return `Changed ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names[names.length - 1]}`;
  return `Changed ${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

/**
 * Per-entity "who changed what, when" — the compact counterpart to the org-wide Admin → Audit Log
 * browser (features/admin/auditLog/), reusing the same query hook and diff helpers rather than a
 * second implementation of either.
 *
 * Grouped by day, each entry shows the person's full name and role, the exact clock time (plus a
 * relative "2h ago"), a one-line summary, and the first couple of field changes inline — the rest
 * behind "Show all". Only the diff is boxed; the rail itself stays flat so a long history doesn't
 * turn into a wall of nested cards inside the detail panel.
 *
 * ADMIN/PC only, same as the underlying `/audit-logs` endpoint (audit rows carry full before/after
 * snapshots) — renders nothing at all for any other role.
 */
export const ActivityTimeline = ({ entityType, entityId, limit: initialLimit = PAGE_STEP }: ActivityTimelineProps) => {
  const { user } = useAuth();
  const canView = user?.role === 'ADMIN' || user?.role === 'PC';
  const [limit, setLimit] = useState(initialLimit);
  const { data, isPending, isError, isFetching } = useAuditLogsQuery(
    { entityType, entityId, limit },
    { enabled: canView, keepPrevious: true },
  );
  const resolvers = useAuditIdResolvers(canView);

  if (!canView) return null;

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? rows.length;
  const groups = groupByDay(rows);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-display font-medium sm:font-bold text-text-muted sm:text-text">
          <History size={14} className="text-text-light sm:text-primary-600 sm:dark:text-primary-400 sm:size-4" strokeWidth={2.5} />
          <span>Activity</span>
        </h3>
        {!isPending && !isError && total > 0 && (
          <span className="text-[11px] font-display font-semibold text-text-muted tabular-nums">
            {total} update{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isPending && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-7 rounded-full shrink-0" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && <p className="text-xs font-medium text-danger">Couldn't load activity history. Refresh to try again.</p>}

      {!isPending && !isError && rows.length === 0 && (
        <p className="text-xs text-text-muted">No changes recorded yet.</p>
      )}

      {!isPending && !isError && groups.map((group, groupIndex) => {
        const label = dayLabel(group.date);
        return (
          <section key={group.key} className="flex flex-col gap-2.5" aria-label={label.full}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-hover text-[11px] font-display font-semibold text-text-secondary">
                {label.lead && <span className="text-text">{label.lead}</span>}
                {label.lead && <span className="text-text-light" aria-hidden>·</span>}
                <span>{label.full}</span>
              </span>
              <span className="h-px flex-1 bg-border/70" aria-hidden />
            </div>

            <ol className="relative flex flex-col pl-6 before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-px before:bg-border">
              {group.rows.map((log, index) => (
                <ActivityTimelineRow
                  key={log.id}
                  log={log}
                  resolvers={resolvers}
                  isLatest={groupIndex === 0 && index === 0}
                />
              ))}
            </ol>
          </section>
        );
      })}

      {!isPending && !isError && rows.length < total && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE_STEP)}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-1.5 self-start min-h-9 px-3 rounded-lg border border-border text-xs font-display font-semibold text-text-secondary hover:border-border-hover hover:text-text disabled:opacity-60 disabled:cursor-wait transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} strokeWidth={2.5} />}
          Show older ({total - rows.length})
        </button>
      )}
    </div>
  );
};

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
  const fullName = actorFullName(log);
  const summary = summaryLine(log, diffRows);
  const date = new Date(log.createdAt);
  // CREATE/DELETE snapshots list every column — noise inline, so those stay behind the toggle.
  const inlineRows = log.action === 'CREATE' || log.action === 'DELETE' ? [] : diffRows.slice(0, INLINE_DIFF_ROWS);
  const hiddenCount = diffRows.length - inlineRows.length;

  return (
    <li className="relative pb-4 last:pb-0">
      <span
        className={`absolute -left-6 top-1.5 flex items-center justify-center size-[22px] rounded-full ring-4 ring-surface text-white ${action.tone}`}
        aria-hidden
      >
        <Icon size={11} strokeWidth={3} />
      </span>

      <div
        className={`flex flex-col gap-2 -mx-2 px-2 py-2 rounded-lg transition-colors duration-200 ${
          isLatest ? 'bg-primary-500/[0.06] dark:bg-primary-500/10' : 'hover:bg-surface-hover/60'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {log.actor ? (
              <span className={`flex items-center justify-center size-7 rounded-full text-white text-[11px] font-black shrink-0 ${avatarColorClass(log.actor.firstName)}`}>
                {log.actor.firstName[0]?.toUpperCase() ?? '?'}
              </span>
            ) : (
              <span className="flex items-center justify-center size-7 rounded-full bg-surface-hover text-text-muted shrink-0 ring-1 ring-border">
                <Bot size={13} strokeWidth={2.5} />
              </span>
            )}
            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="text-sm font-display font-bold text-text leading-snug">{fullName}</span>
                {log.actor && (
                  <span className="hidden sm:inline-flex px-1.5 py-px rounded border border-border text-[10px] font-display font-semibold text-text-muted">
                    {ROLE_LABEL[log.actor.role] ?? log.actor.role}
                  </span>
                )}
                <IconChip icon={Icon} tone={action.tone} label={action.label} />
              </div>
              {summary && <p className="text-xs font-display text-text-secondary leading-snug pt-0.5">{summary}</p>}
            </div>
          </div>

          <time
            dateTime={log.createdAt}
            title={date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
            className="flex flex-col items-end shrink-0 text-right"
          >
            <span className="inline-flex items-center gap-1 text-xs font-display font-bold text-text tabular-nums">
              <Clock size={11} strokeWidth={2.5} className="text-text-light" />
              {timeLabel(date)}
            </span>
            <span className="hidden sm:block text-[10px] font-display font-medium text-text-muted">{formatRelativeTime(log.createdAt)}</span>
          </time>
        </div>

        {inlineRows.length > 0 && (
          <div className="sm:ml-9">
            <AuditLogDiff rows={expanded ? diffRows : inlineRows} />
          </div>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 w-fit sm:ml-9 min-h-6 text-[11px] font-display font-bold text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : inlineRows.length ? `Show all ${diffRows.length} changes` : `See ${diffRows.length} field${diffRows.length === 1 ? '' : 's'}`}
            <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}

        {/* CREATE/DELETE: full snapshot only on request. */}
        <AnimatePresence initial={false}>
          {expanded && inlineRows.length === 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden sm:ml-9"
            >
              <AuditLogDiff rows={diffRows} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
};
