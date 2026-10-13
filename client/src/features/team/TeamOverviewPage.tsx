import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Building2, Users } from 'lucide-react';
import { useDepartmentsQuery } from '../tickets/hook';
import { useTeamOpenWork, useTeamPeriodWork } from './useTeamWork';
import { useUsersQuery } from '../admin/hook';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { useScoreReport } from '../dashboard/scoreQueries';
import { useOrgToday } from '../checklist/useOrgToday';
import { isOverdueTask } from '../tasks/taskFilters';
import { EmptyState, ExportMenu, InlineError, PageHeader } from '../../components';
import { exportPct, exportTitle, formatExportRange, type TableRows } from '../../lib/exportTable';
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
  summarizeCard,
  teamPeriodRange,
  type OverdueItem,
  type ReportState,
  type TeamPeriod,
} from './teamDisplay';

// Today's open tickets and delegations rolled up for one department or one person. These are the "Open now"
// figures: they are not part of any percentage. The scores on the cards come from the scores report.
interface WorkAcc {
  openTickets: number;
  openTasks: number;
  overdueItems: OverdueItem[];
}

const newAcc = (): WorkAcc => ({ openTickets: 0, openTasks: 0, overdueItems: [] });

const accFor = (map: Map<string, WorkAcc>, key: string) => {
  let acc = map.get(key);
  if (!acc) {
    acc = newAcc();
    map.set(key, acc);
  }
  return acc;
};

const addTicket = (acc: WorkAcc, t: Ticket, now: number) => {
  acc.openTickets += 1;
  if (!!t.tatDueAt && new Date(t.tatDueAt).getTime() < now) {
    acc.overdueItems.push({ id: t.id, title: t.title, link: `/tickets?open=${t.id}`, kind: 'ticket' });
  }
};

const addTask = (acc: WorkAcc, t: Task) => {
  acc.openTasks += 1;
  // The same overdue rule as the Scorecard: past due, not done, not a draft, not waiting for approval.
  if (isOverdueTask(t)) {
    acc.overdueItems.push({ id: t.id, title: t.title, link: `/tasks?open=${t.id}`, kind: 'task' });
  }
};

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

// Department -> Person -> detail drill-down for ADMIN/PC (both have full org-wide access, see
// App.tsx's AdminRoute). State lives in the URL (departmentId/personId) rather than plain useState
// so back/forward and refresh land on the same drill-down level. The period is page state: it
// drives the scores for every level and the wording on the person screen.
export const TeamOverviewPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('departmentId');
  const personId = searchParams.get('personId');
  const [period, setPeriod] = useState<TeamPeriod>('month');

  // The org's calendar day, not the device clock: the window rolls over at the org's midnight and on the 1st.
  const today = useOrgToday();
  const range = useMemo(() => teamPeriodRange(period, today), [period, today]);

  const { data: departments, isPending: departmentsPending, isError: departmentsError, refetch: refetchDepartments } = useDepartmentsQuery();
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery(true);
  // Today's open tickets and delegations, all pages (the "Open now" figures).
  const openWork = useTeamOpenWork();
  const { data: tickets = NO_TICKETS, isPending: ticketsPending } = openWork.tickets;
  const { data: tasks = NO_TASKS, isPending: tasksPending } = openWork.tasks;
  // The scores, the same request and the same rows as the Scorecard, so the two always agree.
  const scores = useScoreReport(range.from, range.to);
  // Only the person screen needs the per-person checklist report and the created-in-period lists.
  const report = useTeamChecklistReport(range, !!personId);
  const periodWork = useTeamPeriodWork(range, !!personId);

  const isPending = departmentsPending || usersPending || ticketsPending || tasksPending;

  // 'error' wins over any leftover data: a failed refetch must not leave the previous period's
  // numbers on screen looking current.
  const reportState: ReportState = scores.isError ? 'error' : scores.data ? 'ready' : 'loading';
  const isRefreshing = reportState === 'ready' && scores.isPlaceholderData;

  // "now" only needs to be approximately current for the overdue checks below; memoized so it's
  // read once per mount, not on every render (see HomePage.tsx for the same pattern).
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  // Departments in a single pass over the lists.
  const workByDepartment = useMemo(() => {
    const byDepartment = new Map<string, WorkAcc>();
    for (const t of tickets) if (t.departmentId) addTicket(accFor(byDepartment, t.departmentId), t, now);
    for (const t of tasks) if (t.departmentId) addTask(accFor(byDepartment, t.departmentId), t);
    return byDepartment;
  }, [tickets, tasks, now]);

  const scoresByDepartment = useMemo(
    () => new Map((scores.data?.departments ?? []).map((d) => [d.id, d] as const)),
    [scores.data],
  );
  const scoresByPerson = useMemo(
    () => new Map((scores.data?.people ?? []).map((p) => [p.id, p] as const)),
    [scores.data],
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
      };
    });
  }, [departments, users, workByDepartment]);

  // A person's open work is what is assigned to them today (a ticket's assignee, a delegation's main or extra
  // assignee), the same people the scores count. Only one department's roster at a time, so filtering per
  // person is cheap.
  const personRows: PersonCardRow[] = useMemo(() => {
    if (!departmentId) return [];
    return (users ?? [])
      .filter((u) => u.departmentId === departmentId)
      .map((u): PersonCardRow => {
        const acc = newAcc();
        for (const t of tickets) if (t.assigneeId === u.id) addTicket(acc, t, now);
        for (const t of tasks) if (t.assigneeId === u.id || t.additionalAssigneeIds.includes(u.id)) addTask(acc, t);
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
          role: u.role,
          openTickets: acc.openTickets,
          openTasks: acc.openTasks,
          overdueItems: acc.overdueItems,
        };
      });
  }, [users, departmentId, tasks, tickets, now]);

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

  // The cards on screen as rows: the same numbers each card shows (summarizeCard), in the same order.
  const exportRows = (): TableRows => {
    const head = (name: string, second: string) => [
      name, second, 'Overall score %', 'Completion %', 'On time (of finished) %', 'Done', 'Due', 'Late', 'Not done', 'Checklist answers right %',
      'Open now: tickets', 'Open now: delegations', 'Open now: checklists', 'Overdue now', 'Missed checklists',
    ];
    const cells = (r: { overdueItems: OverdueItem[]; openTickets: number; openTasks: number }, row: Parameters<typeof summarizeCard>[0]) => {
      const n = summarizeCard(row, reportState);
      return [
        exportPct(n.score), exportPct(n.completion), exportPct(n.onTime), n.done, n.due, n.late, n.notDone, exportPct(n.compliance),
        r.openTickets, r.openTasks, n.openChecklists, r.overdueItems.length, n.missedChecklists,
      ];
    };
    return departmentId
      ? [head('Person', 'Role'), ...personRows.map((p) => [p.name, p.role, ...cells(p, scoresByPerson.get(p.id))])]
      : [head('Department', 'People'), ...departmentRows.map((d) => [d.name, d.headcount, ...cells(d, scoresByDepartment.get(d.id))])];
  };
  const exportMenu = !personId && (
    <ExportMenu
      disabled={isPending || reportState !== 'ready' || (departmentId ? personRows.length === 0 : departmentRows.length === 0)}
      aria-label={departmentId ? 'Export the people in this department' : 'Export the departments'}
      filename={departmentId ? 'team-overview-people' : 'team-overview-departments'}
      sheetName="Team Overview"
      title={exportTitle({
        what: departmentId ? `Team overview, ${selectedDepartment?.name ?? 'department'}, people` : 'Team overview, departments',
        from: range.from,
        to: range.to,
        period: TEAM_PERIOD_LABELS[period],
      })}
      getRows={exportRows}
    />
  );

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
          subtitle="Scores, open work and store checklists for every department and person."
          actions={
            <div className="hidden sm:flex items-center gap-3">
              <PeriodTabControl value={period} options={TEAM_PERIOD_KEYS} labels={TEAM_PERIOD_LABELS} onChange={setPeriod} />
              {exportMenu}
            </div>
          }
        />
        <PeriodTabControl value={period} options={TEAM_PERIOD_KEYS} labels={TEAM_PERIOD_LABELS} onChange={setPeriod} fill className="sm:hidden" />
        {/* The window in plain words, so nobody has to guess what a period means. Old numbers stay on screen
            (no dim) while the next period loads; the same line says so. */}
        <div className="flex flex-col gap-0.5">
          <p className="t-meta font-display font-semibold text-text-secondary">
            Showing {TEAM_PERIOD_LABELS[period].toLowerCase()}: {formatExportRange(range.from, range.to)}. Every period ends today.
          </p>
          <p className="t-meta font-display text-text-muted">
            Scores count what came due in this period, the same numbers as the Scorecard. Open now is today's open work, not part of any score.
          </p>
          {isRefreshing && <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These scores are for the previous period until this one loads.</p>}
        </div>
      </div>

      {/* Only shown once there's an actual trail: at the top level it would be a single,
          unclickable crumb that just repeats the title above it. */}
      {departmentId && <Breadcrumbs items={breadcrumbs} />}

      {/* Phone: the period row has no room left, so Export heads the list instead. */}
      {exportMenu && !loadFailed && !isPending && (
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <p className="t-meta font-display font-medium text-text-muted">
            {departmentId ? `${personRows.length} ${personRows.length === 1 ? 'person' : 'people'}` : `${departmentRows.length} ${departmentRows.length === 1 ? 'department' : 'departments'}`}
          </p>
          {exportMenu}
        </div>
      )}

      {/* The scores are a separate request from the open work, so a failure here is its own
          strip with Retry and the rest of the page keeps working. */}
      {reportState === 'error' && !personId && (
        <InlineError
          message="Could not load the scores. Open work below is still correct."
          onRetry={() => { void scores.refetch(); }}
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
                scores={scoresByDepartment.get(row.id)}
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
                scores={scoresByPerson.get(row.id)}
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
          tasks={periodWork.tasks.data ?? NO_TASKS}
          tickets={periodWork.tickets.data ?? NO_TICKETS}
          workLoading={periodWork.tasks.isPending || periodWork.tickets.isPending}
          period={period}
          range={range}
          scores={scoresByPerson.get(personId)}
          checklist={checklistByPerson.get(personId)}
          reportState={report.isError ? 'error' : report.data ? 'ready' : 'loading'}
          isRefreshing={isRefreshing || (!!report.data && report.isPlaceholderData)}
          onRetryReport={() => { void report.refetch(); }}
        />
      )}
    </div>
  );
};
