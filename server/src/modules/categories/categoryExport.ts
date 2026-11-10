import type { CsvColumn } from "../../utils/csv.js"

export const CATEGORY_FILE_COLUMNS: CsvColumn[] = [
    { key: "category", label: "Category", width: 30 },
    { key: "subCategory", label: "Sub Category", width: 28 },
    { key: "department", label: "Department", width: 24 },
    { key: "assignedTo", label: "Assigned To", width: 34 },
    { key: "labels", label: "Labels", width: 26 },
    { key: "priority", label: "Priority", width: 12 },
    { key: "dueHours", label: "Due Hours", width: 12, align: "right" },
]

export type ExportableCategory = {
    name: string
    tatHours: number | null
    priority: string | null
    department: { name: string } | null
    assignees: { email: string }[]
    tags: { name: string }[]
    subcategories: { name: string }[]
}

export const categoryFileRows = (categories: ExportableCategory[]): Record<string, unknown>[] => {
    const rows: Record<string, unknown>[] = []
    for (const category of categories) {
        const base = {
            category: category.name,
            department: category.department?.name ?? "",
            assignedTo: category.assignees.map((a) => a.email).join(", "),
            labels: category.tags.map((t) => t.name).join(", "),
            priority: category.priority ?? "",
            dueHours: category.tatHours ?? "",
        }
        if (category.subcategories.length === 0) rows.push({ ...base, subCategory: "" })
        else for (const sub of category.subcategories) rows.push({ ...base, subCategory: sub.name })
    }
    return rows
}
