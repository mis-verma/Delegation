import { apiFetch } from "./http";

export type TodoPriority = 'low' | 'medium' | 'high';

export type Todo = {
    id: string;
    text: string;
    completed: boolean;
    dueDate: string | null;
    priority: TodoPriority;
    createdAt: string;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateTodoPayload = { text: string; dueDate?: string; priority?: TodoPriority };
export type UpdateTodoPayload = { text?: string; completed?: boolean; dueDate?: string | null; priority?: TodoPriority };

/** Mirrors the server's TodoSummaryRow (todo.service.ts) — powers the sidebar's "To-Do" count
 *  badge and its hover breakdown. Todos are already always strictly per-user, so there's no
 *  "mine vs everything I can see" distinction to make here. */
export type TodoSummary = {
    total: number;
    newToday: number;
    /** Open work: due (on track) plus overdue. */
    pending: number;
    due: number;
    overdue: number;
    completed: number;
};

export const todoApi = {
    getAll: () => apiFetch<ApiResponse<Todo[]>>("/todos"),
    getSummary: (): Promise<TodoSummary> =>
        apiFetch<ApiResponse<TodoSummary>>("/todos/summary").then(r => r.data),
    create: (payload: CreateTodoPayload) =>
        apiFetch<ApiResponse<Todo>>("/todos", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: UpdateTodoPayload) =>
        apiFetch<ApiResponse<Todo>>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/todos/${id}`, { method: "DELETE" }),
};
