import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconChip } from '../../../components';
import { entityTypeConfig, actionConfig, diffAuditLog, type AuditIdResolvers } from './auditLogDisplay';
import type { AuditLog } from '../../../api/auditLogs';
import { AuditLogDiff } from './AuditLogDiff';

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const AuditLogRow = ({ log, resolvers }: { log: AuditLog; resolvers?: AuditIdResolvers }) => {
  const [expanded, setExpanded] = useState(false);
  const entity = entityTypeConfig(log.entityType);
  const action = actionConfig(log.action);
  const rows = diffAuditLog(log.before, log.after, resolvers);

  const actorInitials = log.actor
    ? `${log.actor.firstName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-hover">
      <div className="flex flex-wrap items-center gap-2">
        <IconChip icon={entity.icon} label={entity.label} tone="bg-primary-600" />
        <IconChip icon={action.icon} label={action.label} tone={action.tone} />

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <span className="flex items-center justify-center size-5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[9px] font-black shrink-0 ring-1 ring-primary-700/50">
            {actorInitials}
          </span>
          {log.actor ? log.actor.firstName : 'System'}
        </span>

        <span className="ml-auto text-[11px] font-semibold text-text-muted tabular-nums">
          {formatTimestamp(log.createdAt)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono font-medium text-text-light truncate" title={log.entityId}>
          {log.entityId}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary-700 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-lg px-2 py-1"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide changes' : `View changes${rows.length ? ` (${rows.length})` : ''}`}
          {expanded ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 pt-3">
          <AuditLogDiff rows={rows} />
        </div>
      )}
    </div>
  );
};
