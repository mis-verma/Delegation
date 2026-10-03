import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Button, IconChip, PANEL_CLASS } from '../../../components';
import { entityTypeConfig, actionConfig, diffAuditLog, type AuditIdResolvers } from './auditLogDisplay';
import type { AuditLog } from '../../../api/auditLogs';
import { AuditLogDiff } from './AuditLogDiff';

// Hoisted: one formatter for every row instead of a new Intl object per row per render.
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const formatTimestamp = (iso: string) => TIMESTAMP_FORMAT.format(new Date(iso));

export const AuditLogRow = memo(({ log, resolvers }: { log: AuditLog; resolvers?: AuditIdResolvers }) => {
  const [expanded, setExpanded] = useState(false);
  const entity = entityTypeConfig(log.entityType);
  const action = actionConfig(log.action);
  const rows = useMemo(() => diffAuditLog(log.before, log.after, resolvers), [log.before, log.after, resolvers]);

  // The name written down at the time wins, so an entry still reads right after the person is
  // renamed or removed. Older entries fall back to the account, then to "System".
  const actorName = log.actorName && log.source !== 'SYSTEM' ? log.actorName : log.actor ? [log.actor.firstName, log.actor.lastName].filter(Boolean).join(' ') : 'System';
  const sourceLabel = log.source === 'WHATSAPP' ? 'via WhatsApp' : log.source === 'SYSTEM' && log.actor ? 'automatic' : null;

  return (
    <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3.5 transition-colors hover:border-border-hover')}>
      <div className="flex flex-wrap items-center gap-2">
        <IconChip icon={entity.icon} label={entity.label} tone="bg-primary-600" />
        <IconChip icon={action.icon} label={action.label} tone={action.tone} />

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
          <Avatar name={actorName} size="sm" className="size-6 text-[10px] shadow-none" />
          {actorName}
          {sourceLabel && <span className="font-medium text-text-muted">{sourceLabel}</span>}
        </span>

        <span className="ml-auto text-[11px] font-semibold text-text-muted tabular-nums">
          {formatTimestamp(log.createdAt)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono font-medium text-text-light truncate" title={log.entityId}>
          {log.entityId}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="shrink-0 font-bold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200"
        >
          {expanded ? 'Hide changes' : `View changes${rows.length ? ` (${rows.length})` : ''}`}
          {expanded ? <ChevronUp size={14} strokeWidth={2.5} aria-hidden /> : <ChevronDown size={14} strokeWidth={2.5} aria-hidden />}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 pt-3">
          <AuditLogDiff rows={rows} />
        </div>
      )}
    </div>
  );
});
AuditLogRow.displayName = 'AuditLogRow';
