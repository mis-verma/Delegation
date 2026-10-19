import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ExplorerRow } from '../../api/scores';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { useUsersQuery } from '../admin/hook';
import { PersonChecklistView } from '../team/PersonChecklistView';
import type { ReportState, TeamPeriodRange } from '../team/teamDisplay';
import { useTeamChecklistReport } from '../team/useTeamChecklistReport';
import { useTeamPeriodWork } from '../team/useTeamWork';
import { useDepartmentsQuery } from '../tickets/hook';
import { orgDayWindow } from '../dashboard/scoreDrill';
import { explorerRowToReportRow } from './explorerAdapters';

const NO_TASKS: Task[] = [];
const NO_TICKETS: Ticket[] = [];

interface PersonDetailSectionProps {
  personId: string;
  personName: string;
  departmentFromTrail?: string;
  total: ExplorerRow;
  from: string;
  to: string;
  windowLabel: string;
}

export const PersonDetailSection = ({ personId, personName, departmentFromTrail, total, from, to, windowLabel }: PersonDetailSectionProps) => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC';
  const range = useMemo<TeamPeriodRange>(() => {
    const w = orgDayWindow(from, to);
    return { from, to, startMs: Date.parse(w.start), endMs: Date.parse(w.end) - 1 };
  }, [from, to]);

  const users = useUsersQuery(orgWide && !departmentFromTrail);
  const departmentId = departmentFromTrail ?? (orgWide ? users.data?.find((u) => u.id === personId)?.departmentId : user?.departmentId) ?? '';
  const departments = useDepartmentsQuery();
  const departmentName = departments.data?.find((d) => d.id === departmentId)?.name ?? 'department';

  const report = useTeamChecklistReport(range, true);
  const periodWork = useTeamPeriodWork(range, true);
  const checklist = useMemo(() => report.data?.people.find((p) => p.userId === personId), [report.data, personId]);
  const scores = useMemo(() => explorerRowToReportRow(total), [total]);
  const reportState: ReportState = report.isError ? 'error' : report.data ? 'ready' : 'loading';

  return (
    <PersonChecklistView
      personName={personName}
      departmentName={departmentName}
      departmentId={departmentId}
      personId={personId}
      tasks={periodWork.tasks.data ?? NO_TASKS}
      tickets={periodWork.tickets.data ?? NO_TICKETS}
      workLoading={periodWork.tasks.isPending || periodWork.tickets.isPending}
      periodLabel={windowLabel}
      periodPhrase={`from ${windowLabel}`}
      range={range}
      scores={total.totalDue > 0 ? scores : undefined}
      checklist={checklist}
      reportState={reportState}
      isRefreshing={!!report.data && report.isPlaceholderData}
      onRetryReport={() => { void report.refetch(); }}
    />
  );
};
