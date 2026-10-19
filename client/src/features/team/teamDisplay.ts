
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

export interface OverdueItem {
  id: string;
  title: string;
  link: string;
  kind: 'ticket' | 'task';
}

export type TeamPeriod = 'today' | 'week' | 'month' | 'last30';

export interface TeamPeriodRange {
  from: string;
  to: string;
  startMs: number;
  endMs: number;
}

const isInTeamPeriod = (createdAt: string, range: Pick<TeamPeriodRange, 'startMs'>) =>
  Date.parse(createdAt) >= range.startMs;

export const selectPersonWork = (
  tasks: Task[],
  tickets: Ticket[],
  personId: string,
  departmentId: string,
  range: Pick<TeamPeriodRange, 'startMs'>,
) => ({
  tasks: tasks.filter((t) =>
    (!departmentId || t.departmentId === departmentId)
    && t.status !== 'draft'
    && (t.assigneeId === personId || t.userId === personId || t.additionalAssigneeIds.includes(personId))
    && isInTeamPeriod(t.createdAt, range)),
  tickets: tickets.filter((t) =>
    (!departmentId || t.departmentId === departmentId)
    && (t.assigneeId === personId || t.userId === personId)
    && isInTeamPeriod(t.createdAt, range)),
});

export type ReportState = 'loading' | 'error' | 'ready';

export interface CardNumbers {
  score: number | null;
  completion: number | null;
  onTime: number | null;
  done: number;
  due: number;
  late: number;
  notDone: number;
  compliance: number | null;
  missedChecklists: number;
  openChecklists: number | null;
}
