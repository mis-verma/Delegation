import { apiFetch } from './http';

export type SmartTaskConversationMessage = {
    from:      'bot' | 'user';
    text:      string;
    timestamp: string | number;
};

export type SmartTaskConversationStatus = 'in_progress' | 'completed' | 'abandoned';

export type SmartTaskConversation = {
    id:              string;
    userId:          string;
    messages:        SmartTaskConversationMessage[];
    status:          SmartTaskConversationStatus;
    resultingTaskId: string | null;
    createdAt:       string;
    updatedAt:       string;
};

export type SmartTaskConversationSummary = {
    id:              string;
    status:          SmartTaskConversationStatus;
    resultingTaskId: string | null;
    messageCount:    number;
    title:           string;
    preview:         string;
    createdAt:       string;
    updatedAt:       string;
};

export type PatchSmartTaskConversationPayload = {
    messages?:        SmartTaskConversationMessage[];
    status?:          SmartTaskConversationStatus;
    resultingTaskId?: string;
};

type ApiResponse<T> = { success: boolean; data: T };

export const smartTaskConversationApi = {
    create: (messages: SmartTaskConversationMessage[]) =>
        apiFetch<ApiResponse<SmartTaskConversation>>('/smart-task-conversations', {
            method: 'POST',
            body:   JSON.stringify({ messages }),
        }).then(r => r.data),

    patch: (id: string, payload: PatchSmartTaskConversationPayload) =>
        apiFetch<ApiResponse<SmartTaskConversation>>(`/smart-task-conversations/${id}`, {
            method: 'PATCH',
            body:   JSON.stringify(payload),
        }).then(r => r.data),

    list: () =>
        apiFetch<ApiResponse<SmartTaskConversationSummary[]>>('/smart-task-conversations').then(r => r.data),

    getOne: (id: string) =>
        apiFetch<ApiResponse<SmartTaskConversation>>(`/smart-task-conversations/${id}`).then(r => r.data),

    deleteAll: () =>
        apiFetch<ApiResponse<{ deletedCount: number }>>('/smart-task-conversations', {
            method: 'DELETE',
        }).then(r => r.data),
};
