import { memo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarX2, CheckCheck, ChevronRight, ClipboardX, Hourglass, Repeat, Siren, TicketX, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError } from '../../api/http';
import type { ExceptionItem, ExceptionKind } from '../../api/exceptions';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { Button, DueChip, IconChip, WaitChip } from '../../components';
import { useCanSeeExceptions, useExceptionTotalsQuery, useExceptionsQuery } from './useExceptionsQuery';
import { useAttentionPeople, useNow, useRemindMutation } from '../attention/useAttention';
import { AttentionPersonRow, AttentionRowSkeleton } from '../attention/AttentionParts';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { agoLabel, remindedRecently } from '../attention/attentionDisplay';
import { DashCardHeader, DashCardLink } from './DashCardHeader';
import { useCanOpen, useIsReadOnlyViewer } from '../owner/useReadOnlyViewer';

const KIND_LOOK: Record<ExceptionKind, { label: string; icon: LucideIcon }> = {
  TICKET_OVERDUE: { label: 'Ticket late', icon: TicketX },
  TICKET_STALE: { label: 'Ticket stuck', icon: Hourglass },
  TASK_OVERDUE: { label: 'Delegation late', icon: CalendarX2 },
  CHECKLIST_MISSED: { label: 'Checklist missed', icon: ClipboardX },
};

const KIND_LIST: Record<ExceptionKind, { href: string; label: string }> = {
  TICKET_OVERDUE: { href: '/tickets?quickFilter=delayed', label: 'Late tickets' },
  TICKET_STALE: { href: '/tickets?quickFilter=pending', label: 'Stuck tickets' },
  TASK_OVERDUE: { href: '/tasks?category=work&quickFilter=delayed', label: 'Late delegations' },
  CHECKLIST_MISSED: { href: '/checklists/history?tab=checklists&status=OVERDUE', label: 'Missed checklists' },
};

const KIND_ORDER: readonly ExceptionKind[] = ['TICKET_OVERDUE', 'TASK_OVERDUE', 'CHECKLIST_MISSED', 'TICKET_STALE'];

const PREVIEW_LIMIT = 4;
const PEOPLE_PREVIEW_LIMIT = 4;

const ROW_CLASS = 'group relative flex items-center gap-3 min-h-14 px-4 py-2.5 outline-none transition-colors duration-150';

const ExceptionRow = memo(({ item, now, linked }: { item: ExceptionItem; now: number; linked: boolean }) => {
  const high = item.severity === 'high';
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="line-clamp-2 t-card font-display font-semibold leading-snug text-text">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <IconChip icon={KIND_LOOK[item.kind].icon} tone={high ? 'bg-danger' : 'bg-warning'} label={KIND_LOOK[item.kind].label} labelClassName={high ? 'text-danger' : 'text-warning'} />
          {(item.kind === 'TICKET_OVERDUE' || item.kind === 'TASK_OVERDUE') && <DueChip at={item.since} now={now} />}
          {item.kind === 'TICKET_STALE' && <WaitChip since={item.since} now={now} warnAfterHours={24} dangerAfterHours={72} />}
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

interface ExceptionsCardProps {
  limit?: number;
  aside?: ReactNode;
}

export const ExceptionsCard = ({ limit = PREVIEW_LIMIT, aside }: ExceptionsCardProps = {}) => {
  const allowed = useCanSeeExceptions();
  const query = useExceptionsQuery();
  const totals = useExceptionTotalsQuery();
  const readOnly = useIsReadOnlyViewer();
  const canOpen = useCanOpen();

  const people = useAttentionPeople();
  const remind = useRemindMutation();
  const now = useNow();
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const unavailable = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
  if (!allowed || unavailable) return null;
  const peopleLimit = Math.min(limit, PEOPLE_PREVIEW_LIMIT);
  const peopleRows = people.data ?? [];
  const items = query.data ?? [];
  const visible = items.slice(0, limit);
  const alertTotal = totals.data ? Math.max(items.length, totals.data.tickets + totals.data.delegations + totals.data.missedRuns) : items.length;
  const remaining = Math.max(0, alertTotal - visible.length);
  const kindLinks = KIND_ORDER.filter((kind) => items.some((i) => i.kind === kind) && canOpen(KIND_LIST[kind].href)).map((kind) => KIND_LIST[kind]);
  const summaryParts = [
    alertTotal > 0 && `${alertTotal} ${alertTotal === 1 ? 'alert' : 'alerts'}`,
    peopleRows.length > 0 && `${peopleRows.length} ${peopleRows.length === 1 ? 'person' : 'people'}`,
  ].filter(Boolean);
  const redPeople = peopleRows.filter((p) => p.level === 'red');
  const orangeCount = peopleRows.length - redPeople.length;
  const repeatCount = peopleRows.filter((p) => p.missedStreak >= 2).length;
  const redToRemind = readOnly ? [] : redPeople.filter((p) => !remindedRecently(p.lastRemindedAt, now)).map((p) => p.userId);
  const peopleFailed = people.isError && !people.data;
  const alertsFailed = query.isError && !query.data;
  const countFailed = (alertsFailed || peopleFailed) && !query.isPending && !people.isPending;
  const nothingAtAll = items.length === 0 && peopleRows.length === 0 && !people.isPending && !peopleFailed;
  const allTicketsHref = canOpen('/tickets') ? '/tickets' : null;
  const headerAside = countFailed || aside ? (
    <span className="flex items-center gap-2">
      {countFailed && (
        <span role="status" aria-label="Count not loaded" className="t-stat font-display font-bold tabular-nums text-text-muted">-</span>
      )}
      {aside}
    </span>
  ) : undefined;

  return (
    <section aria-labelledby="exceptions-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="exceptions-heading"
        title="Needs attention"
        count={countFailed ? null : alertTotal}
        countLabel={summaryParts.join(', ')}
        alert
        subtitle={summaryParts.length > 0 ? summaryParts.join(', ') : undefined}
        action={headerAside}
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
      ) : alertsFailed ? (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load alerts." onRetry={() => void query.refetch()} />
        </div>
      ) : nothingAtAll ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
          <p className="flex min-w-0 items-center gap-2 t-meta font-medium text-text-secondary">
            <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
            All clear. Nothing is late or stuck, and everyone is on track.
          </p>
          {allTicketsHref && <DashCardLink to={allTicketsHref}>Open tickets</DashCardLink>}
        </div>
      ) : items.length === 0 ? null : (
        <div className="flex flex-col divide-y divide-border/60">
          {visible.map((item) => <ExceptionRow key={item.id} item={item} now={now} linked={canOpen(item.link)} />)}
        </div>
      )}

      {remaining > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/60 px-4 py-2.5 sm:px-5">
          <p className="t-meta font-medium text-text-secondary tabular-nums">{remaining} more {remaining === 1 ? 'alert' : 'alerts'}. Open a full list:</p>
          {kindLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              {kindLinks.map((link) => <DashCardLink key={link.href} to={link.href}>{link.label}</DashCardLink>)}
            </div>
          )}
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
                className="h-11 shrink-0 pointer-fine:h-9"
                onClick={() => remind.mutate(redToRemind)}
                isLoading={remind.isPending}
                aria-label={`Send a reminder to the ${redToRemind.length} ${redToRemind.length === 1 ? 'person' : 'people'} who need you now`}
              >
                Send {redToRemind.length === 1 ? 'reminder' : `${redToRemind.length} reminders`}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2 sm:px-5">
            {redPeople.length > 0 && <IconChip icon={Siren} tone="bg-danger" label={`${redPeople.length} need you now`} labelClassName="text-danger" />}
            {orangeCount > 0 && <IconChip icon={TrendingDown} tone="bg-vivid-sky" label={`${orangeCount} falling behind`} labelClassName="text-vivid-sky-text" />}
            {repeatCount > 0 && <IconChip icon={Repeat} tone="bg-vivid-blue" label={`${repeatCount} repeat misses`} labelClassName="text-vivid-blue-text" />}
          </div>
          <div className="flex flex-col divide-y divide-border/60">
            {peopleRows.slice(0, peopleLimit).map((p) => (
              <AttentionPersonRow
                key={p.userId}
                person={p}
                onOpen={setOpenPerson}
                onRemind={readOnly ? undefined : (userId) => remind.mutate([userId])}
                reminding={remind.isPending}
                reminded={remindedRecently(p.lastRemindedAt, now)}
                minimal
              />
            ))}
          </div>
          {peopleRows.length > peopleLimit && (
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
