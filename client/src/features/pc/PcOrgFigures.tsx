import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
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
import { PcListModal, type PcFilter, type PcListItem } from './PcListModal';
import { PopupBoundary } from './PopupBoundary';

type Popup = 'overdue' | 'people' | 'leave';

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

const DeskSection = ({ title, hint, columns, children }: { title: string; hint?: string; columns: 2 | 4; children: ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="t-section font-display font-bold text-text">{title}</h2>
      {hint && <p className="hidden t-meta text-text-muted sm:block">{hint}</p>}
    </div>
    <div className="@container">
      <div className={cn('grid grid-cols-2 gap-2', columns === 4 && '@min-[36rem]:grid-cols-4')}>{children}</div>
    </div>
  </section>
);

export const PcOrgFigures = () => {
  const today = useOrgToday();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const exceptions = useExceptionsQuery();
  const exceptionTotals = useExceptionTotalsQuery();
  const people = useAttentionPeople();
  const leave = useLeaveQuery();
  const { kpi } = useDashboardSummaries();

  const closePopup = useCallback(() => setPopup(null), []);
  const popupFailed = useCallback(() => {
    setPopup(null);
    toast.error("Couldn't open that list. Try again.");
  }, []);

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
      .filter((l) => l.status === 'APPROVED' && l.startDate <= today && today <= l.endDate)
      .map((l) => ({
        id: l.id,
        kind: 'leave' as const,
        title: l.userName,
        link: '/leave',
        late: false,
        detail: [l.reason, l.startDate === l.endDate ? shortDay(l.startDate) : `${shortDay(l.startDate)} to ${shortDay(l.endDate)}`].filter(Boolean).join(', '),
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

  const fillToday = kpi.orgChecklistToday.data?.completionPct ?? null;
  const openTickets = kpi.tickets.data?.pending ?? 0;
  const lateTickets = kpi.tickets.data?.overdue ?? 0;
  const openTasks = kpi.tasks.data?.pending ?? 0;
  const lateTasks = kpi.tasks.data?.overdue ?? 0;

  return (
    <>
      <StatsBoundary label="The organisation figures">
        <div className="flex flex-col gap-6">
          <DeskSection title="Organisation today" hint="Every store and department" columns={4}>
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
              short="Delegations"
              help={`Delegations open right now. ${lateTasks} past their deadline. Tap to open the delegations.`}
              value={openTasks}
              tone={countTone(openTasks, lateTasks)}
              bar={shareWithin(openTasks, lateTasks)}
              loading={kpi.tasks.isPending}
              error={kpi.tasks.isError}
              onRetry={kpi.tasks.onRetry}
              compact
              to="/tasks?category=work&quickFilter=pending"
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
              onClick={() => setPopup('overdue')}
            />
            <FigureCard
              label="Checklists filled"
              short="Filled"
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
          </DeskSection>

          <DeskSection title="People" columns={2}>
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
              onClick={() => setPopup('people')}
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
              onClick={() => setPopup('leave')}
            />
          </DeskSection>
        </div>
      </StatsBoundary>

      {popup === 'overdue' && (
        <PopupBoundary onFail={popupFailed}>
          <PcListModal
            open
            onClose={closePopup}
            title="Overdue and missed"
            description={overdueTotal > overdueItems.length ? `The oldest ${overdueItems.length} of ${overdueTotal} are listed. Tap a row to open it, or the person to see how they are doing.` : 'High priority first. Tap a row to open it, or the person to see how they are doing.'}
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
            error={exceptions.isError && !exceptions.data}
            onRetry={() => void exceptions.refetch()}
            errorMessage="The overdue list didn't load. Check your connection and try again."
            onOpenPerson={setOpenPerson}
          />
        </PopupBoundary>
      )}
      {popup === 'leave' && (
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
            error={leave.isError && !leave.data}
            onRetry={() => void leave.refetch()}
            errorMessage="The leave list didn't load. Check your connection and try again."
            onOpenPerson={setOpenPerson}
          />
        </PopupBoundary>
      )}
      {popup === 'people' && (
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
