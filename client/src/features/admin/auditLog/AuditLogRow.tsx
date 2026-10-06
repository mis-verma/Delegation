import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Button, IconChip, PANEL_CLASS, PriorityChip, RoleChip, StatusChip } from '../../../components';
import {
  entityTypeConfig, actionConfig, actionVerb, diffAuditLog, resolveEntityName, entityLink, buildFacts,
  snapshotStatus, snapshotPriority, formatClock, formatFullDateTime, formatRelative, SOURCE_CONFIG,
  type AuditIdResolvers,
} from './auditLogDisplay';
import type { AuditLog } from '../../../api/auditLogs';
import { AuditLogDiff, DiffChange, FactPill } from './AuditLogDiff';

// How many changed fields show directly in the row before the rest hide behind a toggle.
const INLINE_CHANGES = 3;

const LINK_CLASS = 'font-semibold text-primary-700 dark:text-primary-300 hover:underline underline-offset-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

export const AuditLogRow = memo(({ log, resolvers }: { log: AuditLog; resolvers?: AuditIdResolvers }) => {
  const [expanded, setExpanded] = useState(false);
  const entity = entityTypeConfig(log.entityType);
  const action = actionConfig(log.action);
  const rows = useMemo(() => diffAuditLog(log.before, log.after, resolvers), [log.before, log.after, resolvers]);
  const name = useMemo(() => resolveEntityName(log, rows), [log, rows]);
  const facts = useMemo(() => buildFacts(rows), [rows]);
  const status = snapshotStatus(log);
  const priority = snapshotPriority(log);
  const link = entityLink(log);

  // The name written down at the time wins, so an entry still reads right after the person is
  // renamed or removed. Older entries fall back to the account, then to "System".
  const actorName = log.actorName && log.source !== 'SYSTEM'
    ? log.actorName
    : log.actor ? [log.actor.firstName, log.actor.lastName].filter(Boolean).join(' ') : 'System';
  const source = log.source ? SOURCE_CONFIG[log.source] : undefined;
  const showSource = !!source && log.source !== 'APP';

  const isDelete = log.action === 'DELETE';
  // A record with only one side (a new record, or a one-way event like a password reset) has
  // nothing to compare, so it shows its key details instead of before -> after pairs.
  const isOneSided = !isDelete && (log.before === null || log.after === null);
  const isChangeKind = !isDelete && !isOneSided;

  const hiddenCount = isChangeKind ? rows.length - INLINE_CHANGES : rows.length - facts.length;
  const canExpand = hiddenCount > 0;
  const relative = formatRelative(log.createdAt);

  return (
    <article className={cn(PANEL_CLASS, 'flex items-start gap-3 p-3.5 transition-colors duration-200 hover:border-border-hover')}>
      <Avatar name={actorName} size="sm" className="shadow-none" />

      <div className="flex flex-col gap-2.5 min-w-0 flex-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
          <p className="min-w-0 text-sm font-display leading-snug text-text-secondary break-words">
            <span className="font-semibold text-text">{actorName}</span>{' '}
            {actionVerb(log.action)}{' '}
            <span className="font-medium text-text-muted">{entity.label}</span>{' '}
            {link ? (
              <Link to={link} className={LINK_CLASS} title="Open it">
                {name.isId ? name.text : `'${name.text}'`}
              </Link>
            ) : (
              <span className={cn('font-semibold text-text', name.isId && 'font-mono text-xs text-text-muted')} title={log.entityId}>
                {name.isId ? name.text : `'${name.text}'`}
              </span>
            )}
          </p>

          <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-text-muted tabular-nums" title={formatFullDateTime(log.createdAt)}>
            <time dateTime={log.createdAt} className="font-semibold text-text-secondary">{formatClock(log.createdAt)}</time>
            {relative && (
              <>
                <span aria-hidden>&middot;</span>
                <span>{relative}</span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <IconChip icon={entity.icon} label={entity.label} tone="bg-primary-600" />
          <IconChip icon={action.icon} label={action.label} tone={action.tone} />
          {log.actor && log.source !== 'SYSTEM' && <RoleChip role={log.actor.role} />}
          {showSource && source && <IconChip icon={source.icon} label={source.label} tone={source.tone} title={log.source === 'SYSTEM' ? 'Made by a scheduled job, not a person' : 'Made through WhatsApp'} />}
          {status && <StatusChip status={status} />}
          {priority && <PriorityChip meta={priority} />}
        </div>

        {isDelete && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 px-2 py-1.5 text-xs font-display font-semibold text-danger">
              <Trash2 size={12} aria-hidden />
              Removed
            </span>
          </div>
        )}

        {isOneSided && !expanded && facts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {facts.map((fact) => <FactPill key={fact.key} fact={fact} />)}
          </div>
        )}

        {isChangeKind && !expanded && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {rows.slice(0, INLINE_CHANGES).map((row) => <DiffChange key={row.key} row={row} />)}
          </div>
        )}

        {isChangeKind && rows.length === 0 && log.action === 'UPDATE' && (
          <p className="text-xs font-medium text-text-muted">No field changes were recorded for this entry.</p>
        )}

        {expanded && <AuditLogDiff rows={rows} />}

        {canExpand && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="min-h-11 sm:min-h-8 px-2.5 font-bold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200"
            >
              {expanded
                ? 'Show fewer'
                : isChangeKind ? `+${hiddenCount} more ${hiddenCount === 1 ? 'change' : 'changes'}` : `Show all ${rows.length} details`}
              {expanded ? <ChevronUp size={14} strokeWidth={2.5} aria-hidden /> : <ChevronDown size={14} strokeWidth={2.5} aria-hidden />}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
});
AuditLogRow.displayName = 'AuditLogRow';
