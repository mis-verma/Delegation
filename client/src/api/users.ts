import { apiFetch } from './http';

export type Role = "ADMIN" | "PC" | "SENIOR" | "MANAGER" | "AGENT" | "USER";

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
    // `storeIds` scopes to "assignable in ANY of these stores" — for a checklist that targets
    // several stores at once, where `storeId` alone can only ever check the first one.
    getAssignable: (departmentId?: string, storeId?: string, storeIds?: string[]) => {
        const params = new URLSearchParams();
        if (departmentId) params.set('departmentId', departmentId);
        if (storeId) params.set('storeId', storeId);
        for (const id of storeIds ?? []) params.append('storeIds', id);
        const query = params.toString();
        return apiFetch<ApiResponse<AssignableUser[]>>(`/users/assignable${query ? `?${query}` : ''}`);
    },
};
