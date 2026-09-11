import { apiFetch } from "./http"

export type Notification = {
    id : string;
    type : string;
    title : string;
    message : string;
    ticketId : string | null;
    taskId : string | null;
    checklistInstanceId : string | null;
    isRead : boolean;
    createdAt : string;
}

export type ApiResponse<T> = { success : boolean ; data : T};

export const notificationApi = {
    getAll : () => apiFetch<ApiResponse<Notification[]>>("/notifications"),
    markRead : (id : string) => apiFetch<ApiResponse<Notification>>(`/notifications/${id}/read`, { method : "PATCH"}),
    markAllRead : () => apiFetch<{success : boolean}>('/notifications/read-all', { method : "PATCH"}),
}
