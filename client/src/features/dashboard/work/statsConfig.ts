import type { WorkMetric } from '../../../api/dashboard';

export const STAT_ROUTES = {
  work: '/work',
  delegation: '/tasks',
  ticket: '/tickets',
  checklist: '/checklists',
  checklistTeam: '/checklists/team',
  todo: '/todo',
  approvalQueue: '/verify',
  headApprovals: '/tickets/approvals',
} as const;

export type ApprovalParam = 'delegation' | 'tickets' | 'checklist';

export interface ApprovalParamConfig {
  key: ApprovalParam;
  label: string;
  queueTab: 'delegations' | 'tickets' | 'checklists';
}

export const APPROVAL_PARAMS: readonly ApprovalParamConfig[] = [
  { key: 'delegation', label: 'Delegation', queueTab: 'delegations' },
  { key: 'tickets', label: 'Tickets', queueTab: 'tickets' },
  { key: 'checklist', label: 'Checklists', queueTab: 'checklists' },
];

export type ApprovalField = 'pending' | 'old' | 'fresh';

export const APPROVAL_FIELD: Record<WorkMetric, ApprovalField> = { total: 'pending', pending: 'pending', delayed: 'old', due: 'fresh' };

export const APPROVALS_LABEL = 'Approvals';

export const QUEUE_PARAM = { tab: 'tab', age: 'age', olderThanDay: '1' } as const;

export const BREAKDOWN_SHORT_LABEL: Record<string, string> = { 'Checklists, today': 'Checklists' };
