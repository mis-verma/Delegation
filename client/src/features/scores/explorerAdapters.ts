import type { ChecklistScore, DelegationScore, ExplorerRow, ScoreReportRow, ScoreScope, Scores, TicketScore } from '../../api/scores';

const checklistFromRow = (row: ExplorerRow): ChecklistScore => {
  const c = row.checklist;
  return {
    score: c.score,
    completionPct: c.completion,
    compliancePct: c.compliance,
    onTimePct: c.onTimeOfFinishedPct,
    onTimeOfFinishedPct: c.onTimeOfFinishedPct,
    metDeadlinePct: c.metDeadlinePct,
    onTime: c.onTime,
    due: c.due,
    completed: c.done,
    done: c.done,
    missed: c.notDone,
    notDone: c.notDone,
    late: c.late,
    open: c.open,
    submitted: c.submitted,
    approved: c.approved,
    weightedGood: c.wGood,
    weightedScored: c.wScored,
  };
};

const ticketFromRow = (row: ExplorerRow): TicketScore => {
  const t = row.ticket;
  return {
    score: t.score,
    completionPct: t.completion,
    compliancePct: t.compliance,
    onTimePct: t.onTimeOfFinishedPct,
    onTimeOfFinishedPct: t.onTimeOfFinishedPct,
    metDeadlinePct: t.metDeadlinePct,
    due: t.due,
    closed: t.done,
    done: t.done,
    notDone: t.notDone,
    onTime: t.onTime,
    late: t.late,
    waitingOnTime: t.waitingOnTime,
  };
};

const delegationFromRow = (row: ExplorerRow): DelegationScore => {
  const d = row.delegation;
  return {
    score: d.score,
    completionPct: d.completion,
    compliancePct: d.compliance,
    onTimePct: d.onTimeOfFinishedPct,
    onTimeOfFinishedPct: d.onTimeOfFinishedPct,
    metDeadlinePct: d.metDeadlinePct,
    due: d.due,
    done: d.done,
    notDone: d.notDone,
    onTime: d.onTime,
    late: d.late,
    overdue: d.overdue,
    waitingOnTime: d.waitingOnTime,
  };
};

export const explorerRowToScores = (row: ExplorerRow, scope: ScoreScope, win: { from: string; to: string }): Scores => ({
  scope,
  id: row.id,
  name: row.name,
  from: win.from,
  to: win.to,
  checklist: checklistFromRow(row),
  ticket: ticketFromRow(row),
  delegation: delegationFromRow(row),
  overall: row.overall,
  totalDue: row.totalDue,
  rankable: row.rankable,
});

export const explorerRowToReportRow = (row: ExplorerRow): ScoreReportRow => ({
  id: row.id,
  name: row.name,
  department: row.departmentName ?? '',
  ...(row.left ? { left: true } : {}),
  ...(row.inactive ? { inactive: true } : {}),
  overall: row.overall,
  totalDue: row.totalDue,
  rankable: row.rankable,
  checklist: checklistFromRow(row),
  ticket: ticketFromRow(row),
  delegation: delegationFromRow(row),
});
