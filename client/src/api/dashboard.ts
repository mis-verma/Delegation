import { apiFetch, type SummaryScope } from "./http";
import type { TaskSummary } from "./task";
import type { TicketSummary } from "./ticket";
import type { TodoSummary } from "./todos";
import type { ChecklistInstanceSummary } from "./checklistInstances";

type ApiResponse<T> = { success: boolean; data: T };

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
  myApprovals: () => apiFetch<ApiResponse<MyApprovals>>('/dashboard/my-approvals').then((r) => r.data),
  summaries: (params: { scope: SummaryScope; today: string }) =>
    apiFetch<ApiResponse<DashboardSummariesData>>(`/dashboard/summaries?${new URLSearchParams(params).toString()}`).then((r) => r.data),
};
