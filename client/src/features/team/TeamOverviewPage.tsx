import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Building2 } from 'lucide-react';
import { useTicketsQuery, useDepartmentsQuery } from '../tickets/hook';
import { useTasksQuery } from '../tasks/hook';
import { useUsersQuery } from '../admin/hook';
import { Skeleton } from '../../components';
import { Breadcrumbs, type BreadcrumbTrailItem } from '../../components/breadcrumbs';
import { DepartmentCard, type DepartmentCardRow, type OverdueItem } from './DepartmentCard';
import { PersonCard, type PersonCardRow } from './PersonCard';
import { PersonChecklistView } from './PersonChecklistView';

// Department -> Person -> Checklist drill-down for ADMIN/PC (both have full org-wide access —
// see App.tsx's AdminRoute). State lives in the URL (departmentId/personId) rather than plain
// useState so back/forward and refresh land on the same drill-down level instead of always
// resetting to the department grid (the same bug class fixed on the Tasks filters — see
// TaskList.tsx's syncFiltersToUrl).
export const TeamOverviewPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('departmentId');
  const personId = searchParams.get('personId');

  const { data: departments, isPending: departmentsPending } = useDepartmentsQuery();
  const { data: users, isPending: usersPending } = useUsersQuery(true);
  const { data: ticketPage, isPending: ticketsPending } = useTicketsQuery(1, 100);
  const { data: tasks, isPending: tasksPending } = useTasksQuery();

  const tickets = useMemo(() => ticketPage?.data ?? [], [ticketPage]);
  const isPending = departmentsPending || usersPending || ticketsPending || tasksPending;

  // "now" only needs to be approximately current for the overdue checks below; memoized so
  // it's read once per mount, not on every render (see HomePage.tsx for the same pattern).
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  // Completion rate = closed tickets + done tasks, over every ticket/task ever raised — not just
  // the still-open ones the rest of the card counts. `null` (not 0%) when there's nothing to
  // measure, matching the Dashboard Compliance gauges' "no data" convention rather than reading a
  // department/person with zero history as a 0% failure.
  const departmentRows: DepartmentCardRow[] = useMemo(() => (departments ?? []).map(dept => {
    const deptTickets = tickets.filter(t => t.departmentId === dept.id);
    const deptTasks = (tasks ?? []).filter(t => t.departmentId === dept.id);
    const completionCount = deptTickets.filter(t => t.status === 'CLOSED').length + deptTasks.filter(t => t.status === 'done').length;
    const completionTotal = deptTickets.length + deptTasks.length;
    const overdueTickets = deptTickets.filter(t => t.status !== 'CLOSED' && t.tatDueAt && new Date(t.tatDueAt).getTime() < now);
    const overdueTasks = deptTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate).getTime() < now);

    return {
      id: dept.id,
      name: dept.name,
      headcount: (users ?? []).filter(u => u.departmentId === dept.id).length,
      openTickets: deptTickets.filter(t => t.status !== 'CLOSED').length,
      openTasks: deptTasks.filter(t => t.status !== 'done').length,
      overdue: overdueTickets.length + overdueTasks.length,
      overdueItems: [
        ...overdueTickets.map((t): OverdueItem => ({ id: t.id, title: t.title, link: `/tickets?open=${t.id}`, kind: 'ticket' })),
        ...overdueTasks.map((t): OverdueItem => ({ id: t.id, title: t.title, link: `/tasks?open=${t.id}`, kind: 'task' })),
      ],
      completionRate: completionTotal > 0 ? Math.round((completionCount / completionTotal) * 100) : null,
      completionCount,
      completionTotal,
    };
  }), [departments, users, tickets, tasks, now]);

  const selectedDepartment = departmentRows.find(d => d.id === departmentId);

  const personRows: PersonCardRow[] = useMemo(() => (users ?? [])
    .filter(u => u.departmentId === departmentId)
    .map((u): PersonCardRow => {
      const personTickets = tickets.filter(t => t.assigneeId === u.id || t.userId === u.id);
      const personTasks = (tasks ?? []).filter(t => t.assigneeId === u.id || t.userId === u.id);
      const completionCount = personTickets.filter(t => t.status === 'CLOSED').length + personTasks.filter(t => t.status === 'done').length;
      const completionTotal = personTickets.length + personTasks.length;
      const overdueTickets = personTickets.filter(t => t.status !== 'CLOSED' && t.tatDueAt && new Date(t.tatDueAt).getTime() < now);
      const overdueTasks = personTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate).getTime() < now);

      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        role: u.role,
        openTickets: personTickets.filter(t => t.status !== 'CLOSED').length,
        openTasks: personTasks.filter(t => t.status !== 'done').length,
        overdue: overdueTickets.length + overdueTasks.length,
        overdueItems: [
          ...overdueTickets.map((t): OverdueItem => ({ id: t.id, title: t.title, link: `/tickets?open=${t.id}`, kind: 'ticket' })),
          ...overdueTasks.map((t): OverdueItem => ({ id: t.id, title: t.title, link: `/tasks?open=${t.id}`, kind: 'task' })),
        ],
        completionRate: completionTotal > 0 ? Math.round((completionCount / completionTotal) * 100) : null,
        completionCount,
        completionTotal,
      };
    }), [users, departmentId, tickets, tasks, now]);

  const selectedPerson = personRows.find(p => p.id === personId);

  const openDepartment = (id: string) => setSearchParams({ departmentId: id });
  const openPerson = (id: string) => setSearchParams({ departmentId: departmentId ?? '', personId: id });

  const totalHeadcount = departmentRows.reduce((sum, d) => sum + d.headcount, 0);

  // Replaces the old "← All departments" / "← Back to X" text-links scattered across all three
  // drill-down levels, plus the subtitle line that restated where you were in prose — one trail,
  // always visible, every level a click back instead of a page-specific back button to remember.
  const breadcrumbs: BreadcrumbTrailItem[] = [
    { label: 'Team Overview', to: departmentId ? '/team' : undefined },
    ...(departmentId ? [{ label: selectedDepartment?.name ?? '…', to: personId ? `/team?departmentId=${departmentId}` : undefined }] : []),
    ...(personId ? [{ label: selectedPerson?.name ?? '…' }] : []),
  ];

  return (
    // w-full max-w-(--container-width), not a page-local max-w-6xl — the narrower fixed width
    // this page used to set on its own left this the one page in the app sitting noticeably
    // narrower than its siblings (Tasks/Tickets/Todo/Checklists all share the wider token).
    <div className="flex flex-col gap-4 w-full max-w-(--container-width) mx-auto pb-10">
      {/* Compact header — icon tile + title + count badge, breadcrumb trail directly below
          doubling as both "where am I" and every level's back-navigation. */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/10 to-primary-700/10 dark:from-primary-500/20 dark:to-primary-700/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20 shrink-0">
          <Building2 className="w-4.5 h-4.5" />
        </div>
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight text-text">Team Overview</h1>
          {!departmentsPending && (
            <span className="flex items-center justify-center px-2 py-0.5 text-xs font-display font-bold bg-surface-hover text-text-secondary rounded-full border border-border">
              {totalHeadcount}
            </span>
          )}
        </div>
      </div>

      {/* Only shown once there's an actual trail — at the top level it would be a single,
          unclickable crumb that just repeats the h1 above it with no navigational value. */}
      {departmentId && <Breadcrumbs items={breadcrumbs} />}

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : !departmentId ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {departmentRows.map(row => (
            <DepartmentCard key={row.id} row={row} onClick={() => openDepartment(row.id)} />
          ))}
        </div>
      ) : !personId ? (
        personRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-border/70 rounded-2xl bg-surface/30 text-center">
            <p className="text-sm font-display font-medium text-text-muted">No one is assigned to this department yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {personRows.map(row => (
              <PersonCard key={row.id} row={row} onClick={() => openPerson(row.id)} />
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
        />
      )}
    </div>
  );
};
