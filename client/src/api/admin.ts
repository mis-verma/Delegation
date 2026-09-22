import { apiFetch } from './http';

export type Role = "ADMIN" | "APPROVAL_MANAGER" | "SENIOR" | "MANAGER" | "AGENT" | "USER" | "PC";

export type AdminUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    role: Role;
    departmentId: string | null;
    storeId: string | null;
    isActive: boolean;
    avatarUrl: string | null;
    createdAt: string;
};

export type CreateUserPayload = {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    role: Role;
    departmentId?: string;
    storeId?: string;
};

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, "password" | "departmentId" | "storeId">> & {
    isActive?: boolean;
    departmentId?: string | null;
    storeId?: string | null;
};
export type ApiResponse<T> = { success: boolean; data: T };

export type PaginatedResponse<T> = {
    success: boolean;
    data:    T[];
    meta:    { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
};

export const adminApi = {
    // No page/limit -> the full roster (org structure's tree, assignable-user pickers, etc. all
    // rely on getting everyone back). Use getPage for the admin directory's paginated list view.
    getAll: () => apiFetch<ApiResponse<AdminUser[]>>("/users"),

    getPage: (page = 1, limit = 20) =>
        apiFetch<PaginatedResponse<AdminUser>>(`/users?page=${page}&limit=${limit}`),

    getOne: (id: string) => apiFetch<ApiResponse<AdminUser>>(`/users/${id}`),

    create: (payload: CreateUserPayload) =>
        apiFetch<ApiResponse<AdminUser>>("/users", { method: "POST", body: JSON.stringify(payload) }),

    update: (id: string, payload: UpdateUserPayload) =>
        apiFetch<ApiResponse<AdminUser>>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/users/${id}`, { method: "DELETE" }),

    resetPassword: (id: string, password: string) =>
        apiFetch<ApiResponse<{ reset: boolean }>>(`/users/${id}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ password }),
        }),

    uploadAvatar: (id: string, file: File) => {
        const formData = new FormData();
        formData.append("avatar", file);
        return apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "POST", body: formData });
    },

    removeAvatar: (id: string) =>
        apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "DELETE" }),
};
