import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Building2, Users } from 'lucide-react';
import { useDepartmentsQuery } from '../tickets/hook';
import { useTeamWork } from './useTeamWork';
import { useUsersQuery } from '../admin/hook';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { EmptyState, InlineError, PageHeader } from '../../components';
import { Breadcrumbs, type BreadcrumbTrailItem } from '../../components/breadcrumbs';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { DepartmentCard, type DepartmentCardRow } from './DepartmentCard';
import { PersonCard, type PersonCardRow } from './PersonCard';
import { PersonChecklistView } from './PersonChecklistView';
import { TeamCardSkeleton } from './TeamCardParts';
import { useTeamChecklistReport } from './useTeamChecklistReport';
import {
  TEAM_PERIOD_KEYS,
  TEAM_PERIOD_LABELS,
  isInTeamPeriod,
  selectPersonWork,
  teamPeriodRange,
  type OverdueItem,
  type ReportState,
  type TeamPeriod,
} from './teamDisplay';

// Tickets and delegations rolled up for one department or one person, all created in the selected
// period (the checklist report is period-scoped too, so every number on a card is the same window).
interface WorkAcc {
  done: number;
  total: number;
  openTickets: number;
  openTasks: number;
  overdueItems: OverdueItem[];
}

const newAcc = (): WorkAcc => ({ done: 0, total: 0, openTickets: 0, openTasks: 0, overdueItems: [] });

const accFor = (map: Map<string, WorkAcc>, key: string) => {
  let acc = map.get(key);
  if (!acc) {
    acc = newAcc();
    map.set(key, acc);
  }
  return acc;
};

const addTicket = (acc: WorkAcc, t: Ticket, now: number) => {
  const closed = t.status === 'CLOSED';
  acc.total += 1;
  if (closed) acc.done += 1;
  else acc.openTickets += 1;
  if (!closed && !!t.tatDueAt && new Date(t.tatDueAt).getTime() < now) {
    acc.overdueItems.push({ id: t.id, title: t.title, link: `/tickets?open=${t.id}`, kind: 'ticket' });
  }
};

const addTask = (acc: WorkAcc, t: Task, now: number) => {
  const done = t.status === 'done';
  acc.total += 1;
  if (done) acc.done += 1;
  else acc.openTasks += 1;
  if (!done && !!t.dueDate && new Date(t.dueDate).getTime() < now) {
    acc.overdueItems.push({ id: t.id, title: t.title, link: `/tasks?open=${t.id}`, kind: 'task' });
  }
};

const NO_TICKETS: Ticket[] = [];

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

// Department -> Person -> detail drill-down for ADMIN/PC (both have full org-wide access, see
// App.tsx's AdminRoute). State lives in the URL (departmentId/personId) rather than plain useState
// so back/forward and refresh land on the same drill-down level. The period is page state: it
// drives the checklist report for every level and the wording on the person screen.
export const TeamOverviewPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('departmentId');
  const personId = searchParams.get('personId');
  const [period, setPeriod] = useState<TeamPeriod>('month');

  const range = useMemo(() => teamPeriodRange(period), [period]);

  const { data: departments, isPending: departmentsPending, isError: departmentsError, refetch: refetchDepartments } = useDepartmentsQuery();
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery(true);
  // Every ticket and delegation of the period, all pages (not just the first 100 / 200).
  const work = useTeamWork(range);
  const { data: tickets = NO_TICKETS, isPending: ticketsPending } = work.tickets;
  const { data: tasks, isPending: tasksPending } = work.tasks;
  const report = useTeamChecklistReport(range);

  const isPending = departmentsPending || usersPending || ticketsPending || tasksPending;

  // 'error' wins over any leftover data: a failed refetch must not leave the previous period's
  // numbers on screen looking current.
  const reportState: ReportState = report.isError ? 'error' : report.data ? 'ready' : 'loading';
  const isRefreshing = reportState === 'ready' && report.isPlaceholderData;

  // "now" only needs to be approximately current for the overdue checks below; memoized so it's
  // read once per mount, not on every render (see HomePage.tsx for the same pattern).
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  // Departments in a single pass over the lists (the old code re-filtered every ticket/task for
  // every department).
  const workByDepartment = useMemo(() => {
    const byDepartment = new Map<string, WorkAcc>();
    for (const t of tickets) {
      if (t.departmentId && isInTeamPeriod(t.createdAt, range)) addTicket(accFor(byDepartment, t.departmentId), t, now);
    }
    for (const t of tasks ?? []) {
      if (t.departmentId && isInTeamPeriod(t.createdAt, range)) addTask(accFor(byDepartment, t.departmentId), t, now);
    }
    return byDepartment;
  }, [tickets, tasks, range, now]);

  const checklistByDepartment = useMemo(
    () => new Map((report.data?.departments ?? []).flatMap((d) => (d.departmentId ? [[d.departmentId, d] as const] : []))),
    [report.data],
  );
  const checklistByPerson = useMemo(
    () => new Map((report.data?.people ?? []).map((p) => [p.userId, p] as const)),
    [report.data],
  );

  const departmentRows: DepartmentCardRow[] = useMemo(() => {
    const headcount = new Map<string, number>();
    for (const u of users ?? []) if (u.departmentId) headcount.set(u.departmentId, (headcount.get(u.departmentId) ?? 0) + 1);

    return (departments ?? []).map((dept) => {
      const acc = workByDepartment.get(dept.id) ?? newAcc();
      return {
        id: dept.id,
        name: dept.name,
        headcount: headcount.get(dept.id) ?? 0,
        openTickets: acc.openTickets,
        openTasks: acc.openTasks,
        overdueItems: acc.overdueItems,
        workDone: acc.done,
        workTotal: acc.total,
      };
    });
  }, [departments, users, workByDepartment]);

  // People go through selectPersonWork, the same selector the person screen uses, so a card and
  // the screen it opens always count the same tickets and delegations. Only one department's
  // roster at a time, so filtering per person is cheap.
  const personRows: PersonCardRow[] = useMemo(() => {
    if (!departmentId) return [];
    return (users ?? [])
      .filter((u) => u.departmentId === departmentId)
      .map((u): PersonCardRow => {
        const acc = newAcc();
        const mine = selectPersonWork(tasks ?? [], tickets, u.id, departmentId, range);
        for (const t of mine.tickets) addTicket(acc, t, now);
        for (const t of mine.tasks) addTask(acc, t, now);
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
          role: u.role,
          openTickets: acc.openTickets,
          openTasks: acc.openTasks,
          overdueItems: acc.overdueItems,
          workDone: acc.done,
          workTotal: acc.total,
        };
      });
  }, [users, departmentId, tasks, tickets, range, now]);

  const selectedDepartment = departmentRows.find((d) => d.id === departmentId);
  const selectedPerson = personRows.find((p) => p.id === personId);

  const openDepartment = (id: string) => setSearchParams({ departmentId: id });
  const openPerson = (id: string) => setSearchParams({ departmentId: departmentId ?? '', personId: id });

  // One trail, always visible once you've drilled in: every level is a click back.
  const breadcrumbs: BreadcrumbTrailItem[] = [
    { label: 'Team Overview', to: departmentId ? '/team' : undefined },
    ...(departmentId ? [{ label: selectedDepartment?.name ?? '…', to: personId ? `/team?departmentId=${departmentId}` : undefined }] : []),
    ...(personId ? [{ label: selectedPerson?.name ?? '…' }] : []),
  ];

  const loadFailed = departmentsError || usersError;
  const retryLoad = () => {
    if (departmentsError) refetchDepartments();
    if (usersError) refetchUsers();
  };

  return (
    <div className="flex flex-col gap-6 pt-2.5 w-full pb-10">
      {/* Two copies of the one period control, toggled in CSS: PageHeader's actions slot sizes to
          its content, so on a phone the tabs get their own full-width row under the title instead. */}
      <div className="flex flex-col gap-3">
        <PageHeader
          icon={Building2}
          title="Team Overview"
          subtitle="Store checklists, delegations and tickets for every department and person."
          actions={
            <div className="hidden sm:flex items-center gap-3">
              {/* Old numbers stay on screen (no dim) while the next period loads; this says so. */}
              {isRefreshing && <span className="t-meta font-display text-text-muted" aria-live="polite">Updating…</span>}
              <PeriodTabControl value={period} options={TEAM_PERIOD_KEYS} labels={TEAM_PERIOD_LABELS} onChange={setPeriod} />
            </div>
          }
        />
        <PeriodTabControl value={period} options={TEAM_PERIOD_KEYS} labels={TEAM_PERIOD_LABELS} onChange={setPeriod} fill className="sm:hidden" />
      </div>

      {/* Only shown once there's an actual trail: at the top level it would be a single,
          unclickable crumb that just repeats the title above it. */}
      {departmentId && <Breadcrumbs items={breadcrumbs} />}

      {/* The report is a separate request from tickets/delegations, so a failure here is its own
          strip with Retry and the rest of the page keeps working. The person screen shows its own. */}
      {reportState === 'error' && !personId && (
        <InlineError
          message="Could not load store checklist numbers. Ticket and delegation counts below are still correct."
          onRetry={() => { report.refetch(); }}
        />
      )}

      {loadFailed ? (
        <InlineError message="Could not load the team." onRetry={retryLoad} />
      ) : isPending ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => <TeamCardSkeleton key={i} />)}
        </div>
      ) : !departmentId ? (
        departmentRows.length === 0 ? (
          <EmptyState icon={Building2} title="No departments yet" description="Departments you add in Admin will show up here." />
        ) : (
          <div className={GRID_CLASS} aria-busy={isRefreshing}>
            {departmentRows.map((row) => (
              <DepartmentCard
                key={row.id}
                row={row}
                checklist={checklistByDepartment.get(row.id)}
                reportState={reportState}
                onClick={() => openDepartment(row.id)}
              />
            ))}
          </div>
        )
      ) : !personId ? (
        personRows.length === 0 ? (
          <EmptyState icon={Users} title="No one is assigned to this department yet" />
        ) : (
          <div className={GRID_CLASS} aria-busy={isRefreshing}>
            {personRows.map((row) => (
              <PersonCard
                key={row.id}
                row={row}
                checklist={checklistByPerson.get(row.id)}
                reportState={reportState}
                onClick={() => openPerson(row.id)}
              />
            ))}
          </div>
        )
      ) : (
        <PersonChecklistView
          personName={selectedPerson?.name ?? 'This person'}
          departmentName={selectedDepartment?.name ?? 'department'}
          departmentId={departmentId}
          personId={personId}
          tasks={tasks ?? []}
          tickets={tickets}
          period={period}
          range={range}
          checklist={checklistByPerson.get(personId)}
          reportState={reportState}
          isRefreshing={isRefreshing}
          onRetryReport={() => { report.refetch(); }}
        />
      )}
    </div>
  );
};
