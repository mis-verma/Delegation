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

export type RestoreTodoPayload = { text: string; completed: boolean; dueDate: string | null; priority: TodoPriority; createdAt: string };

export type TodoSummary = {
    total: number;
    newToday: number;
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
    clearCompleted: (ids: string[]) =>
        apiFetch<ApiResponse<{ deleted: number }>>("/todos/clear-completed", { method: "POST", body: JSON.stringify({ ids }) }),
    restore: (todos: RestoreTodoPayload[]) =>
        apiFetch<ApiResponse<{ restored: number }>>("/todos/restore", { method: "POST", body: JSON.stringify({ todos }) }),
    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/todos/${id}`, { method: "DELETE" }),
};
