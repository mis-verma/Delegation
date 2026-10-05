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
    /** When they were deactivated (null while active). */
    deactivatedAt?: string | null;
    avatarUrl: string | null;
    phone?: string | null;
    /** Picks which uniform checklist an audit gives this person; null = not set (main list). */
    gender?: Gender | null;
    /** Which admin-defined dress type an audit checks this person against; null = none (their gender's list). */
    dressTypeId?: string | null;
    /** Weekly day(s) off, 0 = Sunday … 6 = Saturday — no daily checklists on these days. */
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
    phone?: string;
    weekOffDays?: number[];
};

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, "password" | "departmentId" | "storeId" | "gender" | "dressTypeId" | "phone">> & {
    /** null clears it. */
    phone?: string | null;
    isActive?: boolean;
    departmentId?: string | null;
    storeId?: string | null;
    /** null clears it back to "not set". */
    gender?: Gender | null;
    /** null clears it (back to their gender's list). */
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
    /** Null for an account that's never had a socket connect (never logged in on the web app). */
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

    /** Move several people at once (department, store or role). Admin/PC only. */
    bulkUpdate: (payload: BulkUpdateUsersPayload) =>
        apiFetch<ApiResponse<{ updated: number }>>("/users/bulk", { method: "PATCH", body: JSON.stringify(payload) }),

    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/users/${id}`, { method: "DELETE" }),

    /** What this person still holds (open tickets, tasks, checklists, categories). */
    getOffboarding: (id: string) =>
        apiFetch<ApiResponse<OffboardingSummary>>(`/users/${id}/offboarding`),

    /** Hand their open work to someone and switch them off. They keep their name on old records. */
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

    uploadAvatar: (id: string, file: File) => {
        const formData = new FormData();
        formData.append("avatar", file);
        return apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "POST", body: formData });
    },

    removeAvatar: (id: string) =>
        apiFetch<ApiResponse<AdminUser>>(`/users/${id}/avatar`, { method: "DELETE" }),

    getPresence: () => apiFetch<ApiResponse<UserPresence[]>>("/users/presence"),
};
