import { apiFetch } from "./http";
import { downloadReport } from "./reports";
import type { Tag } from "./tags";

export type CategoryPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CategoryAssignee = {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string
};

export type Subcategory = {
    id: string;
    categoryId: string;
    name: string;
    isActive: boolean;
    priority: CategoryPriority | null;
    tatHours: number | null;
    assigneeId: string | null;
    sortOrder: number;
    tags: Tag[];
    tagIds: string[];
};

export type SubcategoryPayload = {
    name?: string;
    priority?: CategoryPriority | null;
    tatHours?: number | null;
    assigneeId?: string | null;
    tagIds?: string[];
    isActive?: boolean;
};

export type Category = {
    id: string;
    name: string;
    isActive: boolean;
    departmentId: { id: string; name: string };
    assigneeIds: CategoryAssignee[];
    tatHours: number | null;
    priority: CategoryPriority | null;
    tags: Tag[];
    subcategories: Subcategory[];
}

export type ApiResponse<T> = { success: boolean; data: T };

export type TatWindowDays = 30 | 90 | 180 | 365 | 0;

export type TatSummary = {
    count: number;
    avg: number | null;
    median: number | null;
    p80: number | null;
    p90: number | null;
};

export type CategoryTatRow = {
    categoryId: string | null;
    name: string;
    departmentName: string | null;
    configuredTatHours: number | null;
    total: number;
    closed: number;
    rejected: number;
    open: number;
    response: TatSummary;
    completion: TatSummary;
    closure: TatSummary;
    onHoldAvg: number | null;
    slaMet: number;
    slaBreached: number;
    slaMetPct: number | null;
    suggestedTatHours: number | null;
};

export type CategoryProposal = {
    key: string;
    name: string;
    rowCount: number;
    tatHours: number | null;
    personName: string | null;
    assigneeId: string | null;
    departmentId: string | null;
    departmentSource: "person" | "column" | "none";
    exists: boolean;
    existingCategoryId: string | null;
    subcategories: { name: string; exists: boolean }[];
    priority: CategoryPriority | null;
    labels: { name: string; tagId: string | null }[];
    warnings: string[];
};

export type CategoryHistoryPreview = {
    columns: string[];
    nameColumn: string;
    totalRows: number;
    isList: boolean;
    tags: { id: string; name: string }[];
    proposals: CategoryProposal[];
    departments: { id: string; name: string }[];
    people: { id: string; name: string; email: string }[];
};

export type CategoryTatReport = { rows: CategoryTatRow[]; total: CategoryTatRow };

export type CreateCategoryPayload = {
    name: string;
    departmentId: string;
    assigneeIds?: string[];
    tatHours?: number | null;
    priority?: CategoryPriority | null;
    tagIds?: string[];
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload> & { isActive?: boolean };

type CategoryRow = {
    id: string;
    name: string;
    isActive: boolean;
    tatHours: number | null;
    priority?: CategoryPriority | null;
    tags?: Tag[];
    departmentId: string | { id: string; name: string };
    department?: { id: string; name: string } | null;
    assigneeIds?: Array<string | CategoryAssignee>;
    assignees?: CategoryAssignee[];
    subcategories?: Subcategory[];
};

const normalizeCategory = (raw: CategoryRow): Category => {
    const departmentId = typeof raw.departmentId === "object" && raw.departmentId
        ? raw.departmentId
        : (raw.department ?? { id: String(raw.departmentId ?? ""), name: "" });
    const assigneeIds = raw.assignees
        ?? (raw.assigneeIds ?? []).filter((a): a is CategoryAssignee => typeof a === "object");
    return { id: raw.id, name: raw.name, isActive: raw.isActive, tatHours: raw.tatHours ?? null, priority: raw.priority ?? null, tags: raw.tags ?? [], departmentId, assigneeIds, subcategories: raw.subcategories ?? [] };
};

export type CategoryFileFormat = "xlsx" | "csv";

export const categoryApi = {
    downloadFile: (format: CategoryFileFormat) =>
        downloadReport("/categories/export", new URLSearchParams({ format }), `categories.${format}`),
    historyPreview: (file: File, nameColumn?: string) => {
        const formData = new FormData();
        formData.append("file", file);
        if (nameColumn) formData.append("nameColumn", nameColumn);
        return apiFetch<ApiResponse<CategoryHistoryPreview>>("/categories/history-import/preview", { method: "POST", body: formData }).then((r) => r.data);
    },
    getAll: () => apiFetch<ApiResponse<CategoryRow[]>>("/categories").then((r) => ({ ...r, data: r.data.map(normalizeCategory) })),
    create: (payload: CreateCategoryPayload) =>
        apiFetch<ApiResponse<CategoryRow>>("/categories", { method: "POST", body: JSON.stringify(payload) }).then((r) => ({ ...r, data: normalizeCategory(r.data) })),
    update: (id: string, payload: UpdateCategoryPayload) =>
        apiFetch<ApiResponse<CategoryRow>>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then((r) => ({ ...r, data: normalizeCategory(r.data) })),
    tatReport: (days: TatWindowDays, tagId?: string) =>
        apiFetch<ApiResponse<CategoryTatReport>>(`/categories/tat-report?days=${days}${tagId ? `&tagId=${encodeURIComponent(tagId)}` : ""}`),
    delete: (id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/categories/${id}`, { method: "DELETE" }),
    createSubcategory: (categoryId: string, payload: SubcategoryPayload & { name: string }) =>
        apiFetch<ApiResponse<Subcategory>>(`/categories/${categoryId}/subcategories`, { method: "POST", body: JSON.stringify(payload) }).then((r) => r.data),
    updateSubcategory: (categoryId: string, id: string, payload: SubcategoryPayload) =>
        apiFetch<ApiResponse<Subcategory>>(`/categories/${categoryId}/subcategories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }).then((r) => r.data),
    deleteSubcategory: (categoryId: string, id: string) =>
        apiFetch<ApiResponse<{ deleted: boolean }>>(`/categories/${categoryId}/subcategories/${id}`, { method: "DELETE" }),

}