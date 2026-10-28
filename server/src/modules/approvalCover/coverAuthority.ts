import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { approvalCoverService } from "./approvalCover.service.js"
import { borrowAuthority } from "./borrowAuthority.js"

export { borrowAuthority }

const isForbidden = (error: unknown): boolean => error instanceof AppError && error.statusCode === 403

export const runWithCover = async <T>(user: AccessTokenPayload, run: (actor: AccessTokenPayload) => Promise<T>): Promise<T> => {
    try {
        return await run(user)
    } catch (error) {
        if (!isForbidden(error)) throw error
        const covers = await approvalCoverService.activeCoversFor(user.sub)
        for (const cover of covers) {
            try {
                return await run(borrowAuthority(user, cover))
            } catch (inner) {
                if (!isForbidden(inner)) throw inner
            }
        }
        throw error
    }
}

export const coverAuthorities = async (user: AccessTokenPayload): Promise<AccessTokenPayload[]> => {
    const covers = await approvalCoverService.activeCoversFor(user.sub)
    return covers.map((cover) => borrowAuthority(user, cover))
}

type PendingRow = { id: string; waitingSince: string }
type PendingPage<Row extends PendingRow> = { data: Row[]; meta: { total: number } }

export const mergePendingApprovals = async <Row extends PendingRow>(
    user: AccessTokenPayload,
    load: (actor: AccessTokenPayload, limit: number) => Promise<PendingPage<Row>>,
    limit = 8,
): Promise<PendingPage<Row>> => {
    const extra = await coverAuthorities(user)
    if (extra.length === 0) return load(user, limit)

    const pages = await Promise.all([user, ...extra].map((actor) => load(actor, limit)))
    const seen = new Map<string, Row>()
    let duplicates = 0
    for (const page of pages) {
        for (const row of page.data) {
            if (seen.has(row.id)) duplicates += 1
            else seen.set(row.id, row)
        }
    }
    const data = [...seen.values()]
        .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
        .slice(0, limit)
    const total = Math.max(data.length, pages.reduce((sum, page) => sum + page.meta.total, 0) - duplicates)
    return { data, meta: { total } }
}
