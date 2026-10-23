import { apiFetch } from './http';
import { shrinkImages } from '../lib/compressImage';

export type Role = "ADMIN" | "APPROVAL_MANAGER" | "SENIOR" | "MANAGER" | "AGENT" | "USER" | "PC" | "OWNER";

export type AdminUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    role: Role;
    departmentId: string | null;
    storeId: string | null;
    isActive: boolean;
    deactivatedAt?: string | null;
    avatarUrl: string | null;
    phone?: string | null;
    gender?: Gender | null;
    dressTypeId?: string | null;
    reportsToId?: string | null;
    weekOffDays?: number[] | null;
    createdAt: string;
};

export type Gender = 'FEMALE' | 'MALE';

export type CreateUserPayload = {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    role: Role;
    departmentId?: string;
    storeId?: string;
    gender?: Gender;
    dressTypeId?: string | null;
    reportsToId?: string | null;
    phone?: string;
    weekOffDays?: number[];
    sendSetupCode?: boolean;
};

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, "password" | "departmentId" | "storeId" | "gender" | "dressTypeId" | "reportsToId" | "phone">> & {
    reportsToId?: string | null;
    phone?: string;
    isActive?: boolean;
    departmentId?: string | null;
    storeId?: string | null;
    gender?: Gender | null;
    dressTypeId?: string | null;
    weekOffDays?: number[];
};
export type BulkUpdateUsersPayload = {
    ids: string[];
    departmentId?: string | null;
    storeId?: string | null;
    role?: Role;
};

export type ApiResponse<T> = { success: boolean; data: T };

export type PaginatedResponse<T> = {
    success: boolean;
    data:    T[];
    meta:    { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
};

export type UserPresence = {
    id: string;
    online: boolean;
    lastActiveAt: string | null;
};

export type OffboardingSummary = {
    openTickets: number;
    openTasks: number;
    checklists: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    auditQuestions: number;
    hasOpenWork: boolean;
};

export const adminApi = {
    getAll: () => apiFetch<ApiResponse<AdminUser[]>>("/users"),

    getPage: (page = 1, limit = 20) =>
        apiFetch<PaginatedResponse<AdminUser>>(`/users?page=${page}&limit=${limit}`),

    getOne: (id: string) => apiFetch<ApiResponse<AdminUser>>(`/users/${id}`),

    create: (payload: CreateUserPayload) =>
        apiFetch<ApiResponse<AdminUser> & { setupCodeSent?: boolean }>("/users", { method: "POST", body: JSON.stringify(payload) }),

    sendPasswordCode: (id: string) =>
        apiFetch<ApiResponse<{ sent: boolean }>>(`/users/${id}/send-password-code`, { method: "POST" }),

    update: (id: string, payload: UpdateUserPayload) =>
        apiFetch<ApiResponse<AdminUser>>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

    bulkUpdate: (payload: BulkUpdateUsersPayload) =>
        apiFetch<ApiResponse<{ updated: number }>>("/users/bulk", { method: "PATCH", body: JSON.stringify(payload) }),

    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/users/${id}`, { method: "DELETE" }),

    getOffboarding: (id: string) =>
        apiFetch<ApiResponse<OffboardingSummary>>(`/users/${id}/offboarding`),

    offboard: (id: string, payload: { transferToUserId?: string }) =>
        apiFetch<ApiResponse<{ summary: OffboardingSummary; transferredTo: string | null }>>(`/users/${id}/offboard`, {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    resetPassword: (id: string, password: string) =>
        apiFetch<ApiResponse<{ reset: boolean }>>(`/users/${id}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ password }),
        }),

    uploadAvatar: async (id: string, file: File) => {
        const formData = new FormData();
        formData.append("avatar", (await shrinkImages([file]))[0]);
        return apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "POST", body: formData });
    },

    removeAvatar: (id: string) =>
        apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "DELETE" }),

    getPresence: () => apiFetch<ApiResponse<UserPresence[]>>("/users/presence"),
};
