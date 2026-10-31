import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarOff, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { useApprovalSources } from '../dashboard/useApprovalSources';
import { useExceptionsQuery } from '../dashboard/useExceptionsQuery';
import { AttentionAllSheet } from '../attention/AttentionAllSheet';
import { PersonAttentionSheet } from '../attention/PersonAttentionSheet';
import { useAttentionPeople } from '../attention/useAttention';
import { useOrgToday } from '../checklist/useOrgToday';
import { useLeaveQuery } from '../leave/hook';
import { StatusBadge } from '../../components/statusBadge';
import { useNow } from '../../lib/useNow';
import { PcFigure } from './PcFigure';
import { PcListModal, type PcFilter, type PcListItem } from './PcListModal';

const HOUR_MS = 3_600_000;
const LIMIT_HOURS = 24;

type Popup = 'waiting' | 'overdue' | 'people' | 'leave' | null;

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

export const PcStatTiles = () => {
  const now = useNow();
  const today = useOrgToday();
  const [popup, setPopup] = useState<Popup>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const approvals = useApprovalSources();
  const exceptions = useExceptionsQuery();
  const people = useAttentionPeople();
  const leave = useLeaveQuery();

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
  const overLimit = waitingItems.filter((i) => i.late).length;
  const highCount = overdueItems.filter((i) => i.late).length;
  const handOverCount = leaveItems.filter((i) => i.tags?.some((t) => t.variant === 'warning')).length;

  const lastOver = useRef<number | null>(null);
  useEffect(() => {
    if (approvals.isPending) return;
    if (lastOver.current !== null && overLimit > lastOver.current) {
      const added = overLimit - lastOver.current;
      toast.warning(`${added} ${added === 1 ? 'approval' : 'approvals'} just passed 24 hours`);
    }
    lastOver.current = overLimit;
  }, [overLimit, approvals.isPending]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="PC figures">
        <PcFigure
          label="Waiting on you"
          value={waitingItems.length}
          caption={overLimit > 0 ? `${overLimit} over 24 hours` : waitingItems.length === 0 ? 'All clear' : 'Awaiting your decision'}
          tone={overLimit > 0 ? 'bad' : waitingItems.length === 0 ? 'good' : 'plain'}
          loading={approvals.isPending}
          onClick={() => setPopup('waiting')}
        />
        <PcFigure
          label="Overdue and missed"
          value={overdueItems.length}
          caption={overdueItems.length === 0 ? 'All clear' : highCount > 0 ? `${highCount} high priority` : 'Late, stuck or missed'}
          tone={highCount > 0 ? 'bad' : overdueItems.length === 0 ? 'good' : 'plain'}
          loading={exceptions.isPending}
          onClick={() => setPopup('overdue')}
        />
        <PcFigure
          label="People to follow up"
          value={peopleRows.length}
          caption={peopleRows.length === 0 ? 'All clear' : `${redCount} red, ${peopleRows.length - redCount} orange`}
          tone={redCount > 0 ? 'bad' : peopleRows.length === 0 ? 'good' : 'plain'}
          loading={people.isPending}
          onClick={() => setPopup('people')}
        />
        <PcFigure
          label="On leave today"
          value={leaveItems.length}
          caption={leaveItems.length === 0 ? 'Everyone is in' : handOverCount > 0 ? `${handOverCount} with open work` : 'Checklists skipped'}
          tone={leaveItems.length === 0 ? 'good' : 'plain'}
          loading={leave.isPending}
          onClick={() => setPopup('leave')}
        />
      </div>

      <PcListModal
        open={popup === 'waiting'}
        onClose={() => setPopup(null)}
        title="Waiting on you"
        description="Oldest first. Tap a row to open it, or the person to see how they are doing."
        icon={ShieldQuestion}
        items={waitingItems}
        filters={WAITING_FILTERS}
        summary={(
          <>
            <StatusBadge variant="neutral" icon={false} label={`${waitingItems.length} waiting`} />
            {overLimit > 0 && <StatusBadge variant="critical" icon={AlertTriangle} label={`${overLimit} over 24 hours`} />}
          </>
        )}
        viewAllHref="/verify"
        viewAllLabel="Open Verification Queue"
        emptyTitle="Nothing is waiting"
        emptyDescription="Every approval has a decision."
        onOpenPerson={setOpenPerson}
      />
      <PcListModal
        open={popup === 'overdue'}
        onClose={() => setPopup(null)}
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
      <PcListModal
        open={popup === 'leave'}
        onClose={() => setPopup(null)}
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
      <AttentionAllSheet
        open={popup === 'people'}
        onClose={() => setPopup(null)}
        people={peopleRows}
        onOpenPerson={setOpenPerson}
      />
      <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
    </>
  );
};
