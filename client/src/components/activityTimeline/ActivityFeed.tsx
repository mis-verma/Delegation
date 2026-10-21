import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, ArrowRightLeft, Ban, CalendarClock, Check, ChevronDown, Flag, History, Pencil, Plus, RotateCcw, ShieldCheck, Undo2, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '../../api/http';
import type { Role } from '../../api/auth';
import { RoleChip } from '../roleChip';
import { CountBadge } from '../countBadge';
import { IconChip } from '../iconChip';
import { PriorityChip } from '../priorityChip';
import { StatusChip, getStatusChipMeta, type StatusChipStatus } from '../statusChip';
import { PRIORITY_CONFIG } from '../../features/tickets/ticketDisplay';
import { type ActivityEntity, type ActivityEvent, type ActivityKind } from '../../api/activity';
import { Skeleton } from '../skeleton';
import { activityQueryOptions } from './activityQuery';
import { ChangeCompare } from './ChangeCompare';
import { ENTRY_CLASS, HEADING_TILE_CLASS, NODE_CLASS, TONE, type ActivityTone } from './activityTones';

const PAGE = 8;

const KIND: Record<ActivityKind, { icon: LucideIcon; tone: ActivityTone }> = {
  created: { icon: Plus, tone: 'primary' },
  status: { icon: ArrowRightLeft, tone: 'info' },
  approved: { icon: Check, tone: 'success' },
  sent_back: { icon: Undo2, tone: 'danger' },
  due_changed: { icon: CalendarClock, tone: 'warning' },
  priority_changed: { icon: Flag, tone: 'coral' },
  reassigned: { icon: UserRound, tone: 'primary' },
  edited: { icon: Pencil, tone: 'muted' },
  progress: { icon: Activity, tone: 'warning' },
  head_approved: { icon: ShieldCheck, tone: 'success' },
  declined: { icon: Ban, tone: 'danger' },
  reopened: { icon: RotateCcw, tone: 'info' },
};

const DAY = 86_400_000;

const STATUS_ALIAS: Record<string, StatusChipStatus> = { done: 'completed', todo: 'open' };

const chipKey = (label: string | null | undefined): StatusChipStatus | null => {
  if (!label) return null;
  const key = label.trim().toLowerCase().replace(/s+/g, '_');
  const alias = STATUS_ALIAS[key];
  if (alias) return alias;
  return getStatusChipMeta(key as StatusChipStatus) ? (key as StatusChipStatus) : null;
};

const StatusStep = ({ from, to }: { from?: string | null; to: string }) => {
  const toKey = chipKey(to);
  if (!toKey) return null;
  const fromKey = chipKey(from);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fromKey && (
        <>
          <StatusChip status={fromKey} className="opacity-70" />
          <ArrowRight size={13} className="shrink-0 text-text-light" strokeWidth={2.5} aria-label="to" />
        </>
      )}
      <StatusChip status={toKey} />
    </div>
  );
};

const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const full = date
    .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) })
    .replace(/,/g, '');
  if (date.toDateString() === today.toDateString()) return { lead: 'Today', full };
  if (date.toDateString() === yesterday.toDateString()) return { lead: 'Yesterday', full };
  return { lead: null, full };
};

const timeLabel = (date: Date) => date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '') : 'No date';

const sentence = (e: ActivityEvent, thing: string) => {
  switch (e.kind) {
    case 'created': return `created this ${thing}`;
    case 'status': return `moved it to ${e.to}`;
    case 'approved': return `approved this ${thing}`;
    case 'sent_back': return e.to ? `sent it back to ${e.to}` : `sent this ${thing} back`;
    case 'due_changed': return e.to ? (e.from ? 'changed the due date' : 'set a due date') : 'removed the due date';
    case 'priority_changed': return `changed the priority to ${e.to}`;
    case 'reassigned': return e.to ? `assigned it to ${e.to}` : 'removed the assignee';
    case 'edited': return `edited the ${(e.fields ?? []).join(' and ')}`;
    case 'progress': return `posted a work update`;
    case 'head_approved': return `approved this ${thing} for the team`;
    case 'declined': return `declined this ${thing}`;
    case 'reopened': return `reopened this ${thing}`;
  }
};

const groupByDay = (events: ActivityEvent[]) => {
  const groups: { key: string; date: Date; events: ActivityEvent[] }[] = [];
  for (const e of events) {
    const date = new Date(e.at);
    const key = date.toDateString();
    const last = groups[groups.length - 1];
    if (last?.key === key) last.events.push(e);
    else groups.push({ key, date, events: [e] });
  }
  return groups;
};

const Detail = ({ e, entityType }: { e: ActivityEvent; entityType: ActivityEntity }) => {
  if (e.kind === 'progress') {
    return (
      <div className="flex flex-col gap-2">
        <IconChip icon={Activity} tone="bg-warning" label="Work update" className="w-fit border-warning/30 bg-warning/10" labelClassName="text-warning" />
        {e.remark && <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-2.5 py-1.5 t-meta font-medium leading-relaxed text-text-secondary break-words">{e.remark}</p>}
      </div>
    );
  }
  if (e.kind === 'head_approved') return <IconChip icon={ShieldCheck} tone="bg-success" label="Approved by head" className="w-fit border-success/30 bg-success/10" labelClassName="text-success" />;
  if (e.kind === 'reopened') return <IconChip icon={RotateCcw} tone="bg-info" label="Reopened" className="w-fit border-info/30 bg-info/10" labelClassName="text-info" />;
  if (e.kind === 'declined') {
    return (
      <div className="flex flex-col gap-2">
        <StatusChip status="declined" className="w-fit" />
        {e.remark && <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-2.5 py-1.5 t-meta font-medium leading-relaxed text-text-secondary break-words">{e.remark}</p>}
      </div>
    );
  }
  if ((e.kind === 'status' || e.kind === 'sent_back') && e.to && chipKey(e.to)) {
    return (
      <div className="flex flex-col gap-2">
        <StatusStep from={e.from} to={e.to} />
        {e.remark && <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-2.5 py-1.5 t-meta font-medium leading-relaxed text-text-secondary break-words">{e.remark}</p>}
      </div>
    );
  }
  if (e.kind === 'approved' && e.to && chipKey(e.to)) return <StatusStep from={e.from} to={e.to} />;
  if (e.kind === 'priority_changed' && e.to && entityType === 'Ticket') {
    const meta = PRIORITY_CONFIG[e.to.toUpperCase() as keyof typeof PRIORITY_CONFIG];
    if (meta) {
      const prev = e.from ? PRIORITY_CONFIG[e.from.toUpperCase() as keyof typeof PRIORITY_CONFIG] : undefined;
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {prev && (<><PriorityChip meta={prev} className="opacity-70" /><ArrowRight size={13} className="shrink-0 text-text-light" strokeWidth={2.5} aria-label="to" /></>)}
          <PriorityChip meta={meta} />
        </div>
      );
    }
  }
  if (e.kind === 'due_changed' && e.to) {
    const delta = e.from ? Math.round((new Date(e.to).getTime() - new Date(e.from).getTime()) / DAY) : 0;
    const tone = delta > 0 ? 'warning' : delta < 0 ? 'success' : 'primary';
    return (
      <ChangeCompare
        icon={CalendarClock}
        tone={tone}
        from={e.from ? shortDate(e.from) : undefined}
        to={shortDate(e.to)}
        note={delta !== 0 ? `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'day' : 'days'} ${delta > 0 ? 'later' : 'earlier'}` : undefined}
        noteTone={tone}
      />
    );
  }
  if (e.kind === 'priority_changed' && e.to) return <ChangeCompare icon={Flag} tone="coral" from={e.from ?? undefined} to={e.to} />;
  if (e.kind === 'reassigned' && e.to) return <ChangeCompare icon={UserRound} tone="primary" from={e.from ?? undefined} to={e.to} />;
  if (e.remark && (e.kind === 'status' || e.kind === 'sent_back')) {
    return <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-2.5 py-1.5 t-meta font-medium leading-relaxed text-text-secondary break-words">{e.remark}</p>;
  }
  return null;
};

const Row = ({ e, thing, entityType }: { e: ActivityEvent; thing: string; entityType: ActivityEntity }) => {
  const { icon: Icon, tone } = KIND[e.kind];
  const date = new Date(e.at);
  return (
    <li className="relative">
      <span className={cn(NODE_CLASS, TONE[tone])} title={e.kind.replace('_', ' ')} aria-hidden>
        <Icon size={14} strokeWidth={2.5} />
      </span>

      <article className={ENTRY_CLASS}>
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-display leading-snug text-text-secondary">
            <span className="font-bold text-text">{e.actor?.name ?? 'System'}</span>
            {e.actor?.role && <RoleChip role={e.actor.role as Role} />}
            <span>{sentence(e, thing)}</span>
          </div>
          <time dateTime={e.at} title={date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })} className="shrink-0 pt-0.5 t-meta font-display font-medium tabular-nums text-text-muted">
            {timeLabel(date)}
          </time>
        </header>
        <Detail e={e} entityType={entityType} />
      </article>
    </li>
  );
};

export const ActivityFeed = ({ entityType, entityId }: { entityType: ActivityEntity; entityId: string }) => {
  const [shown, setShown] = useState(PAGE);
  const { data, isPending, error, isError } = useQuery({
    ...activityQueryOptions(entityType, entityId),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 403 || err.status === 404)) && count < 2,
  });
  const visible = useMemo(() => data?.events.slice(0, shown) ?? [], [data, shown]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (isError && error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
  const thing = entityType === 'Task' ? 'delegation' : 'ticket';

  return (
    <section className="flex flex-col gap-4" aria-label="Activity">
      <h3 className="flex items-center gap-2.5 t-card font-display font-bold text-text">
        <span className={HEADING_TILE_CLASS}>
          <History size={16} strokeWidth={2.5} />
        </span>
        Activity
        {data && <CountBadge count={data.events.length} max={99} label={`${data.events.length} events`} />}
      </h3>

      {isPending && (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading activity">
          <Skeleton className="h-16 w-full rounded-lg" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      )}

      {isError && !isPending && <p className="t-meta font-medium text-danger">Could not load the activity. Refresh to try again.</p>}

      {data && (
        <>
          {groups.map((group) => {
            const label = dayLabel(group.date);
            return (
              <div key={group.key} className="flex flex-col gap-2" role="group" aria-label={label.full}>
                <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-surface px-1 py-1">
                  <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
                    {label.lead && <span className="font-bold text-text">{label.lead}</span>}
                    {label.lead && <span className="text-text-light" aria-hidden>·</span>}
                    <span>{label.full}</span>
                  </span>
                  <span className="h-px flex-1 bg-border/70" aria-hidden />
                </div>
                <ol className="relative flex flex-col gap-1 pl-11 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-0.5 before:rounded-full before:bg-primary-500/40">
                  {group.events.map((e) => <Row key={e.id} e={e} thing={thing} entityType={entityType} />)}
                </ol>
              </div>
            );
          })}

          {data.events.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-full border border-border px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
            >
              <ChevronDown size={13} strokeWidth={2.5} />
              Show earlier ({data.events.length - shown})
            </button>
          )}
          {data.truncated && <p className="t-meta font-medium text-text-muted">Older history is not shown.</p>}
        </>
      )}
    </section>
  );
};
