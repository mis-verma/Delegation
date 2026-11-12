import { apiFetch, type SummaryScope } from "./http";
import type { TaskSummary } from "./task";
import type { TicketSummary } from "./ticket";
import type { TodoSummary } from "./todos";
import type { ChecklistInstanceSummary } from "./checklistInstances";

type ApiResponse<T> = { success: boolean; data: T };

export type WorkMetric = 'total' | 'pending' | 'delayed' | 'due';
export type WorkKind = 'delegation' | 'ticket' | 'checklist' | 'todo';

export interface WorkRow {
  id: string;
  kind: WorkKind;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  dueText: string | null;
  late: boolean;
  href: string;
}

export interface WorkGroup {
  kind: WorkKind;
  total: number;
  rows: WorkRow[];
  failed?: boolean;
}

export interface WorkItems {
  metric: WorkMetric;
  scope: SummaryScope;
  groups: WorkGroup[];
}

export interface MyApprovalCounts {
  waiting: number;
  delayed: number;
  fresh: number;
  approvedToday: number;
}

export interface MyApprovals {
  tickets: MyApprovalCounts;
  delegations: MyApprovalCounts;
  checklists: MyApprovalCounts;
}

export interface DashboardSummariesData {
  tasksKpi?: TaskSummary;
  ticketsKpi?: TicketSummary;
  todos?: TodoSummary;
  checklistToday?: ChecklistInstanceSummary;
  orgChecklistToday?: ChecklistInstanceSummary;
  scopeChecklistToday?: ChecklistInstanceSummary;
}

export const dashboardApi = {
  workItems: (params: { metric: WorkMetric; scope: SummaryScope; today: string }) =>
    apiFetch<ApiResponse<WorkItems>>(`/dashboard/work-items?${new URLSearchParams(params).toString()}`).then((r) => r.data),
  myApprovals: () => apiFetch<ApiResponse<MyApprovals>>('/dashboard/my-approvals').then((r) => r.data),
  summaries: (params: { scope: SummaryScope; today: string }) =>
    apiFetch<ApiResponse<DashboardSummariesData>>(`/dashboard/summaries?${new URLSearchParams(params).toString()}`).then((r) => r.data),
};
