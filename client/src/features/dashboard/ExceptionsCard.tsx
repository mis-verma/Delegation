import { memo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, BellRing, CheckCheck, ChevronDown, ChevronRight, ClipboardX, Repeat, TicketX, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/http';
import type { ExceptionItem, ExceptionKind } from '../../api/exceptions';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { Button, DueChip, StatusBadge, WaitChip } from '../../components';
import { useCanSeeExceptions, useExceptionsQuery } from './useExceptionsQuery';
import { useAttentionPeople, useNow, useRemindMutation } from '../attention/useAttention';
import { AttentionPersonRow, AttentionRowSkeleton } from '../attention/AttentionParts';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { agoLabel, remindedRecently } from '../attention/attentionDisplay';
import { cardIconTile } from './dashboardDisplay';

const KIND_ICON: Record<ExceptionKind, LucideIcon> = {
  TICKET_OVERDUE: TicketX,
  TICKET_STALE: AlertTriangle,
  CHECKLIST_MISSED: ClipboardX,
};

const KIND_LABEL: Record<ExceptionKind, string> = {
  TICKET_OVERDUE: 'Ticket late',
  TICKET_STALE: 'Ticket stuck',
  CHECKLIST_MISSED: 'Checklist missed',
};

const PREVIEW_LIMIT = 4;
const PEOPLE_PREVIEW_LIMIT = 4;

const ROW_CLASS = 'flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3 outline-none transition-colors duration-150';

const ExceptionRow = memo(({ item, now, linked }: { item: ExceptionItem; now: number; linked: boolean }) => {
  const Icon = KIND_ICON[item.kind];
  const high = item.severity === 'high';
  const body = (
    <>
      <span className={cn('flex items-center justify-center size-10 rounded-xl shrink-0 text-white', high ? 'bg-linear-to-br from-danger to-danger/70' : 'bg-linear-to-br from-warning to-warning/70')}>
        <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="flex flex-1 min-w-0 flex-col gap-1.5">
        <p className="line-clamp-2 text-sm font-display font-medium sm:font-semibold text-text leading-snug">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge variant={high ? 'critical' : 'warning'} icon={Icon} label={KIND_LABEL[item.kind]} />
          {item.kind === 'TICKET_OVERDUE' && <DueChip at={item.since} now={now} />}
          {item.kind === 'TICKET_STALE' && <WaitChip since={item.since} now={now} warnAfterHours={24} dangerAfterHours={72} />}
        </div>
        <p className="t-meta font-medium text-text-muted line-clamp-2">
          {item.storeName ? `${item.storeName} · ` : ''}{item.detail}
        </p>
      </div>
      {linked && <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted" aria-hidden="true" />}
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
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const unavailable = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
  if (!allowed || unavailable) return null;
  const peopleRows = people.data ?? [];
  const items = query.data ?? [];
  const visible = showAllAlerts ? items : items.slice(0, PREVIEW_LIMIT);
  const remaining = items.length - PREVIEW_LIMIT;
  const summaryParts = [
    items.length > 0 && `${items.length} ${items.length === 1 ? 'alert' : 'alerts'}`,
    peopleRows.length > 0 && `${peopleRows.length} ${peopleRows.length === 1 ? 'person' : 'people'}`,
  ].filter(Boolean);
  const redPeople = peopleRows.filter((p) => p.level === 'red');
  const orangeCount = peopleRows.length - redPeople.length;
  const repeatCount = peopleRows.filter((p) => p.missedStreak >= 2).length;
  const redToRemind = redPeople.filter((p) => !remindedRecently(p.lastRemindedAt, now)).map((p) => p.userId);
  const nothingAtAll = items.length === 0 && peopleRows.length === 0 && !people.isPending;

  return (
    <section aria-labelledby="exceptions-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('danger')}>
            <AlertTriangle className="size-4" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="exceptions-heading" className="t-section font-display font-bold text-text tracking-tight">Needs attention</h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">Late, stuck or waiting too long</p>
          </div>
        </div>
        {summaryParts.length > 0 && (
          <StatusBadge variant="critical" icon={AlertTriangle} label={summaryParts.join(' · ')} />
        )}
      </div>

      {query.isPending ? (
        <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading alerts">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load alerts." onRetry={() => void query.refetch()} />
        </div>
      ) : nothingAtAll ? (
        <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
          <EmptyState size="compact" tone="success" icon={CheckCheck} title="All clear" description="Nothing is late or stuck, and everyone is on track." />
        </div>
      ) : items.length === 0 ? null : (
        <div className="flex flex-col divide-y divide-border/60">
          {visible.map((item) => <ExceptionRow key={item.id} item={item} now={now} linked={user?.role !== 'OWNER'} />)}
        </div>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAllAlerts((v) => !v)}
          aria-expanded={showAllAlerts}
          className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-display font-semibold text-primary-700 dark:text-primary-300 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
        >
          {showAllAlerts ? 'Show fewer alerts' : `Show ${remaining} more ${remaining === 1 ? 'alert' : 'alerts'}`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', showAllAlerts && 'rotate-180')} aria-hidden />
        </button>
      )}

      {people.isPending && !query.isPending ? (
        <div className="flex flex-col divide-y divide-border/60 border-t border-border/60" role="status" aria-label="Loading people">
          <AttentionRowSkeleton />
          <AttentionRowSkeleton />
        </div>
      ) : peopleRows.length > 0 ? (
        <div className="flex flex-col border-t border-border/60">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 sm:px-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
                <Users className="size-4 text-text-muted" aria-hidden />
                People to chase
                <span className="t-meta font-semibold text-text-muted tabular-nums">{peopleRows.length}</span>
              </h3>
              <p className="flex items-center gap-1.5 t-meta font-medium text-text-muted">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 animate-ping motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                Live, updated {agoLabel(new Date(people.dataUpdatedAt || now).toISOString(), now)}
              </p>
            </div>
            {redToRemind.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 pointer-coarse:h-11"
                onClick={() => remind.mutate(redToRemind)}
                isLoading={remind.isPending}
                aria-label={`Send a reminder to the ${redToRemind.length} ${redToRemind.length === 1 ? 'person' : 'people'} who need you now`}
              >
                <BellRing className="size-3.5" aria-hidden />
                Send {redToRemind.length === 1 ? 'reminder' : `${redToRemind.length} reminders`}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2 sm:px-5">
            {redPeople.length > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${redPeople.length} need you now`} />}
            {orangeCount > 0 && <StatusBadge variant="warning" icon={ClipboardX} label={`${orangeCount} falling behind`} />}
            {repeatCount > 0 && <StatusBadge variant="neutral" icon={Repeat} label={`${repeatCount} repeat misses`} />}
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
              />
            ))}
          </div>
          {peopleRows.length > PEOPLE_PREVIEW_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/60 px-4 py-2.5 t-meta font-display font-semibold text-primary-700 dark:text-primary-300 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover cursor-pointer"
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
