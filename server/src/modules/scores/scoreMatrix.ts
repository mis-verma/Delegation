import type { ExplorerRow, ExplorerRowKind } from "./scoreExplorer.js"

type ExplorerBlock = ExplorerRow["checklist"] | ExplorerRow["ticket"] | ExplorerRow["delegation"]

export const MATRIX_PERIODS = ["day", "week", "month"] as const
export type MatrixPeriod = (typeof MATRIX_PERIODS)[number]
export const MATRIX_MAX_COLUMNS = 31
export const MATRIX_MAX_ROWS = 30

const DAY_MS = 86_400_000
const MAX_BUCKETS_SCANNED = 400

const dayMs = (day: string) => Date.parse(`${day}T00:00:00.000Z`)
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export type MatrixBucket = { from: string; to: string }

export const matrixBuckets = (period: MatrixPeriod, from: string, to: string): MatrixBucket[] => {
    const start = dayMs(from)
    const end = dayMs(to)
    const out: MatrixBucket[] = []
    if (end < start) return out

    if (period === "day") {
        for (let t = start; t <= end && out.length < MAX_BUCKETS_SCANNED; t += DAY_MS) out.push({ from: ymd(t), to: ymd(t) })
        return out
    }

    if (period === "week") {
        const mondayOffset = (new Date(start).getUTCDay() + 6) % 7
        for (let t = start - mondayOffset * DAY_MS; t <= end && out.length < MAX_BUCKETS_SCANNED; t += 7 * DAY_MS) {
            out.push({ from: ymd(Math.max(t, start)), to: ymd(Math.min(t + 6 * DAY_MS, end)) })
        }
        return out
    }

    const cursor = new Date(start)
    cursor.setUTCDate(1)
    while (cursor.getTime() <= end && out.length < MAX_BUCKETS_SCANNED) {
        const nextMonth = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
        out.push({ from: ymd(Math.max(cursor.getTime(), start)), to: ymd(Math.min(nextMonth - DAY_MS, end)) })
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return out
}

export type MatrixBlockCell = {
    due: number
    done: number
    late: number
    score: number | null
    completion: number | null
    compliance: number | null
    onTime: number | null
}

export type MatrixCell = {
    totalDue: number
    overall: number | null
    checklist: MatrixBlockCell
    ticket: MatrixBlockCell
    delegation: MatrixBlockCell
}

export type MatrixRow = {
    id: string
    name: string
    kind: ExplorerRowKind
    departmentName?: string
    left?: boolean
    whole: MatrixCell
    cells: (MatrixCell | null)[]
}

export type MatrixTotal = { whole: MatrixCell; cells: MatrixCell[] }

const blockCell = (b: ExplorerBlock): MatrixBlockCell => ({
    due: b.due,
    done: b.done,
    late: b.late,
    score: b.score,
    completion: b.completion,
    compliance: b.compliance,
    onTime: b.onTimeOfFinishedPct,
})

export const cellOf = (r: ExplorerRow): MatrixCell => ({
    totalDue: r.totalDue,
    overall: r.overall,
    checklist: blockCell(r.checklist),
    ticket: blockCell(r.ticket),
    delegation: blockCell(r.delegation),
})

export type MatrixSlice = { total: ExplorerRow; rows: readonly ExplorerRow[] }

export const shapeMatrix = (base: MatrixSlice, perBucket: readonly MatrixSlice[], maxRows = MATRIX_MAX_ROWS): { total: MatrixTotal; rows: MatrixRow[]; truncated: boolean } => {
    const candidates = base.rows.filter((r) => r.totalDue > 0).sort((a, b) => b.totalDue - a.totalDue || a.name.localeCompare(b.name))
    const chosen = candidates.slice(0, maxRows)
    const byBucket = perBucket.map((slice) => new Map(slice.rows.map((r) => [r.id, r])))

    const rows = chosen.map<MatrixRow>((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        ...(r.departmentName ? { departmentName: r.departmentName } : {}),
        ...(r.left ? { left: true } : {}),
        whole: cellOf(r),
        cells: byBucket.map((map) => {
            const hit = map.get(r.id)
            return hit && hit.totalDue > 0 ? cellOf(hit) : null
        }),
    }))

    return {
        total: { whole: cellOf(base.total), cells: perBucket.map((slice) => cellOf(slice.total)) },
        rows,
        truncated: candidates.length > chosen.length,
    }
}
