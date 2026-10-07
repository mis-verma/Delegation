import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, ChevronDown, Bot, Loader2, ArrowRight, ArrowRightLeft, PencilLine, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAuditLogsQuery } from '../../features/admin/auditLog/hook';
import { actionConfig, entityTypeConfig, diffAuditLog, type AuditIdResolvers, type DiffRow } from '../../features/admin/auditLog/auditLogDisplay';
import { useAuditIdResolvers } from '../../features/admin/auditLog/useAuditIdResolvers';
import { Skeleton } from '../skeleton';
import { ActivityValue } from './ActivityValue';
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
// Past this many characters a value reads as a sentence, not a chip.
const LONG_TEXT = 36;

type Filter = 'all' | 'status' | 'edits';

const FILTERS: Array<{ key: Filter; label: string; icon: LucideIcon }> = [
  { key: 'all', label: 'All', icon: Layers },
  { key: 'status', label: 'Status', icon: ArrowRightLeft },
  { key: 'edits', label: 'Edits', icon: PencilLine },
];

const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameYear = date.getFullYear() === today.getFullYear();
  const full = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).replace(/,/g, '');
  if (date.toDateString() === today.toDateString()) return { lead: 'Today', full };
  if (date.toDateString() === yesterday.toDateString()) return { lead: 'Yesterday', full };
  return { lead: null, full };
};

// Upper-case AM/PM, same as the due-date chips everywhere else ("3:27 PM").
const timeLabel = (date: Date) =>
  date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

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

const isStatusMove = (log: AuditLog) =>
  log.action !== 'CREATE' && log.action !== 'DELETE' && log.before?.status !== log.after?.status;

// What the person did, written to follow their name: "moved it to In progress", "changed due date and
// priority". A status move names where it went, so a long history reads without opening anything.
const phraseFor = (log: AuditLog, diffRows: DiffRow[]) => {
  const thing = entityTypeConfig(log.entityType).label.toLowerCase();
  if (log.action === 'CREATE') return `created this ${thing}`;
  if (log.action === 'DELETE') return `deleted this ${thing}`;
  if (log.action === 'VERIFY' || log.action === 'APPROVE') return `approved this ${thing}`;
  if (log.action === 'REJECT') return `sent this ${thing} back`;
  if (diffRows.length === 0) return `updated this ${thing}`;
  const statusRow = diffRows.find((r) => r.key === 'status');
  const others = diffRows.filter((r) => r.key !== 'status').map((r) => r.label.toLowerCase());
  const list = (names: string[]) =>
    names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  if (statusRow && others.length === 0) return `moved it to ${statusRow.after}`;
  if (statusRow) return `moved it to ${statusRow.after} and changed ${list(others)}`;
  return `changed ${list(others)}`;
};

// One meaning per colour on the rail badge: approvals green, send-backs and deletes red, moves and
// creation the app's blue, ordinary edits quiet grey. Everything else on the row stays neutral.
const badgeTone = (log: AuditLog) => {
  if (log.action === 'VERIFY' || log.action === 'APPROVE') return 'bg-success';
  if (log.action === 'REJECT' || log.action === 'DELETE') return 'bg-danger';
  if (log.action === 'CREATE' || isStatusMove(log)) return 'bg-primary-600 dark:bg-primary-500';
  return 'bg-text-light';
};

/**
 * Per-entity "who changed what, when" — the compact counterpart to the org-wide Admin → Audit Log
 * browser (features/admin/auditLog/), reusing the same query hook and diff helpers rather than a
 * second implementation of either.
 *
 * Grouped by day. Each entry: action dot on the rail, person + role, clock time, a verb-first
 * sentence, then the changed fields as from → to chips. Status and priority use the same chips the
 * card shows. All / Status / Edits narrows the loaded entries.
 *
 * ADMIN/PC only, same as the underlying `/audit-logs` endpoint (audit rows carry full before/after
 * snapshots) — renders nothing at all for any other role.
 */
export const ActivityTimeline = ({ entityType, entityId, limit: initialLimit = PAGE_STEP }: ActivityTimelineProps) => {
  const { user } = useAuth();
  const canView = user?.role === 'ADMIN' || user?.role === 'PC';
  const [limit, setLimit] = useState(initialLimit);
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isPending, isError, isFetching } = useAuditLogsQuery(
    { entityType, entityId, limit },
    { enabled: canView, keepPrevious: true },
  );
  const resolvers = useAuditIdResolvers(canView);

  if (!canView) return null;

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? rows.length;
  const counts: Record<Filter, number> = {
    all: rows.length,
    status: rows.filter(isStatusMove).length,
    edits: rows.filter((r) => !isStatusMove(r)).length,
  };
  const visible = filter === 'all' ? rows : rows.filter((r) => (filter === 'status' ? isStatusMove(r) : !isStatusMove(r)));
  const groups = groupByDay(visible);
  const ready = !isPending && !isError;

  return (
    <section className="flex flex-col gap-4" aria-label="Activity">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-display font-bold text-text">
          <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 dark:bg-primary-500/15 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20">
            <History size={14} strokeWidth={2.5} />
          </span>
          <span>Activity</span>
          {ready && total > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-surface-hover text-xs font-display font-bold text-text-secondary tabular-nums">
              {total}
            </span>
          )}
        </h3>

        {ready && rows.length > 1 && (
          <div role="tablist" aria-label="Filter activity" className="inline-flex items-center gap-0.5 p-0.5 rounded-full border border-border/60 bg-surface-hover/50">
            {FILTERS.map(({ key, label, icon: Icon }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-display font-semibold transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                    active ? 'bg-surface text-text ring-1 ring-border' : 'text-text-muted hover:text-text'
                  }`}
                >
                  <Icon size={12} strokeWidth={2.5} className={active ? 'text-primary-600 dark:text-primary-400' : ''} />
                  <span className={key === 'all' ? '' : 'hidden sm:inline'}>{label}</span>
                  {key === 'status' && counts.status > 0 && <span className="tabular-nums text-text-light">{counts.status}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && <p className="text-xs font-medium text-danger">Couldn't load activity. Refresh to try again.</p>}

      {ready && rows.length === 0 && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-lg border border-dashed border-border">
          <span className="flex items-center justify-center size-9 rounded-xl bg-surface-hover text-text-light shrink-0">
            <History size={16} strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-display font-semibold text-text">Nothing changed yet</p>
            <p className="text-xs text-text-muted">Status moves and edits will show up here, with who did it and when.</p>
          </div>
        </div>
      )}

      {ready && rows.length > 0 && visible.length === 0 && (
        <p className="text-xs text-text-muted">No {filter === 'status' ? 'status moves' : 'edits'} in the loaded history.</p>
      )}

      {ready && groups.map((group) => {
        const label = dayLabel(group.date);
        return (
          <div key={group.key} className="flex flex-col gap-3" role="group" aria-label={label.full}>
            <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-surface px-1 py-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-text-secondary">
                {label.lead && <span className="text-text font-bold">{label.lead}</span>}
                {label.lead && <span className="text-text-light" aria-hidden>·</span>}
                <span>{label.full}</span>
              </span>
              <span className="h-px flex-1 bg-border/70" aria-hidden />
            </div>

            <ol className="relative flex flex-col gap-1 pl-11 before:absolute before:left-4 before:top-5 before:bottom-5 before:w-px before:bg-border/80">
              {group.rows.map((log) => (
                <ActivityTimelineRow key={log.id} log={log} resolvers={resolvers} />
              ))}
            </ol>
          </div>
        );
      })}

      {ready && rows.length < total && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE_STEP)}
          disabled={isFetching}
          className="inline-flex items-center justify-center gap-1.5 self-start min-h-9 px-3 rounded-full border border-border text-xs font-display font-semibold text-text-secondary hover:border-border-hover hover:text-text disabled:opacity-60 disabled:cursor-wait transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} strokeWidth={2.5} />}
          Show older ({total - rows.length})
        </button>
      )}
    </section>
  );
};

const ChangeList = ({ log, rows }: { log: AuditLog; rows: DiffRow[] }) => (
  <ul className="flex flex-col gap-2">
    {rows.map((row) => {
      const beforeRaw = log.before?.[row.key];
      const afterRaw = log.after?.[row.key];
      const wasEmpty = row.before === '—';
      // Sentences (description, remarks) don't fit a pill — they wrap into a lopsided pair with a
      // stray arrow. Show old one quiet and struck-free above, new one in a soft block.
      if (row.before.length > LONG_TEXT || row.after.length > LONG_TEXT) {
        return (
          <li key={row.key} className="flex flex-col sm:flex-row gap-1.5 sm:gap-3 min-w-0">
            <span className="text-xs font-display font-semibold text-text-muted sm:w-24 shrink-0 truncate" title={row.label}>
              {row.label}
            </span>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              {!wasEmpty && (
                <p className="text-xs text-text-muted line-clamp-2 break-words" title={row.before}>
                  <span className="font-display font-semibold text-text-light">Was: </span>
                  {row.before}
                </p>
              )}
              <p className="px-2.5 py-1.5 rounded-lg border border-primary-500/20 bg-primary-500/[0.06] dark:bg-primary-500/10 text-xs text-text line-clamp-3 break-words" title={row.after}>
                {row.after === '—' ? <span className="italic text-text-light">Cleared</span> : row.after}
              </p>
            </div>
          </li>
        );
      }
      return (
        <li key={row.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
          <span className="text-xs font-display font-semibold text-text-muted sm:w-24 shrink-0 truncate" title={row.label}>
            {row.label}
          </span>
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {!wasEmpty && (
              <>
                <ActivityValue entityType={log.entityType as AuditEntityType} field={row.key} raw={beforeRaw} text={row.before} side="before" />
                <ArrowRight size={12} strokeWidth={2.75} className="text-text-light shrink-0" aria-label="changed to" />
              </>
            )}
            <ActivityValue entityType={log.entityType as AuditEntityType} field={row.key} raw={afterRaw} text={row.after} side="after" />
          </div>
        </li>
      );
    })}
  </ul>
);

const ActivityTimelineRow = ({ log, resolvers }: { log: AuditLog; resolvers: AuditIdResolvers }) => {
  const [expanded, setExpanded] = useState(false);
  const action = actionConfig(log.action);
  // A status move gets its own glyph, so a long history scans as "moves vs. edits" before reading a word.
  const Icon = log.action === 'UPDATE' && isStatusMove(log) ? ArrowRightLeft : action.icon;
  const diffRows = diffAuditLog(log.before, log.after, resolvers);
  const fullName = actorFullName(log);
  const phrase = phraseFor(log, diffRows);
  const date = new Date(log.createdAt);
  const isSnapshot = log.action === 'CREATE' || log.action === 'DELETE';
  // Status first: it's the change people scan for.
  const ordered = [...diffRows].sort((a, b) => Number(b.key === 'status') - Number(a.key === 'status'));
  // CREATE/DELETE snapshots list every column, which is noise inline, so those stay behind the toggle.
  // A status-only move already says where it went in the sentence, so it needs no chips under it.
  const statusOnly = ordered.length === 1 && ordered[0].key === 'status';
  const inlineRows = isSnapshot || statusOnly ? [] : ordered.slice(0, INLINE_DIFF_ROWS);
  const hiddenCount = isSnapshot ? ordered.length : ordered.length - inlineRows.length;
  const shown = expanded ? ordered : inlineRows;

  return (
    <li className="relative">
      {/* The person sits on the rail, with one small glyph at its corner for what they did. */}
      <span className="absolute -left-11 top-2.5 flex size-8 items-center justify-center" aria-hidden>
        {log.actor ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-primary-500/15 text-xs font-display font-bold text-primary-700 ring-4 ring-surface dark:text-primary-300">
            {log.actor.firstName[0]?.toUpperCase() ?? '?'}
            {log.actor.lastName?.[0]?.toUpperCase() ?? ''}
          </span>
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-surface-hover text-text-muted ring-4 ring-surface">
            <Bot size={14} strokeWidth={2.5} />
          </span>
        )}
        <span className={`absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-surface ${badgeTone(log)}`} title={action.label}>
          <Icon size={9} strokeWidth={3.5} />
        </span>
      </span>

      <article className="flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors duration-200 hover:border-border/70 hover:bg-surface-hover/40">
        <header className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-display leading-snug text-text-secondary">
            <span className="font-bold text-text">{fullName}</span>
            {log.actor && <span className="sr-only"> ({log.actor.role})</span>}{' '}
            {phrase}
          </p>
          <time
            dateTime={log.createdAt}
            title={date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
            className="shrink-0 pt-0.5 text-xs font-display font-medium tabular-nums text-text-muted"
          >
            {timeLabel(date)}
          </time>
        </header>

        {!isSnapshot && shown.length > 0 && <ChangeList log={log} rows={shown} />}

        {/* CREATE/DELETE: full snapshot only on request. */}
        <AnimatePresence initial={false}>
          {isSnapshot && expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <ChangeList log={log} rows={ordered} />
            </motion.div>
          )}
        </AnimatePresence>

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-6 w-fit items-center gap-1 text-xs font-display font-bold text-primary-700 transition-colors duration-200 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 pointer-coarse:min-h-11"
            aria-expanded={expanded}
          >
            {expanded
              ? 'Show less'
              : inlineRows.length
                ? `Show all ${ordered.length} changes`
                : `See ${ordered.length} field${ordered.length === 1 ? '' : 's'}`}
            <ChevronDown size={12} strokeWidth={2.5} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </article>
    </li>
  );
};
