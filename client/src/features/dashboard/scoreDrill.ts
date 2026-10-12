import { ORG_TZ_OFFSET_MS } from '../checklist/checklistDisplay';
import type { ScorePeriod } from './scorePeriods';

// Links from a score to the exact items behind it. A score counts what came DUE in its window (org
// days), so every link carries that window as a due range plus the subject (person, department or
// store), and the filter that matches the count: "late" (finished after the deadline) or "not done".
// The lists read these params (TicketList, TaskList, ChecklistHistory, ChecklistWeeklyReport).

export type DrillSubject = { kind: 'person' | 'department' | 'store' | 'org'; id?: string };
export type DrillKind = 'late' | 'notDone';

const DAY_MS = 86_400_000;

/** The instants an org-day window covers: [start of `from`, start of the day after `to`). */
export const orgDayWindow = (from: string, to: string) => ({
  start: new Date(Date.parse(`${from}T00:00:00.000Z`) - ORG_TZ_OFFSET_MS).toISOString(),
  end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - ORG_TZ_OFFSET_MS).toISOString(),
});

const withDue = (params: URLSearchParams, from: string, to: string) => {
  const { start, end } = orgDayWindow(from, to);
  params.set('dueFrom', start);
  params.set('dueTo', end);
};

/** Tickets due in the window for the subject: closed late, or not closed yet. */
export const ticketDrillHref = (orgWide: boolean, subject: DrillSubject, from: string, to: string, kind: DrillKind) => {
  const params = new URLSearchParams();
  if (subject.kind === 'person' && subject.id) params.set('assigneeIds', subject.id);
  if (subject.kind === 'department' && subject.id) params.set('departmentId', subject.id);
  if (subject.kind === 'store' && subject.id) params.set('storeId', subject.id);
  withDue(params, from, to);
  params.set('sla', kind === 'late' ? 'closed_late' : 'not_done');
  return `${orgWide ? '/admin/tickets' : '/tickets'}?${params.toString()}`;
};

/** Delegations due in the window for the subject: done late, or overdue (not done, not handed in). */
export const delegationDrillHref = (subject: DrillSubject, from: string, to: string, kind: DrillKind) => {
  const params = new URLSearchParams();
  if (subject.kind === 'person' && subject.id) params.set('assigneeIds', subject.id);
  if (subject.kind === 'department' && subject.id) params.set('departmentId', subject.id);
  // The list's store filter follows the delegation's department, and so does the store score
  // (departments of that store), so this link opens exactly the delegations the figure counted.
  if (subject.kind === 'store' && subject.id) params.set('storeId', subject.id);
  params.set('category', 'delegation');
  withDue(params, from, to);
  if (kind === 'late') params.set('sla', 'done_late');
  else params.set('quickFilter', 'delayed');
  return `/tasks?${params.toString()}`;
};

/**
 * Checklist runs for the subject in the window. A person or a store opens the history list of their
 * runs (not finished for "not done"); a department opens the fill report on that department, on the
 * same period when one is known.
 */
export const checklistDrillHref = (orgWide: boolean, subject: DrillSubject, from: string, to: string, kind: DrillKind, period?: { period: ScorePeriod; offset: number }) => {
  if (subject.kind === 'department' && subject.id) {
    const params = new URLSearchParams({ departmentId: subject.id });
    if (period) {
      params.set('period', period.period);
      params.set('offset', String(period.offset));
    }
    return `${orgWide ? '/admin/checklist-weekly' : '/checklists/weekly'}?${params.toString()}`;
  }
  const params = new URLSearchParams({ tab: 'checklists', from, to });
  if (subject.kind === 'person' && subject.id) params.set('person', subject.id);
  if (subject.kind === 'store' && subject.id) params.set('store', subject.id);
  params.set('status', kind === 'late' ? 'COMPLETED' : 'OVERDUE');
  return `/checklists/history?${params.toString()}`;
};

/** Delegations past their due date and not done, right now (the live "behind" count), for the people the viewer can see. */
export const overdueDelegationsHref = () => '/tasks?category=delegation&quickFilter=delayed';

/** The Scorecard opened on one row, for the same window. */
export const scorecardRowHref = (view: 'person' | 'department' | 'store', id: string, from: string, to: string) =>
  `/admin/scorecard?${new URLSearchParams({ view, open: id, from, to }).toString()}`;
