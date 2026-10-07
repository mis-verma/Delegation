import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowRightLeft, CalendarClock, Check, ChevronDown, Flag, History, Pencil, Plus, Undo2, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '../../api/http';
import { activityApi, type ActivityEntity, type ActivityEvent, type ActivityFeedData, type ActivityKind } from '../../api/activity';
import { Skeleton } from '../skeleton';
import { useNow } from '../../lib/useNow';

const PAGE = 8;

const KIND: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  created: { icon: Plus, tone: 'bg-primary-600 dark:bg-primary-500' },
  status: { icon: ArrowRightLeft, tone: 'bg-primary-600 dark:bg-primary-500' },
  approved: { icon: Check, tone: 'bg-success' },
  sent_back: { icon: Undo2, tone: 'bg-danger' },
  due_changed: { icon: CalendarClock, tone: 'bg-text-light' },
  priority_changed: { icon: Flag, tone: 'bg-text-light' },
  reassigned: { icon: UserRound, tone: 'bg-text-light' },
  edited: { icon: Pencil, tone: 'bg-text-light' },
};

const DAY = 86_400_000;

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

// "3d 4h", "5h 20m", "12m": the two biggest units, so a duration reads at a glance.
const duration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d${h ? ` ${h}h` : ''}`;
  if (h > 0) return `${h}h${m ? ` ${m}m` : ''}`;
  return `${Math.max(m, 1)}m`;
};

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

const Pill = ({ children, muted }: { children: string; muted?: boolean }) => (
  <span
    className={cn(
      'inline-flex min-w-0 max-w-[16rem] items-center truncate rounded-full border px-2.5 py-1 text-xs font-display font-semibold',
      muted ? 'border-border/60 bg-surface-hover/60 text-text-muted' : 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
    )}
  >
    <span className="truncate">{children}</span>
  </span>
);

const Detail = ({ e }: { e: ActivityEvent }) => {
  if (e.kind === 'due_changed' && e.from && e.to) {
    const delta = Math.round((new Date(e.to).getTime() - new Date(e.from).getTime()) / DAY);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill muted>{shortDate(e.from)}</Pill>
        <ArrowRight size={12} strokeWidth={2.75} className="shrink-0 text-text-light" aria-label="changed to" />
        <Pill>{shortDate(e.to)}</Pill>
        {delta !== 0 && <span className={cn('text-xs font-display font-semibold', delta > 0 ? 'text-warning' : 'text-success')}>{Math.abs(delta)} {Math.abs(delta) === 1 ? 'day' : 'days'} {delta > 0 ? 'later' : 'earlier'}</span>}
      </div>
    );
  }
  if (e.kind === 'due_changed' && e.to) return <Pill>{shortDate(e.to)}</Pill>;
  if (e.kind === 'priority_changed' && e.from) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill muted>{e.from}</Pill>
        <ArrowRight size={12} strokeWidth={2.75} className="shrink-0 text-text-light" aria-label="changed to" />
        <Pill>{e.to ?? ''}</Pill>
      </div>
    );
  }
  if (e.kind === 'reassigned' && e.from) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill muted>{e.from}</Pill>
        <ArrowRight size={12} strokeWidth={2.75} className="shrink-0 text-text-light" aria-label="changed to" />
        <Pill>{e.to ?? 'Nobody'}</Pill>
      </div>
    );
  }
  if (e.remark && (e.kind === 'status' || e.kind === 'sent_back')) {
    return <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-2.5 py-1.5 text-xs font-medium leading-relaxed text-text-secondary break-words">{e.remark}</p>;
  }
  return null;
};

const Row = ({ e, thing }: { e: ActivityEvent; thing: string }) => {
  const { icon: Icon, tone } = KIND[e.kind];
  const date = new Date(e.at);
  const initials = e.actor ? e.actor.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') : '';
  return (
    <li className="relative">
      <span className="absolute -left-11 top-2.5 flex size-8 items-center justify-center" aria-hidden>
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-500/15 text-xs font-display font-bold text-primary-700 ring-4 ring-surface dark:text-primary-300">{initials || '·'}</span>
        <span className={cn('absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-surface', tone)}>
          <Icon size={9} strokeWidth={3.5} />
        </span>
      </span>
      <article className="flex flex-col gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors duration-200 hover:border-border/70 hover:bg-surface-hover/40">
        <header className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-display leading-snug text-text-secondary">
            <span className="font-bold text-text">{e.actor?.name ?? 'System'}</span>
            {e.actor?.role && <span className="sr-only"> ({e.actor.role})</span>} {sentence(e, thing)}
          </p>
          <time dateTime={e.at} title={date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })} className="shrink-0 pt-0.5 text-xs font-display font-medium tabular-nums text-text-muted">
            {timeLabel(date)}
          </time>
        </header>
        <Detail e={e} />
      </article>
    </li>
  );
};

const Fact = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-3 py-2.5">
    <dt className="text-xs font-display font-medium text-text-muted">{label}</dt>
    <dd className="truncate text-sm font-display font-bold text-text">{value}</dd>
    {hint && <dd className="truncate text-xs font-medium text-text-muted">{hint}</dd>}
  </div>
);

const Summary = ({ data }: { data: ActivityFeedData }) => {
  const { summary } = data;
  const done = summary.status === 'done' || summary.status === 'CLOSED';
  const now = useNow();
  const status = summary.status.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const overdue = !done && !!summary.dueAt && new Date(summary.dueAt).getTime() < now;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      <Fact label="Created by" value={summary.createdBy ?? 'Unknown'} hint={shortDate(summary.createdAt)} />
      <Fact label="Status" value={status} hint={`${done ? 'Since' : 'For'} ${duration(now - new Date(summary.statusSince).getTime())}${done ? ' ago' : ''}`} />
      <Fact label={done ? 'Done by' : 'With'} value={summary.assignee ?? 'Nobody yet'} />
      <Fact label="Due" value={shortDate(summary.dueAt)} hint={overdue ? `Late by ${duration(now - new Date(summary.dueAt as string).getTime())}` : undefined} />
    </dl>
  );
};

/**
 * A plain history for the people who work on a delegation or ticket: who made it, who moved it, who
 * approved or sent it back, and when its due date, priority or assignee changed, with a one-glance
 * summary on top. It never shows descriptions, remarks on other fields or attachments. The server decides
 * who may read a record's history and answers 403 to everyone else, in which case nothing renders.
 */
export const ActivityFeed = ({ entityType, entityId }: { entityType: ActivityEntity; entityId: string }) => {
  const [shown, setShown] = useState(PAGE);
  const { data, isPending, error, isError } = useQuery({
    queryKey: ['activity', entityType, entityId],
    queryFn: () => activityApi.get(entityType, entityId),
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiError && (err.status === 403 || err.status === 404)) && count < 2,
  });
  const visible = useMemo(() => data?.events.slice(0, shown) ?? [], [data, shown]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (isError && error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
  const thing = entityType === 'Task' ? 'delegation' : 'ticket';

  return (
    <section className="flex flex-col gap-4" aria-label="Activity">
      <h3 className="flex items-center gap-2 text-sm font-display font-bold text-text">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 ring-1 ring-primary-500/20 dark:bg-primary-500/15 dark:text-primary-400">
          <History size={14} strokeWidth={2.5} />
        </span>
        Activity
        {data && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-hover px-1.5 text-xs font-display font-bold tabular-nums text-text-secondary">{data.events.length}</span>}
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

      {isError && !isPending && <p className="text-xs font-medium text-danger">Could not load the activity. Refresh to try again.</p>}

      {data && (
        <>
          <Summary data={data} />

          {groups.map((group) => {
            const label = dayLabel(group.date);
            return (
              <div key={group.key} className="flex flex-col gap-2" role="group" aria-label={label.full}>
                <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-surface px-1 py-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-text-secondary">
                    {label.lead && <span className="font-bold text-text">{label.lead}</span>}
                    {label.lead && <span className="text-text-light" aria-hidden>·</span>}
                    <span>{label.full}</span>
                  </span>
                  <span className="h-px flex-1 bg-border/70" aria-hidden />
                </div>
                <ol className="relative flex flex-col gap-1 pl-11 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-0.5 before:rounded-full before:bg-primary-500/40">
                  {group.events.map((e) => <Row key={e.id} e={e} thing={thing} />)}
                </ol>
              </div>
            );
          })}

          {data.events.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-full border border-border px-3 text-xs font-display font-semibold text-text-secondary outline-none transition-colors hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11"
            >
              <ChevronDown size={13} strokeWidth={2.5} />
              Show earlier ({data.events.length - shown})
            </button>
          )}
          {data.truncated && <p className="text-xs font-medium text-text-muted">Older history is not shown.</p>}
        </>
      )}
    </section>
  );
};
