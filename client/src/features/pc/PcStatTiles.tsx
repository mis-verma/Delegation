import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarOff, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { useApprovalSources } from '../dashboard/useApprovalSources';
import { useDashboardSummaries } from '../dashboard/useDashboardSummaries';
import { useExceptionsQuery, useExceptionTotalsQuery } from '../dashboard/useExceptionsQuery';
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
import { usePcApprovalBuckets } from './usePcApprovalBuckets';
import { useMySummaries } from './useMySummaries';

const HOUR_MS = 3_600_000;
const LIMIT_HOURS = 24;

type Popup =
  | { kind: 'waiting'; filter?: string }
  | { kind: 'overdue' }
  | { kind: 'people' }
  | { kind: 'leave' };

const WAITING_FILTERS: PcFilter[] = [
  { key: 'late', label: 'Over 24 hours', test: (i) => i.late },
  { key: 'fresh', label: 'Under 24 hours', test: (i) => !i.late },
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

const Group = ({ title, children, columns = 3 }: { title: string; children: ReactNode; columns?: 3 | 4 }) => (
  <section className="flex w-full max-w-[34rem] flex-col gap-1.5" aria-label={title}>
    <h2 className="t-meta font-display font-semibold text-text-secondary">{title}</h2>
    <div className={`@container grid gap-2 ${columns === 4 ? 'grid-cols-2 min-[28rem]:grid-cols-4' : 'grid-cols-3'}`}>{children}</div>
  </section>
);

export const PcStatTiles = () => {
  const now = useNow();
  const today = useOrgToday();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const approvals = useApprovalSources();
  const buckets = usePcApprovalBuckets();
  const mine = useMySummaries();
  const exceptions = useExceptionsQuery();
  const exceptionTotals = useExceptionTotalsQuery();
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
  const totals = exceptionTotals.data;
  const overdueTotal = totals ? totals.tickets + totals.delegations + totals.missedRuns : overdueItems.length;
  const highCount = totals ? totals.high : overdueItems.filter((i) => i.late).length;

  const waitingTotal = approvals.total;
  const lateTotal = buckets.total.old;
  const freshTotal = buckets.total.fresh;
  const waitingCapped = waitingItems.length < waitingTotal;

  const overall = scores.data?.total.overall ?? null;
  const fillToday = kpi.orgChecklistToday.data?.completionPct ?? null;
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
              help="Share of today's checklist runs completed across the whole organisation. Tap to open the fill chart."
              value={fillToday}
              format={pctText}
              tone={fillToday === null ? 'plain' : bandTone(fillToday)}
              bar={fillToday}
              loading={kpi.orgChecklistToday.isPending}
              error={kpi.orgChecklistToday.isError}
              onRetry={kpi.orgChecklistToday.onRetry}
              compact
              to="/team/fill"
            />
          </Group>

          <Group title="Approvals to decide">
            <FigureCard
              label="Old"
              help="Approvals waiting more than 24 hours. Your own checklist is not counted, it goes to an Admin and its head. Tap for the list."
              value={lateTotal}
              tone={lateTotal === 0 ? 'good' : 'bad'}
              bar={waitingTotal === 0 ? 100 : shareWithin(waitingTotal, lateTotal)}
              loading={approvals.isPending}
              error={approvalsFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting', filter: 'late' })}
            />
            <FigureCard
              label="New"
              help="Approvals that arrived in the last 24 hours. Tap for the list."
              value={freshTotal}
              tone={freshTotal === 0 ? 'good' : 'plain'}
              bar={null}
              loading={approvals.isPending}
              error={approvalsFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting', filter: 'fresh' })}
            />
            <FigureCard
              label="Pending"
              help="Everything waiting for your decision: tickets, delegations and checklists. Tap for the list."
              value={waitingTotal}
              tone={waitingTotal === 0 ? 'good' : lateTotal > 0 ? 'fair' : 'plain'}
              bar={null}
              loading={approvals.isPending}
              error={approvalsFailed}
              onRetry={retryApprovals}
              compact
              onClick={() => setPopup({ kind: 'waiting' })}
            />
          </Group>

          <Group title="My tickets">
            <FigureCard
              label="New"
              help="Tickets given to you that were raised today. Tap to open the tickets."
              value={mine.tickets?.newToday ?? null}
              tone="plain"
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tickets}
              onRetry={mine.retry}
              compact
              to="/tickets"
            />
            <FigureCard
              label="Pending"
              help="Tickets given to you that are still open."
              value={mine.tickets?.pending ?? null}
              tone="plain"
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tickets}
              onRetry={mine.retry}
              compact
              to="/tickets?quickFilter=pending"
            />
            <FigureCard
              label="Late"
              help="Your open tickets that are past their deadline."
              value={mine.tickets?.overdue ?? null}
              tone={(mine.tickets?.overdue ?? 0) > 0 ? 'bad' : 'good'}
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tickets}
              onRetry={mine.retry}
              compact
              to="/tickets?quickFilter=delayed"
            />
          </Group>

          <Group title="My delegations">
            <FigureCard
              label="New"
              short="New"
              help="Delegations given to you that were created today. Tap to open them."
              value={mine.tasks?.newToday ?? null}
              tone="plain"
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tasks}
              onRetry={mine.retry}
              compact
              to="/tasks"
            />
            <FigureCard
              label="Pending"
              help="Delegations given to you that are still open."
              value={mine.tasks?.pending ?? null}
              tone="plain"
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tasks}
              onRetry={mine.retry}
              compact
              to="/tasks?quickFilter=pending"
            />
            <FigureCard
              label="Late"
              help="Your open delegations that are past their deadline."
              value={mine.tasks?.overdue ?? null}
              tone={(mine.tasks?.overdue ?? 0) > 0 ? 'bad' : 'good'}
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.tasks}
              onRetry={mine.retry}
              compact
              to="/tasks?quickFilter=delayed"
            />
          </Group>

          <Group title="My checklists" columns={4}>
            <FigureCard
              label="Done"
              help="Your own checklist runs finished today, out of the runs you have today. A finished run goes to an Admin or its head for approval, not to you."
              value={mine.checklists?.completed ?? null}
              text={mine.checklists ? `${mine.checklists.completed}/${mine.checklists.total}` : undefined}
              tone={mine.checklists && mine.checklists.total > 0 && mine.checklists.completed === mine.checklists.total ? 'good' : 'plain'}
              bar={mine.checklists && mine.checklists.total > 0 ? (mine.checklists.completed / mine.checklists.total) * 100 : null}
              loading={mine.isPending}
              error={mine.isError && !mine.checklists}
              onRetry={mine.retry}
              compact
              to="/checklists"
            />
            <FigureCard
              label="Overdue"
              help="Your checklist runs for today that are past their deadline and not finished."
              value={mine.checklists?.overdue ?? null}
              tone={(mine.checklists?.overdue ?? 0) > 0 ? 'bad' : 'good'}
              bar={null}
              loading={mine.isPending}
              error={mine.isError && !mine.checklists}
              onRetry={mine.retry}
              compact
              to="/checklists"
            />
            <FigureCard
              label="With approver"
              short="Approver"
              help={mine.approval?.oldestWaitingSince
                ? `Your finished checklists waiting for an Admin or their head. The oldest has waited since ${new Date(mine.approval.oldestWaitingSince).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. They do not come to you.`
                : 'Your finished checklists waiting for an Admin or their head. They do not come to you.'}
              value={mine.approval?.withApprover ?? null}
              tone="plain"
              bar={null}
              loading={mine.approvalPending}
              error={mine.approvalError && !mine.approval}
              onRetry={mine.retry}
              compact
              to="/checklists"
            />
            <FigureCard
              label="Sent back"
              short="Back"
              help="Your checklists an approver sent back. Fix the marked questions and submit again."
              value={mine.approval?.sentBack ?? null}
              tone={(mine.approval?.sentBack ?? 0) > 0 ? 'bad' : 'good'}
              bar={null}
              loading={mine.approvalPending}
              error={mine.approvalError && !mine.approval}
              onRetry={mine.retry}
              compact
              to="/checklists"
            />
          </Group>

          <Group title="Whole organisation">
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
              value={overdueTotal}
              tone={overdueTotal === 0 ? 'good' : highCount > 0 ? 'bad' : 'plain'}
              bar={overdueTotal === 0 ? 100 : shareWithin(overdueTotal, highCount)}
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
                <StatusBadge variant="neutral" icon={false} label={waitingCapped ? `Oldest ${waitingItems.length} of ${waitingTotal}` : `${waitingTotal} waiting`} />
                {lateTotal > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${lateTotal}${waitingCapped ? "+" : ""} over 24 hours`} />}
              </>
            )}
            viewAllHref="/verify"
            viewAllLabel="Open Verification Queue"
            emptyTitle="Nothing is waiting"
            emptyDescription="Every approval has a decision."
            isLoading={approvals.isPending}
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
            description={overdueTotal > overdueItems.length ? `The oldest ${overdueItems.length} of ${overdueTotal} are listed. Tap a row to open it, or the person to see how they are doing.` : "High priority first. Tap a row to open it, or the person to see how they are doing."}
            icon={AlertTriangle}
            items={overdueItems}
            filters={OVERDUE_FILTERS}
            summary={(
              <>
                <StatusBadge variant="neutral" icon={false} label={`${overdueTotal} ${overdueTotal === 1 ? 'item' : 'items'}`} />
                {highCount > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${highCount} high priority`} />}
              </>
            )}
            emptyTitle="Nothing is late"
            emptyDescription="No overdue or missed work right now."
            isLoading={exceptions.isPending}
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
