import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { capWindow, type ExplorerView } from "./scoreExplorer.js"
import { orgToday, scoreExplorerService, type ExplorerParent } from "./scoreExplorer.service.js"
import { MATRIX_MAX_COLUMNS, matrixBuckets, shapeMatrix, type MatrixBucket, type MatrixPeriod, type MatrixRow, type MatrixSlice, type MatrixTotal } from "./scoreMatrix.js"

const BATCH = 4

export type MatrixQuery = {
    from: string
    to: string
    view: Exclude<ExplorerView, "module">
    period: MatrixPeriod
    storeId?: string
    departmentId?: string
    recurrence?: string
    parentId?: string
}

export type MatrixResponse = {
    window: { from: string; to: string; capped: boolean }
    period: MatrixPeriod
    buckets: MatrixBucket[]
    view: ExplorerView
    parent: ExplorerParent | null
    scope: { role: string; orgWide: boolean; departmentLocked: boolean; departmentId?: string; allDepartments: boolean }
    total: MatrixTotal
    rows: MatrixRow[]
    truncated: boolean
}

export const scoreMatrixService = {
    async matrix(viewer: AccessTokenPayload, q: MatrixQuery): Promise<MatrixResponse> {
        const win = capWindow(q.from, q.to, orgToday())
        const buckets = matrixBuckets(q.period, win.from, win.to)
        if (buckets.length > MATRIX_MAX_COLUMNS) {
            throw AppError.badRequest(`That would be ${buckets.length} columns. Pick a shorter period or a bigger step (at most ${MATRIX_MAX_COLUMNS}).`)
        }

        const filters = { view: q.view, storeId: q.storeId, departmentId: q.departmentId, recurrence: q.recurrence, parentId: q.parentId }
        const base = await scoreExplorerService.explorer(viewer, { ...filters, from: win.from, to: win.to })

        const slices: MatrixSlice[] = []
        for (let i = 0; i < buckets.length; i += BATCH) {
            const part = await Promise.all(
                buckets.slice(i, i + BATCH).map((b) => scoreExplorerService.explorer(viewer, { ...filters, from: b.from, to: b.to })),
            )
            for (const r of part) slices.push({ total: r.total, rows: r.rows })
        }

        const shaped = shapeMatrix({ total: base.total, rows: base.rows }, slices)
        return {
            window: { from: win.from, to: win.to, capped: win.capped },
            period: q.period,
            buckets,
            view: base.view,
            parent: base.parent,
            scope: base.scope,
            ...shaped,
        }
    },
}
