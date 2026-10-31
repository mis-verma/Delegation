import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarOff, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { useApprovalSources } from '../dashboard/useApprovalSources';
import { useDashboardSummaries } from '../dashboard/useDashboardSummaries';
import { useExceptionsQuery } from '../dashboard/useExceptionsQuery';
import { StatsBoundary } from '../dashboard/StatsBoundary';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { useAttentionPeople } from '../attention/useAttention';
import { useOrgToday } from '../checklist/useOrgToday';
import { useLeaveQuery } from '../leave/hook';
import { StatusBadge } from '../../components/statusBadge';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
import { useNow } from '../../lib/useNow';
import { PcListModal, type PcFilter, type PcListItem } from './PcListModal';
import { PopupBoundary } from './PopupBoundary';
import { usePcMonthScores } from './usePcMonthScores';

const HOUR_MS = 3_600_000;
const LIMIT_HOURS = 24;

type Popup =
  | { kind: 'waiting'; filter?: string }
  | { kind: 'overdue' }
  | { kind: 'people' }
  | { kind: 'leave' };

const WAITING_FILTERS: PcFilter[] = [
  { key: 'late', label: 'Over 24 hours', test: (i) => i.late },
  { key: 'ticket', label: 'Tickets', test: (i) => i.kind === 'ticket' },
  { key: 'delegation', label: 'Delegations', test: (i) => i.kind === 'delegation' },
  { key: 'checklist', label: 'Checklists', test: (i) => i.kind === 'checklist' },
];

const OVERDUE_FILTERS: PcFilter[] = [
  { key: 'high', label: 'High priority', test: (i) => i.late },
  { key: 'ticket', label: 'Tickets', test: (i) => i.kind === 'ticket' },
  { key: 'delegation', label: 'Delegations', test: (i) => i.kind === 'delegation' },
  { key: 'checklist', label: 'Missed runs', test: (i) => i.kind === 'checklist' },
];

const EXCEPTION_KIND = {
  TICKET_OVERDUE: { kind: 'ticket', tag: 'Overdue' },
  TICKET_STALE: { kind: 'ticket', tag: 'Stale' },
  TASK_OVERDUE: { kind: 'delegation', tag: 'Overdue' },
  CHECKLIST_MISSED: { kind: 'checklist', tag: 'Missed' },
} as const;

const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

const bandTone = (rate: number): FigureTone => (rate >= GOOD_FROM ? 'good' : rate >= FAIR_FROM ? 'fair' : 'bad');
const shareWithin = (total: number, late: number) => (total <= 0 ? 100 : Math.max(0, ((total - late) / total) * 100));
const countTone = (total: number, late: number): FigureTone => (total === 0 || late === 0 ? 'good' : bandTone(shareWithin(total, late)));
const pctText = (n: number) => `${Math.round(n)}%`;

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex w-full max-w-[34rem] flex-col gap-1.5" aria-label={title}>
    <h2 className="t-meta font-display font-semibold text-text-secondary">{title}</h2>
    <div className="@container grid grid-cols-3 gap-2">{children}</div>
  </section>
);

export const PcStatTiles = () => {
  const now = useNow();
  const today = useOrgToday();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const approvals = useApprovalSources();
  const exceptions = useExceptionsQuery();
  const people = useAttentionPeople();
  const leave = useLeaveQuery();
  const scores = usePcMonthScores();
  const { kpi } = useDashboardSummaries();

  const closePopup = useCallback(() => setPopup(null), []);
  const popupFailed = useCallback(() => {
    setPopup(null);
    toast.error("Couldn't open that list. Try again.");
  }, []);

  const waitingItems = useMemo<PcListItem[]>(() => {
    const raw: Omit<PcListItem, 'late'>[] = [
      ...(approvals.tickets.data?.rows ?? []).map((t) => ({ id: `t-${t.id}`, kind: 'ticket' as const, title: t.title, link: `/tickets?open=${t.id}`, since: t.waitingSince, person: t.submittedBy, personId: t.submittedById ?? null, detail: 'Raised by' })),
      ...(approvals.tasks.data?.rows ?? []).map((t) => ({ id: `d-${t.id}`, kind: 'delegation' as const, title: t.title, link: `/tasks?open=${t.id}`, since: t.waitingSince, person: t.submittedBy, personId: t.submittedById ?? null, detail: 'Raised by' })),
      ...(approvals.checklists.data?.rows ?? []).map((c) => ({ id: `c-${c.id}`, kind: 'checklist' as const, title: c.title, link: `/checklists/${c.id}`, since: c.waitingSince, store: c.storeName, person: c.submittedBy ?? null, personId: c.submittedById ?? null, detail: 'Submitted by' })),
    ];
    return raw
      .sort((a, b) => new Date(a.since!).getTime() - new Date(b.since!).getTime())
      .map((r) => ({
        ...r,
        late: (now - new Date(r.since!).getTime()) / HOUR_MS > LIMIT_HOURS,
        detail: r.person ? `${r.detail} ${r.person}` : null,
      }));
  }, [approvals.tickets.data, approvals.tasks.data, approvals.checklists.data, now]);

  const overdueItems = useMemo<PcListItem[]>(
    () => (exceptions.data ?? []).map((e) => {
      const look = EXCEPTION_KIND[e.kind];
      return {
        id: e.id,
        kind: look.kind,
        title: e.title,
        link: e.link,
        late: e.severity === 'high',
        since: e.since,
        detail: e.detail,
        store: e.storeName,
        person: e.person,
        personId: e.userId,
        tags: [
          { label: look.tag, variant: 'critical' as const },
          ...(e.remindedAt ? [{ label: 'Reminded', variant: 'neutral' as const }] : []),
        ],
      };
    }),
    [exceptions.data],
  );

  const leaveItems = useMemo<PcListItem[]>(
    () => (leave.data ?? [])
      .filter((l) => l.startDate <= today && today <= l.endDate)
      .map((l) => ({
        id: l.id,
        kind: 'leave' as const,
        title: l.userName,
        link: '/leave',
        late: false,
        detail: [l.reason, l.startDate === l.endDate ? shortDay(l.startDate) : `${shortDay(l.startDate)} to ${shortDay(l.endDate)}`].filter(Boolean).join(' · '),
        person: l.userName,
        personId: l.userId,
        tags: [
          ...(l.departmentName ? [{ label: l.departmentName, variant: 'neutral' as const }] : []),
          ...(l.openTickets + l.openDelegations > 0 ? [{ label: `${l.openTickets + l.openDelegations} open to hand over`, variant: 'warning' as const }] : []),
        ],
      })),
    [leave.data, today],
  );

  const peopleRows = people.data ?? [];
  const redCount = peopleRows.filter((p) => p.level === 'red').length;
  const highCount = overdueItems.filter((i) => i.late).length;

  const waitingTotal = approvals.total;
  const lateOf = (kind: PcListItem['kind']) => waitingItems.filter((i) => i.kind === kind && i.late).length;
  const ticketWaiting = approvals.tickets.data?.total ?? 0;
  const taskWaiting = approvals.tasks.data?.total ?? 0;
  const checklistWaiting = approvals.checklists.data?.total ?? 0;
  const lateTotal = waitingItems.filter((i) => i.late).length;

  const overall = scores.data?.total.overall ?? null;
  const fillToday = kpi.checklistToday.data?.completionPct ?? null;
  const openTickets = kpi.tickets.data?.pending ?? 0;
  const lateTickets = kpi.tickets.data?.overdue ?? 0;
  const openTasks = kpi.tasks.data?.pending ?? 0;
  const lateTasks = kpi.tasks.data?.overdue ?? 0;

  const ticketsFailed = approvals.tickets.isError && approvals.tickets.data === undefined;
  const tasksFailed = approvals.tasks.isError && approvals.tasks.data === undefined;
  const checklistsFailed = approvals.checklists.isError && approvals.checklists.data === undefined;
  const approvalsFailed = ticketsFailed || tasksFailed || checklistsFailed;
  const retryApprovals = () => {
    void approvals.tickets.refetch();
    void approvals.tasks.refetch();
    void approvals.checklists.refetch();
  };

  const lastOver = useRef<number | null>(null);
  useEffect(() => {
    if (approvals.isPending) return;
    if (lastOver.current !== null && lateTotal > lastOver.current) {
      const added = lateTotal - lastOver.current;
      toast.warning(`${added} ${added === 1 ? 'approval' : 'approvals'} just passed 24 hours`);
    }
    lastOver.current = lateTotal;
  }, [lateTotal, approvals.isPending]);

  return (
    <>
      <StatsBoundary label="The PC figures">
        <div className="grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,30rem),1fr))]">
          <Group title="Go to">
            <FigureCard
              label="Verification Queue"
              short="Queue"
              help="Everything waiting for your review. Tap to open the queue."
              value={waitingTotal}
              tone={countTone(waitingTotal, lateTotal)}
              bar={shareWithin(waitingTotal, lateTotal)}
              loading={approvals.isPending}
              error={approvalsFailed}
              onRetry={retryApprovals}
              compact
              to="/verify"
            />
            <FigureCard
              label="Scores"
              help="Whole organisation, this month. Tap to open the scores."
              value={overall}
              format={pctText}
              tone={overall === null ? 'plain' : bandTone(overall)}
              bar={overall}
              loading={scores.isPending}
              error={scores.isError && !scores.data}
              onRetry={() => void scores.refetch()}
              compact
              to="/admin/scores"
            />
            <FigureCard
              label="Fill chart"
              short="Fills"
              help="Share of today's checklist items filled. Tap to open the fill chart."
              value={fillToday}
              format={pctText}
              tone={fillToday === null ? 'plain' : bandTone(fillToday)}
              bar={fillToday}
              loading={kpi.checklistToday.isPending}
              error={kpi.checklistToday.isError}
              onRetry={kpi.checklistToday.onRetry}
              compact
              to="/team/fill"
            />
          </Group>

          <Group title="Approvals waiting">
            <FigureCard
              label="Tickets"
              help="Ticket approvals waiting for a decision. The bar shows how many are still inside 24 hours."
              value={ticketWaiting}
              tone={countTone(ticketWaiting, lateOf('ticket'))}
              bar={shareWithin(ticketWaiting, lateOf('ticket'))}
              loading={approvals.isPending}
              error={ticketsFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting', filter: 'ticket' })}
            />
            <FigureCard
              label="Delegations"
              short="Deleg."
              help="Delegation approvals waiting for a decision. The bar shows how many are still inside 24 hours."
              value={taskWaiting}
              tone={countTone(taskWaiting, lateOf('delegation'))}
              bar={shareWithin(taskWaiting, lateOf('delegation'))}
              loading={approvals.isPending}
              error={tasksFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting', filter: 'delegation' })}
            />
            <FigureCard
              label="Checklists"
              short="Lists"
              help="Checklist runs waiting for review. The bar shows how many are still inside 24 hours."
              value={checklistWaiting}
              tone={countTone(checklistWaiting, lateOf('checklist'))}
              bar={shareWithin(checklistWaiting, lateOf('checklist'))}
              loading={approvals.isPending}
              error={checklistsFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting', filter: 'checklist' })}
            />
          </Group>

          <Group title="Open work">
            <FigureCard
              label="Open tickets"
              short="Tickets"
              help={`Tickets open right now. ${lateTickets} past their deadline. Tap to open the tickets.`}
              value={openTickets}
              tone={countTone(openTickets, lateTickets)}
              bar={shareWithin(openTickets, lateTickets)}
              loading={kpi.tickets.isPending}
              error={kpi.tickets.isError}
              onRetry={kpi.tickets.onRetry}
              compact
              to="/tickets?quickFilter=pending"
            />
            <FigureCard
              label="Open delegations"
              short="Deleg."
              help={`Delegations open right now. ${lateTasks} past their deadline. Tap to open the delegations.`}
              value={openTasks}
              tone={countTone(openTasks, lateTasks)}
              bar={shareWithin(openTasks, lateTasks)}
              loading={kpi.tasks.isPending}
              error={kpi.tasks.isError}
              onRetry={kpi.tasks.onRetry}
              compact
              to="/tasks?quickFilter=pending"
            />
            <FigureCard
              label="Overdue and missed"
              short="Overdue"
              help="Late or stuck tickets and delegations, and checklist runs that closed unsubmitted. Tap for the list."
              value={overdueItems.length}
              tone={overdueItems.length === 0 ? 'good' : highCount > 0 ? 'bad' : 'plain'}
              bar={overdueItems.length === 0 ? 100 : shareWithin(overdueItems.length, highCount)}
              loading={exceptions.isPending}
              error={exceptions.isError && !exceptions.data}
              onRetry={() => void exceptions.refetch()}
              compact
              onClick={() => setPopup({ kind: 'overdue' })}
            />
          </Group>

          <Group title="People">
            <FigureCard
              label="People to follow up"
              short="Follow up"
              help={`${redCount} red and ${peopleRows.length - redCount} orange. Tap to see who, and send reminders.`}
              value={peopleRows.length}
              tone={peopleRows.length === 0 ? 'good' : redCount > 0 ? 'bad' : 'plain'}
              bar={peopleRows.length === 0 ? 100 : shareWithin(peopleRows.length, redCount)}
              loading={people.isPending}
              error={people.isError && !people.data}
              onRetry={() => void people.refetch()}
              compact
              onClick={() => setPopup({ kind: 'people' })}
            />
            <FigureCard
              label="On leave today"
              short="On leave"
              help="People on leave today. Their checklists are skipped. Tap for the list."
              value={leaveItems.length}
              tone={leaveItems.length === 0 ? 'good' : 'plain'}
              bar={null}
              loading={leave.isPending}
              error={leave.isError && !leave.data}
              onRetry={() => void leave.refetch()}
              compact
              onClick={() => setPopup({ kind: 'leave' })}
            />
            <FigureCard
              label="Reports"
              help="Download Excel and CSV reports. Tap to open."
              value={null}
              text="Open"
              tone="plain"
              bar={null}
              loading={false}
              compact
              to="/admin/reports"
            />
          </Group>
        </div>
      </StatsBoundary>

      {popup?.kind === 'waiting' && (
        <PopupBoundary onFail={popupFailed}>
          <PcListModal
            open
            onClose={closePopup}
            title="Waiting on you"
            description="Oldest first. Tap a row to open it, or the person to see how they are doing."
            icon={ShieldQuestion}
            items={waitingItems}
            filters={WAITING_FILTERS}
            defaultFilter={popup.filter}
            summary={(
              <>
                <StatusBadge variant="neutral" icon={false} label={`${waitingItems.length} waiting`} />
                {lateTotal > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${lateTotal} over 24 hours`} />}
              </>
            )}
            viewAllHref="/verify"
            viewAllLabel="Open Verification Queue"
            emptyTitle="Nothing is waiting"
            emptyDescription="Every approval has a decision."
            onOpenPerson={setOpenPerson}
          />
        </PopupBoundary>
      )}
      {popup?.kind === 'overdue' && (
        <PopupBoundary onFail={popupFailed}>
          <PcListModal
            open
            onClose={closePopup}
            title="Overdue and missed"
            description="High priority first. Tap a row to open it, or the person to see how they are doing."
            icon={AlertTriangle}
            items={overdueItems}
            filters={OVERDUE_FILTERS}
            summary={(
              <>
                <StatusBadge variant="neutral" icon={false} label={`${overdueItems.length} items`} />
                {highCount > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${highCount} high priority`} />}
              </>
            )}
            emptyTitle="Nothing is late"
            emptyDescription="No overdue or missed work right now."
            onOpenPerson={setOpenPerson}
          />
        </PopupBoundary>
      )}
      {popup?.kind === 'leave' && (
        <PopupBoundary onFail={popupFailed}>
          <PcListModal
            open
            onClose={closePopup}
            title="On leave today"
            description="Their checklists are skipped. Tap the person to see their open work."
            icon={CalendarOff}
            items={leaveItems}
            summary={<StatusBadge variant="neutral" icon={false} label={`${leaveItems.length} off today`} />}
            viewAllHref="/leave"
            viewAllLabel="Open Leave"
            emptyTitle="Everyone is in"
            emptyDescription="Nobody is on leave today."
            isLoading={leave.isPending}
            onOpenPerson={setOpenPerson}
          />
        </PopupBoundary>
      )}
      {popup?.kind === 'people' && (
        <PopupBoundary onFail={popupFailed}>
          <AttentionAllSheet open onClose={closePopup} people={peopleRows} onOpenPerson={setOpenPerson} />
        </PopupBoundary>
      )}
      {openPerson && (
        <PopupBoundary onFail={() => { setOpenPerson(null); toast.error("Couldn't open that person. Try again."); }}>
          <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
        </PopupBoundary>
      )}
    </>
  );
};
