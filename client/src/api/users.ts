import { apiFetch } from './http';

export type Role = "ADMIN" | "APPROVAL_MANAGER" | "PC" | "SENIOR" | "MANAGER" | "AGENT" | "USER";

export type AssignableUser = {
    id:           string;
    firstName:    string;
    lastName:     string | null;
    email:        string;
    role:         Role;
    departmentId: string | null;
};

export type ApiResponse<T> = { success: boolean; data: T };

export const userApi = {
    getAssignable: (departmentId?: string, storeId?: string, storeIds?: string[]) => {
        const params = new URLSearchParams();
        if (departmentId) params.set('departmentId', departmentId);
        if (storeId) params.set('storeId', storeId);
        for (const id of storeIds ?? []) params.append('storeIds', id);
        const query = params.toString();
        return apiFetch<ApiResponse<AssignableUser[]>>(`/users/assignable${query ? `?${query}` : ''}`);
    },
};
