import { apiFetch } from "./http";

export type CategoryAssignee = {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string
};

export type Category = {
    id: string;
    name: string;
    isActive: boolean;
    departmentId: { id: string; name: string };
    assigneeIds: CategoryAssignee[];
    tatHours: number | null;

}

export type ApiResponse<T> = { success: boolean; data: T };

export type CreateCategoryPayload = {
    name: string;
    departmentId: string;
    assigneeIds?: string[];
    tatHours?: number | null;
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload> & { isActive?: boolean };

// What the server sends: plain ids on the row (`departmentId`, `assigneeIds`) with the populated
// records next to them (`department`, `assignees`). Every screen was written against one object shape
// (`departmentId: { id, name }`, `assigneeIds: [{ id, firstName, ... }]`), and reading the raw row
// gave undefined there: a category's department and responsible person never filled in on a new
// ticket, the Categories list showed a dash and the edit form lost both. Normalised once, here.
type CategoryRow = {
    id: string;
    name: string;
    isActive: boolean;
    tatHours: number | null;
    departmentId: string | { id: string; name: string };
    department?: { id: string; name: string } | null;
    assigneeIds?: Array<string | CategoryAssignee>;
    assignees?: CategoryAssignee[];
};

const normalizeCategory = (raw: CategoryRow): Category => {
    const departmentId = typeof raw.departmentId === "object" && raw.departmentId
        ? raw.departmentId
        : (raw.department ?? { id: String(raw.departmentId ?? ""), name: "" });
    const assigneeIds = raw.assignees
        ?? (raw.assigneeIds ?? []).filter((a): a is CategoryAssignee => typeof a === "object");
    return { id: raw.id, name: raw.name, isActive: raw.isActive, tatHours: raw.tatHours ?? null, departmentId, assigneeIds };
};

export const categoryApi = {
    getAll: () => apiFetch<ApiResponse<CategoryRow[]>>("/categories").then((r) => ({ ...r, data: r.data.map(normalizeCategory) })),
    create: (payload: CreateCategoryPayload) =>
        apiFetch<ApiResponse<CategoryRow>>("/categories", { method: "POST", body: JSON.stringify(payload) }).then((r) => ({ ...r, data: normalizeCategory(r.data) })),
    update: (id: string, payload: UpdateCategoryPayload) =>
        apiFetch<ApiResponse<CategoryRow>>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then((r) => ({ ...r, data: normalizeCategory(r.data) })),
    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/categories/${id}`, { method: "DELETE" })

}