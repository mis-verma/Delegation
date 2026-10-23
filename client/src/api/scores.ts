import { apiFetch } from './http';

export type ScoreScope = 'person' | 'department' | 'store' | 'org';
export type TrendPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ChecklistScore {
  score: number | null;
  completionPct: number | null;
  compliancePct: number | null;
  onTimePct: number | null;
  onTimeOfFinishedPct?: number | null;
  metDeadlinePct?: number | null;
  onTime: number;
  due: number;
  completed: number;
  done?: number;
  missed: number;
  notDone?: number;
  late?: number;
  open?: number;
  submitted: number;
  approved: number;
  answersChecked?: number;
  weightedGood?: number;
  weightedScored?: number;
}
export interface TicketScore { score: number | null; completionPct: number | null; compliancePct: number | null; onTimePct: number | null; onTimeOfFinishedPct?: number | null; metDeadlinePct?: number | null; due: number; closed: number; done?: number; notDone?: number; onTime: number; late: number; waitingOnTime: number; reopened?: number }
export interface DelegationScore { score: number | null; completionPct: number | null; compliancePct: number | null; onTimePct: number | null; onTimeOfFinishedPct?: number | null; metDeadlinePct?: number | null; due: number; done: number; notDone?: number; onTime: number; late?: number; overdue: number; waitingOnTime: number }

export interface Scores {
  scope: ScoreScope;
  id: string;
  name: string;
  from: string;
  to: string;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
  overall?: number | null;
  totalDue?: number;
  rankable?: boolean;
}

export interface TrendBucket {
  label: string;
  from: string;
  to: string;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
  overall?: number | null;
}

export interface ScoreTrend {
  scope: ScoreScope;
  id: string;
  name: string;
  period: TrendPeriod;
  buckets: TrendBucket[];
}

export const NO_DEPARTMENT_ROW_ID = 'no-department';
export const NO_STORE_ROW_ID = 'no-store';
export const UNASSIGNED_ROW_ID = 'unassigned';

export interface ScoreReportRow {
  id: string;
  name: string;
  department: string;
  role?: string;
  left?: boolean;
  inactive?: boolean;
  overall?: number | null;
  totalDue?: number;
  rankable?: boolean;
  checklist: ChecklistScore;
  ticket: TicketScore;
  delegation: DelegationScore;
}

export interface ScoreReport {
  from: string;
  to: string;
  generatedAt: string;
  departments: ScoreReportRow[];
  people: ScoreReportRow[];
  stores: ScoreReportRow[];
  total?: ScoreReportRow;
  notes: string[];
}

export interface OrgCounts {
  stores: { active: number; inactive: number };
  departments: { active: number; inactive: number };
  employees: { active: number; joinedLast30Days: number };
  departmentsWithLead: number;
}

export type ExplorerView = 'department' | 'store' | 'person' | 'checklist' | 'module';
export type ExplorerModule = 'checklist' | 'ticket' | 'delegation';
export type ExplorerRowKind = ExplorerView | 'total' | 'unassigned';
export type ExplorerRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONCE' | 'all';

export interface ExplorerBlock {
  due: number;
  done: number;
  onTime: number;
  late: number;
  notDone: number;
  open: number;
  completion: number | null;
  compliance: number | null;
  onTimeOfFinishedPct: number | null;
  metDeadlinePct: number | null;
  score: number | null;
}
export interface ExplorerChecklistBlock extends ExplorerBlock { wGood: number; wScored: number; submitted: number; approved: number }
export interface ExplorerTicketBlock extends ExplorerBlock { waitingOnTime: number }
export interface ExplorerDelegationBlock extends ExplorerBlock { waitingOnTime: number; overdue: number }

export interface ExplorerRow {
  id: string;
  name: string;
  kind: ExplorerRowKind;
  parentId?: string;
  inactive?: boolean;
  left?: boolean;
  recurrence?: string;
  departmentId?: string | null;
  departmentName?: string;
  checklist: ExplorerChecklistBlock;
  ticket: ExplorerTicketBlock;
  delegation: ExplorerDelegationBlock;
  overall: number | null;
  totalDue: number;
  rankable: boolean;
  shared: { runsSharedWithOthers: number };
}

export interface ExplorerParent { id: string; kind: 'person' | 'department' | 'store'; name: string }

export interface ExplorerResponse {
  window: { from: string; to: string; asOf: string; requestedTo: string; capped: boolean };
  scope: { role: string; orgWide: boolean; departmentLocked: boolean; departmentId?: string; allDepartments: boolean };
  view: ExplorerView;
  parent: ExplorerParent | null;
  total: ExplorerRow;
  rows: ExplorerRow[];
  unassigned: ExplorerRow | null;
  sharing: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number };
  notes: string[];
}

export interface ExplorerParams {
  from: string;
  to: string;
  view: ExplorerView;
  storeId?: string;
  departmentId?: string;
  module?: ExplorerModule;
  recurrence?: ExplorerRecurrence;
  parentId?: string;
}

export type ConsistencyStatus = 'pass' | 'fail' | 'flag';
export interface ConsistencyCheck {
  id: string;
  label: string;
  expected: number;
  actual: number;
  diff: number;
  status: ConsistencyStatus;
  explanation: string;
}
export interface DataCheckResult { ok: boolean; from: string; to: string; failed: number; flagged: number; checks: ConsistencyCheck[] }

export const scoreApi = {
  orgCounts: () => apiFetch<{ success: boolean; data: OrgCounts }>('/scores/org-counts').then((r) => r.data),
  get: (params: { scope: ScoreScope; id?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: Scores }>(`/scores?${query.toString()}`).then((r) => r.data);
  },
  trend: (params: { scope: ScoreScope; id?: string; period: TrendPeriod; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, period: params.period, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: ScoreTrend }>(`/scores/trend?${query.toString()}`).then((r) => r.data);
  },
  report: (params: { from: string; to: string; stores?: boolean | 'only' }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.stores === 'only') query.set('stores', 'only');
    else if (params.stores) query.set('stores', '1');
    return apiFetch<{ success: boolean; data: ScoreReport }>(`/scores/report?${query.toString()}`).then((r) => r.data);
  },
  explorer: (params: ExplorerParams) => {
    const query = new URLSearchParams({ from: params.from, to: params.to, view: params.view });
    if (params.storeId) query.set('storeId', params.storeId);
    if (params.departmentId) query.set('departmentId', params.departmentId);
    if (params.module) query.set('module', params.module);
    if (params.recurrence && params.recurrence !== 'all') query.set('recurrence', params.recurrence);
    if (params.parentId) query.set('parentId', params.parentId);
    return apiFetch<{ success: boolean; data: ExplorerResponse }>(`/scores/explorer?${query.toString()}`).then((r) => r.data);
  },
  dataCheck: (params: { from: string; to: string }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return apiFetch<{ success: boolean; data: DataCheckResult }>(`/scores/data-check?${query.toString()}`).then((r) => r.data);
  },
};
