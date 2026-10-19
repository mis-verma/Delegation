import { apiFetch } from "./http"

export type Notification = {
    id : string;
    type : string;
    title : string;
    message : string;
    ticketId : string | null;
    taskId : string | null;
    checklistInstanceId : string | null;
    /** The checklist this is about has had its day end. The message still shows, but there is nothing to open. */
    checklistMissed? : boolean;
    isRead : boolean;
    createdAt : string;
}

export type ApiResponse<T> = { success : boolean ; data : T};

export type PushStatus = { configured : boolean; publicKey : string | null; devices : number };
export type NotificationPrefs = { quietStart : string | null; quietEnd : string | null; morningDigest : boolean };

export const notificationApi = {
    getAll : () => apiFetch<ApiResponse<Notification[]>>("/notifications"),
    markRead : (id : string) => apiFetch<ApiResponse<Notification>>(`/notifications/${id}/read`, { method : "PATCH"}),
    markAllRead : () => apiFetch<{success : boolean}>('/notifications/read-all', { method : "PATCH"}),
    markUnread : (ids : string[]) => apiFetch<{success : boolean}>('/notifications/unread', { method : "PATCH", body : JSON.stringify({ ids })}),
    pushStatus : () => apiFetch<ApiResponse<PushStatus>>('/notifications/push'),
    pushSubscribe : (subscription : PushSubscriptionJSON) => apiFetch<{success : boolean}>('/notifications/push/subscribe', { method : "POST", body : JSON.stringify(subscription)}),
    pushUnsubscribe : (endpoint : string) => apiFetch<{success : boolean}>('/notifications/push/unsubscribe', { method : "POST", body : JSON.stringify({ endpoint })}),
    getPreferences : () => apiFetch<ApiResponse<NotificationPrefs>>('/notifications/preferences'),
    savePreferences : (prefs : NotificationPrefs) => apiFetch<ApiResponse<NotificationPrefs>>('/notifications/preferences', { method : "PUT", body : JSON.stringify(prefs)}),
}
