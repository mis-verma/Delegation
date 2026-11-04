import { memo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/http';
import type { ExceptionItem, ExceptionKind } from '../../api/exceptions';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { Button, DueChip, StatusBadge, WaitChip } from '../../components';
import { useCanSeeExceptions, useExceptionsQuery } from './useExceptionsQuery';
import { useAttentionPeople, useNow, useRemindMutation } from '../attention/useAttention';
import { AttentionPersonRow, AttentionRowSkeleton } from '../attention/AttentionParts';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { agoLabel, remindedRecently } from '../attention/attentionDisplay';
import { DashCardHeader, DashCardLink } from './DashCardHeader';

const KIND_LABEL: Record<ExceptionKind, string> = {
  TICKET_OVERDUE: 'Ticket late',
  TICKET_STALE: 'Ticket stuck',
  TASK_OVERDUE: 'Delegation late',
  CHECKLIST_MISSED: 'Checklist missed',
};

const KIND_HREF: Record<ExceptionKind, string> = {
  TICKET_OVERDUE: '/tickets',
  TICKET_STALE: '/tickets',
  TASK_OVERDUE: '/tasks',
  CHECKLIST_MISSED: '/checklists/history',
};

const PREVIEW_LIMIT = 4;
const PEOPLE_PREVIEW_LIMIT = 4;

const ROW_CLASS = 'group relative flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3 outline-none transition-colors duration-150';

const ExceptionRow = memo(({ item, now, linked }: { item: ExceptionItem; now: number; linked: boolean }) => {
  const high = item.severity === 'high';
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="line-clamp-2 text-sm font-display font-medium leading-snug text-text sm:font-semibold">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge variant={high ? 'critical' : 'warning'} icon={false} label={KIND_LABEL[item.kind]} />
          {(item.kind === 'TICKET_OVERDUE' || item.kind === 'TASK_OVERDUE') && <DueChip at={item.since} now={now} plain />}
          {item.kind === 'TICKET_STALE' && <WaitChip since={item.since} now={now} warnAfterHours={24} dangerAfterHours={72} plain />}
        </div>
        <p className="line-clamp-2 t-meta font-medium text-text-muted">
          {item.storeName ? `${item.storeName} · ` : ''}{item.detail}
        </p>
        {(item.kind === 'TICKET_OVERDUE' || item.kind === 'TASK_OVERDUE') && (
          <p className="line-clamp-1 t-meta font-display font-semibold text-text-secondary">
            {item.person ?? 'Nobody assigned'}
            <span className="font-medium text-text-muted">
              {item.remindedAt ? `, reminded ${agoLabel(item.remindedAt, now)}, still not done` : ', not reminded yet'}
            </span>
          </p>
        )}
      </div>
      {linked && <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </>
  );
  return linked ? (
    <Link to={item.link} viewTransition className={cn(ROW_CLASS, 'hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover')}>
      {body}
    </Link>
  ) : (
    <div className={ROW_CLASS}>{body}</div>
  );
});
ExceptionRow.displayName = 'ExceptionRow';

export const ExceptionsCard = () => {
  const { user } = useAuth();
  const allowed = useCanSeeExceptions();
  const query = useExceptionsQuery();

  const people = useAttentionPeople();
  const remind = useRemindMutation();
  const now = useNow();
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const unavailable = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
  if (!allowed || unavailable) return null;
  const linked = user?.role !== 'OWNER';
  const peopleRows = people.data ?? [];
  const items = query.data ?? [];
  const visible = items.slice(0, PREVIEW_LIMIT);
  const hiddenAlerts = items.slice(PREVIEW_LIMIT);
  const remaining = hiddenAlerts.length;
  const remainingHref = (() => {
    if (remaining === 0) return null;
    const tally = new Map<string, number>();
    for (const item of hiddenAlerts) {
      const href = KIND_HREF[item.kind];
      tally.set(href, (tally.get(href) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  })();
  const summaryParts = [
    items.length > 0 && `${items.length} ${items.length === 1 ? 'alert' : 'alerts'}`,
    peopleRows.length > 0 && `${peopleRows.length} ${peopleRows.length === 1 ? 'person' : 'people'}`,
  ].filter(Boolean);
  const redPeople = peopleRows.filter((p) => p.level === 'red');
  const orangeCount = peopleRows.length - redPeople.length;
  const repeatCount = peopleRows.filter((p) => p.missedStreak >= 2).length;
  const redToRemind = redPeople.filter((p) => !remindedRecently(p.lastRemindedAt, now)).map((p) => p.userId);
  const peopleFailed = people.isError && !people.data;
  const nothingAtAll = items.length === 0 && peopleRows.length === 0 && !people.isPending && !peopleFailed;

  return (
    <section aria-labelledby="exceptions-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="exceptions-heading"
        title="Needs attention"
        count={items.length + peopleRows.length}
        countLabel={summaryParts.join(', ')}
        alert
        subtitle={summaryParts.length > 0 ? summaryParts.join(', ') : undefined}
      />

      {query.isPending ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading alerts">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 px-4 py-3 sm:px-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : query.isError && !query.data ? (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load alerts." onRetry={() => void query.refetch()} />
        </div>
      ) : nothingAtAll ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
          <p className="flex min-w-0 items-center gap-2 t-meta font-medium text-text-secondary">
            <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
            All clear. Nothing is late or stuck, and everyone is on track.
          </p>
          {linked && <DashCardLink to="/tickets">Open tickets</DashCardLink>}
        </div>
      ) : items.length === 0 ? null : (
        <div className="flex flex-col divide-y divide-border/60">
          {visible.map((item) => <ExceptionRow key={item.id} item={item} now={now} linked={linked} />)}
        </div>
      )}

      {remaining > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 sm:px-5">
          <p className="t-meta font-medium text-text-secondary tabular-nums">{remaining} more {remaining === 1 ? 'alert' : 'alerts'}</p>
          {linked && remainingHref && <DashCardLink to={remainingHref} label={`Open the full list, ${remaining} more ${remaining === 1 ? 'alert' : 'alerts'}`}>Open all</DashCardLink>}
        </div>
      )}

      {peopleFailed && !query.isPending ? (
        <div className="border-t border-border/60 px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load the people to chase." onRetry={() => void people.refetch()} />
        </div>
      ) : people.isPending && !query.isPending ? (
        <div className="flex flex-col divide-y divide-border/60 border-t border-border/60" role="status" aria-label="Loading people">
          <AttentionRowSkeleton />
          <AttentionRowSkeleton />
        </div>
      ) : peopleRows.length > 0 ? (
        <div className="flex flex-col border-t border-border/60">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 sm:px-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
                People to chase
                <span className="t-meta font-semibold tabular-nums text-text-muted">{peopleRows.length}</span>
              </h3>
              <p className="t-meta font-medium text-text-muted">Updated {agoLabel(new Date(people.dataUpdatedAt || now).toISOString(), now)}</p>
            </div>
            {redToRemind.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 max-sm:hidden pointer-coarse:h-11"
                onClick={() => remind.mutate(redToRemind)}
                isLoading={remind.isPending}
                aria-label={`Send a reminder to the ${redToRemind.length} ${redToRemind.length === 1 ? 'person' : 'people'} who need you now`}
              >
                Send {redToRemind.length === 1 ? 'reminder' : `${redToRemind.length} reminders`}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2 sm:px-5">
            {redPeople.length > 0 && <StatusBadge variant="critical" icon={false} label={`${redPeople.length} need you now`} />}
            {orangeCount > 0 && <StatusBadge variant="warning" icon={false} label={`${orangeCount} falling behind`} />}
            {repeatCount > 0 && <StatusBadge variant="neutral" icon={false} label={`${repeatCount} repeat misses`} />}
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {peopleRows.slice(0, PEOPLE_PREVIEW_LIMIT).map((p) => (
              <AttentionPersonRow
                key={p.userId}
                person={p}
                onOpen={setOpenPerson}
                onRemind={(userId) => remind.mutate([userId])}
                reminding={remind.isPending}
                reminded={remindedRecently(p.lastRemindedAt, now)}
                minimal
              />
            ))}
          </div>
          {peopleRows.length > PEOPLE_PREVIEW_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
            >
              See all {peopleRows.length} people
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : null}

      <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
      <AttentionAllSheet open={showAll} onClose={() => setShowAll(false)} people={peopleRows} onOpenPerson={setOpenPerson} />
    </section>
  );
};
