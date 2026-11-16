import type { LucideIcon } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { CATEGORY_ICON } from '../categoryLook';
import type { BoardTone } from '../boardTypes';

export type ModuleKey = 'todo' | 'tickets' | 'delegation' | 'checklist' | 'approvals';
export type StatusKey = 'pending' | 'delayed' | 'due' | 'missed' | 'completed' | 'total';
export type ApprovalParam = 'delegation' | 'tickets' | 'checklist';
export type RowTone = 'neutral' | 'danger' | 'success';

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

export const STATUS_LABEL: Record<StatusKey, string> = {
  pending: 'Pending',
  delayed: 'Delayed',
  due: 'Due',
  missed: 'Missed',
  completed: 'Completed',
  total: 'Total',
};

export const STATUS_TONE: Record<StatusKey, RowTone> = {
  pending: 'neutral',
  delayed: 'danger',
  due: 'neutral',
  missed: 'danger',
  completed: 'success',
  total: 'neutral',
};

type CountField = 'pending' | 'overdue' | 'due' | 'missed' | 'completed' | 'total';

export const COUNT_FIELD: Record<StatusKey, CountField> = {
  pending: 'pending',
  delayed: 'overdue',
  due: 'due',
  missed: 'missed',
  completed: 'completed',
  total: 'total',
};

type ApprovalField = 'pending' | 'old' | 'fresh';

export const APPROVAL_STATUS_FIELD: Partial<Record<StatusKey, ApprovalField>> = { pending: 'pending', delayed: 'old', due: 'fresh', total: 'pending' };

export const APPROVAL_PARAMS: readonly { key: ApprovalParam; label: string }[] = [
  { key: 'delegation', label: 'Delegation' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'checklist', label: 'Checklists' },
];

export const VIEWER = 'viewer';

type ParamMap = { name: string; values: Partial<Record<StatusKey | ApprovalParam, string>> };

export interface RouteQuery {
  status?: ParamMap;
  sub?: ParamMap;
  solo?: { name: string; value: string };
}

interface ModuleSchema {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  tone: BoardTone;
  route: string;
  teamRoute?: string;
  routes: Record<string, RouteQuery>;
  statuses: readonly StatusKey[];
  statusLabels?: Partial<Record<StatusKey, string>>;
  totalLabel: string;
}

const QUICK: ParamMap = { name: 'quickFilter', values: { pending: 'pending', delayed: 'delayed', due: 'due', completed: 'completed', total: 'all' } };

const CHECKLIST_SOLO: ParamMap = { name: 'status', values: { pending: 'pending', due: 'due', delayed: 'overdue', completed: 'completed' } };

const CHECKLIST_TEAM: ParamMap = { name: 'status', values: { pending: 'pending', due: 'due', delayed: 'overdue', completed: 'completed', total: 'all' } };

const QUEUE_TABS: ParamMap = { name: 'tab', values: { delegation: 'delegations', tickets: 'tickets', checklist: 'checklists' } };

export const MODULE_STATS_SCHEMA: Readonly<Record<ModuleKey, ModuleSchema>> = {
  todo: {
    key: 'todo', label: 'To-do', icon: CATEGORY_ICON.todo, tone: 'primary',
    route: STAT_ROUTES.todo,
    routes: { [STAT_ROUTES.todo]: { status: QUICK } },
    statuses: ['pending', 'delayed', 'due', 'completed'],
    totalLabel: 'Total to-dos',
  },
  tickets: {
    key: 'tickets', label: 'Tickets', icon: CATEGORY_ICON.ticket, tone: 'coral',
    route: STAT_ROUTES.ticket,
    routes: { [STAT_ROUTES.ticket]: { status: QUICK, solo: { name: 'assigneeIds', value: VIEWER } } },
    statuses: ['pending', 'delayed', 'due', 'completed'],
    totalLabel: 'Total tickets',
  },
  delegation: {
    key: 'delegation', label: 'Delegation', icon: CATEGORY_ICON.delegation, tone: 'success',
    route: STAT_ROUTES.delegation,
    routes: { [STAT_ROUTES.delegation]: { status: QUICK, solo: { name: 'mine', value: '1' } } },
    statuses: ['pending', 'delayed', 'due', 'completed'],
    totalLabel: 'Total delegated',
  },
  checklist: {
    key: 'checklist', label: 'Checklists', icon: CATEGORY_ICON.checklist, tone: 'primary',
    route: STAT_ROUTES.checklist,
    teamRoute: STAT_ROUTES.checklistTeam,
    routes: { [STAT_ROUTES.checklist]: { status: CHECKLIST_SOLO }, [STAT_ROUTES.checklistTeam]: { status: CHECKLIST_TEAM } },
    statuses: ['pending', 'delayed', 'due', 'completed'],
    totalLabel: 'Total today',
  },
  approvals: {
    key: 'approvals', label: 'Approvals', icon: ShieldCheck, tone: 'danger',
    route: STAT_ROUTES.approvalQueue,
    routes: {
      [STAT_ROUTES.approvalQueue]: { status: { name: 'age', values: { delayed: '1' } }, sub: QUEUE_TABS },
      [STAT_ROUTES.headApprovals]: { sub: { name: QUEUE_TABS.name, values: { checklist: 'checklists' } } },
    },
    statuses: ['pending', 'delayed', 'due'],
    statusLabels: { due: 'New' },
    totalLabel: 'Total approvals',
  },
};

export const SCOPE_MODULES: Readonly<Record<'overall' | 'mine', readonly ModuleKey[]>> = {
  overall: ['tickets', 'delegation', 'checklist', 'approvals'],
  mine: ['todo', 'tickets', 'delegation', 'checklist'],
};

export const SUMMARY_MODULES: readonly ModuleKey[] = ['delegation', 'tickets', 'checklist', 'todo'];

export const APPROVALS_LABEL = 'Approvals';

export type StatsView = 'work' | 'attention';

interface StatsViewSchema {
  heading: string;
  summaryLabel: string;
  summaryCaption: string;
  summaryStatus: StatusKey;
  statuses?: Partial<Record<ModuleKey, readonly StatusKey[]>>;
  totalStatus: Partial<Record<ModuleKey, StatusKey>> & { default: StatusKey };
  totalLabels?: Partial<Record<ModuleKey, string>>;
}

export const STATS_VIEW_SCHEMA: Readonly<Record<StatsView, StatsViewSchema>> = {
  work: {
    heading: 'Numbers today',
    summaryLabel: 'Total',
    summaryCaption: 'Everything in this view',
    summaryStatus: 'total',
    totalStatus: { default: 'total' },
  },
  attention: {
    heading: 'Needs attention',
    summaryLabel: 'Needs action',
    summaryCaption: 'Past the deadline or waiting for you',
    summaryStatus: 'delayed',
    statuses: {
      todo: ['delayed', 'due'],
      tickets: ['delayed', 'due'],
      delegation: ['delayed', 'due'],
      checklist: ['delayed', 'pending'],
      approvals: ['pending', 'delayed'],
    },
    totalStatus: { default: 'delayed', approvals: 'pending' },
    totalLabels: { todo: 'Past deadline', tickets: 'Past deadline', delegation: 'Past deadline', checklist: 'Past deadline', approvals: 'Waiting for you' },
  },
};
