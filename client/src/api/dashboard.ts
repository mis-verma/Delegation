import { apiFetch, type SummaryScope } from "./http";
import type { TaskSummary } from "./task";
import type { TicketSummary } from "./ticket";
import type { TodoSummary } from "./todos";
import type { ChecklistInstanceSummary } from "./checklistInstances";

type ApiResponse<T> = { success: boolean; data: T };

export interface DashboardSummariesData {
  tasksKpi: TaskSummary;
  ticketsKpi: TicketSummary;
  todos: TodoSummary;
  checklistToday: ChecklistInstanceSummary;
}

export const dashboardApi = {
  summaries: (params: { scope: SummaryScope; today: string }) =>
    apiFetch<ApiResponse<DashboardSummariesData>>(`/dashboard/summaries?${new URLSearchParams(params).toString()}`).then((r) => r.data),
};
