export const WORK_METRICS = ["total", "pending", "delayed", "due"] as const
export type WorkMetric = (typeof WORK_METRICS)[number]

export const WORK_KINDS = ["delegation", "ticket", "checklist", "todo"] as const
export type WorkKind = (typeof WORK_KINDS)[number]

export type RunState = { skip: boolean; complete: boolean; missed: boolean }

export const runMatchesMetric = (run: RunState, metric: WorkMetric): boolean => {
    if (metric === "total") return true
    if (run.skip || run.complete) return false
    if (metric === "pending") return true
    return metric === "delayed" ? run.missed : !run.missed
}

export type OpenState = { open: boolean; late: boolean }

export const openMatchesMetric = (item: OpenState, metric: WorkMetric): boolean => {
    if (metric === "total") return true
    if (!item.open) return false
    if (metric === "pending") return true
    return metric === "delayed" ? item.late : !item.late
}
