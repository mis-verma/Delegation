import { ORG_TZ_OFFSET_MS } from '../checklist/checklistDisplay';
import type { ScorePeriod } from './scorePeriods';

export type DrillSubject = { kind: 'person' | 'department' | 'store' | 'org'; id?: string };
export type DrillKind = 'late' | 'notDone';

const DAY_MS = 86_400_000;

export const orgDayWindow = (from: string, to: string) => ({
  start: new Date(Date.parse(`${from}T00:00:00.000Z`) - ORG_TZ_OFFSET_MS).toISOString(),
  end: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS - ORG_TZ_OFFSET_MS).toISOString(),
});

const withDue = (params: URLSearchParams, from: string, to: string) => {
  const { start, end } = orgDayWindow(from, to);
  params.set('dueFrom', start);
  params.set('dueTo', end);
};

export const ticketDrillHref = (orgWide: boolean, subject: DrillSubject, from: string, to: string, kind: DrillKind) => {
  const params = new URLSearchParams();
  if (subject.kind === 'person' && subject.id) params.set('assigneeIds', subject.id);
  if (subject.kind === 'department' && subject.id) params.set('departmentId', subject.id);
  if (subject.kind === 'store' && subject.id) params.set('storeId', subject.id);
  withDue(params, from, to);
  params.set('sla', kind === 'late' ? 'closed_late' : 'not_done');
  return `${orgWide ? '/admin/tickets' : '/tickets'}?${params.toString()}`;
};

export const delegationDrillHref = (subject: DrillSubject, from: string, to: string, kind: DrillKind) => {
  const params = new URLSearchParams();
  if (subject.kind === 'person' && subject.id) params.set('assigneeIds', subject.id);
  if (subject.kind === 'department' && subject.id) params.set('departmentId', subject.id);
  if (subject.kind === 'store' && subject.id) params.set('storeId', subject.id);
  params.set('category', 'work');
  withDue(params, from, to);
  if (kind === 'late') params.set('sla', 'done_late');
  else params.set('quickFilter', 'delayed');
  return `/tasks?${params.toString()}`;
};

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

export const overdueDelegationsHref = () => '/tasks?category=work&quickFilter=delayed';

const DRILL_VIEW = { person: 'checklist', department: 'person', store: 'department' } as const;

export const scorecardRowHref = (view: 'person' | 'department' | 'store', id: string, from: string, to: string) =>
  `/admin/scores?${new URLSearchParams({ view: DRILL_VIEW[view], trail: JSON.stringify([{ id, kind: view, name: '' }]), from, to }).toString()}`;
