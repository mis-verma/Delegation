import { apiFetch } from './http';

export type ScoreScope = 'person' | 'department' | 'store' | 'org';
export type TrendPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ChecklistScore {
  score: number | null;
  completionPct: number | null;
  compliancePct: number | null;
  /** Of the runs that were finished, the share finished on time (same as onTimeOfFinishedPct). */
  onTimePct: number | null;
  onTimeOfFinishedPct?: number | null;
  /** Finished on time out of everything due: late and missed both count against it. */
  metDeadlinePct?: number | null;
  onTime: number;
  /** Runs that have come due: finished, or past their deadline. Runs still ahead are left out. */
  due: number;
  completed: number;
  done?: number;
  missed: number;
  notDone?: number;
  /** Finished, but after the cutoff. */
  late?: number;
  /** Still open before the cutoff: in no percentage. */
  open?: number;
  submitted: number;
  approved: number;
  answersChecked?: number;
  weightedGood?: number;
  weightedScored?: number;
}
/**
 * Completion is the share of due items done; compliance is the share handed in on time (finished, or
 * waiting for approval). `late` is tickets closed after their due time; tickets still open are "not done"
 * (due - closed), never also late. `waitingOnTime` is handed in on time and still waiting for approval:
 * counted in compliance, not in completion.
 */
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
  /** Completion and compliance of every module with something due, counted equally (server figure, one decimal). */
  overall?: number | null;
  totalDue?: number;
  /** At least 5 items due across the modules: safe to rank. */
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

/** Catch-all rows the report adds so totals add up: work with no department, and work with no assignee. */
export const NO_DEPARTMENT_ROW_ID = 'no-department';
export const UNASSIGNED_ROW_ID = 'unassigned';

export interface ScoreReportRow {
  id: string;
  name: string;
  department: string;
  role?: string;
  /** A person who has since left: their name already ends in "(left)". */
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
  /** Only filled when asked for (`stores: true`) and only for Admin and PC. */
  stores: ScoreReportRow[];
  /** Everything in the window in one row, each run, ticket and delegation counted once. Absent when only the stores were asked for. */
  total?: ScoreReportRow;
  notes: string[];
}

export interface OrgCounts {
  stores: { active: number; inactive: number };
  departments: { active: number; inactive: number };
  employees: { active: number; joinedLast30Days: number };
  /** Active departments with an active Manager or Senior. */
  departmentsWithLead: number;
}

// ---------------------------------------------------------------------------------------------
// Score Explorer: one call for every way of cutting the scores (GET /scores/explorer)
// ---------------------------------------------------------------------------------------------

export type ExplorerView = 'department' | 'store' | 'person' | 'checklist' | 'module';
export type ExplorerModule = 'checklist' | 'ticket' | 'delegation';
export type ExplorerRowKind = ExplorerView | 'total' | 'unassigned';
/** ONCE is the one-time checklist; 'all' means every kind. */
export type ExplorerRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONCE' | 'all';

/** The figures every module carries under the same names. */
export interface ExplorerBlock {
  due: number;
  done: number;
  onTime: number;
  /** Done, but after the deadline. */
  late: number;
  /** due - done. */
  notDone: number;
  /** Still ahead of the deadline and not done: in no percentage. */
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
  /** Store switched off but still with work. */
  inactive?: boolean;
  /** A person who has left. */
  left?: boolean;
  /** Checklist rows only. */
  recurrence?: string;
  /** Person rows only: the person's current department. */
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
  /** The window actually scored: `to` is capped at today. */
  window: { from: string; to: string; asOf: string; requestedTo: string; capped: boolean };
  scope: { role: string; orgWide: boolean; departmentLocked: boolean; departmentId?: string };
  view: ExplorerView;
  parent: ExplorerParent | null;
  total: ExplorerRow;
  rows: ExplorerRow[];
  unassigned: ExplorerRow | null;
  /** Checklist runs in the total that are shared or unassigned: why departments or people may not add up to it. */
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

/** `from` and `to` are calendar days, YYYY-MM-DD, both included. A person without `id` is the caller. */
export const scoreApi = {
  /** The four counts behind the Overview's organisation tiles (Admin and PC). */
  orgCounts: () => apiFetch<{ success: boolean; data: OrgCounts }>('/scores/org-counts').then((r) => r.data),
  get: (params: { scope: ScoreScope; id?: string; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: Scores }>(`/scores?${query.toString()}`).then((r) => r.data);
  },
  /** The same scores cut into a few buckets over the window, for the Trend view. */
  trend: (params: { scope: ScoreScope; id?: string; period: TrendPeriod; from: string; to: string }) => {
    const query = new URLSearchParams({ scope: params.scope, period: params.period, from: params.from, to: params.to });
    if (params.id) query.set('id', params.id);
    return apiFetch<{ success: boolean; data: ScoreTrend }>(`/scores/trend?${query.toString()}`).then((r) => r.data);
  },
  /**
   * Every department and person the caller may see (Admin, PC, department heads). `stores: true` adds every
   * store, `stores: 'only'` returns the stores alone (Admin and PC), so the store view loads on its own.
   */
  report: (params: { from: string; to: string; stores?: boolean | 'only' }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.stores === 'only') query.set('stores', 'only');
    else if (params.stores) query.set('stores', '1');
    return apiFetch<{ success: boolean; data: ScoreReport }>(`/scores/report?${query.toString()}`).then((r) => r.data);
  },
  /** One call for every cut of the scores (department, store, person, checklist, module). Admin and PC: the organisation; Manager and Senior: their department. */
  explorer: (params: ExplorerParams) => {
    const query = new URLSearchParams({ from: params.from, to: params.to, view: params.view });
    if (params.storeId) query.set('storeId', params.storeId);
    if (params.departmentId) query.set('departmentId', params.departmentId);
    if (params.module) query.set('module', params.module);
    if (params.recurrence && params.recurrence !== 'all') query.set('recurrence', params.recurrence);
    if (params.parentId) query.set('parentId', params.parentId);
    return apiFetch<{ success: boolean; data: ExplorerResponse }>(`/scores/explorer?${query.toString()}`).then((r) => r.data);
  },
  /** Proves the cuts of the same numbers add up (Admin and PC). */
  dataCheck: (params: { from: string; to: string }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return apiFetch<{ success: boolean; data: DataCheckResult }>(`/scores/data-check?${query.toString()}`).then((r) => r.data);
  },
};
