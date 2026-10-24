import { Router } from "express"
import { z } from "zod"
import type { AnyMySqlColumn, AnyMySqlTable } from "drizzle-orm/mysql-core"
import { asc, eq, sql, getTableName } from "drizzle-orm"
import { authenticate, requireRole } from "../middleware/auth/auth.js"
import { asyncHandler } from "./asyncHandler.js"
import { AppError } from "./AppError.js"
import { db } from "../config/db.js"
import { cached, invalidate, cacheKey } from "../config/queryCache.js"
import { auditService } from "../modules/audit/audit.service.js"
import { routeParam } from "./routeParam.js"

type LookupTable = AnyMySqlTable & { id: AnyMySqlColumn; name: AnyMySqlColumn }

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})

type LookupRow = Record<string, unknown> & { id: string }

export type LookupOptions = {
    entityType?: string
    normalize?: (input: Record<string, unknown>) => Record<string, unknown>
    afterChange?: (before: LookupRow | undefined, after: LookupRow) => Promise<void>
    deleteBlockers?: (row: { id: string; name: string }) => Promise<string | null>
}

export const describeBlockers = (name: string, parts: { count: number; one: string; many: string }[]): string | null => {
    const present = parts.filter((p) => p.count > 0).map((p) => `${p.count} ${p.count === 1 ? p.one : p.many}`)
    if (!present.length) return null
    const list = present.length === 1 ? present[0] : `${present.slice(0, -1).join(", ")} and ${present[present.length - 1]}`
    return `${name} still has ${list}. Move them or deactivate it instead.`
}

const isDuplicateEntry = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null
    return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY"
}
const isStillReferenced = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null
    return e?.code === "ER_ROW_IS_REFERENCED_2" || e?.cause?.code === "ER_ROW_IS_REFERENCED_2"
}

export const createLookupRouter = (table: LookupTable, bodySchema: z.ZodObject, options: LookupOptions = {}) => {
    const updateSchema = bodySchema.partial()
    const audit = (req: { user?: { sub: string } }, entityId: string, action: string, before: unknown, after: unknown) =>
        options.entityType && req.user
            ? auditService.record({ entityType: options.entityType, entityId, action, actorId: req.user.sub, before, after })
            : Promise.resolve()
    const CACHE_PREFIX = cacheKey("lookup", getTableName(table))
    const CACHE_TTL_SECONDS = 300
    const dropCache = () => invalidate(CACHE_PREFIX)

    const router = Router()

    router.get("/", authenticate, asyncHandler(async (req, res) => {
        const { page, limit } = listQuerySchema.parse(req.query)

        if (page && limit) {
            const [items, totalRows] = await cached(cacheKey(CACHE_PREFIX, "page", page, limit), CACHE_TTL_SECONDS, () => Promise.all([
                db.select().from(table).orderBy(asc(table.name)).offset((page - 1) * limit).limit(limit),
                db.select({ count: sql<number>`count(*)` }).from(table),
            ]))
            const total = Number(totalRows[0]?.count ?? 0)
            res.json({
                success: true,
                data: items,
                meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
            })
            return
        }

        const items = await cached(cacheKey(CACHE_PREFIX, "all"), CACHE_TTL_SECONDS, () =>
            db.select().from(table).orderBy(asc(table.name)));
        res.json({ success: true, data: items })
    }))

    router.use(authenticate, requireRole("ADMIN", "PC"))

    router.post("/", asyncHandler(async (req, res) => {
        const input = (options.normalize ?? ((v) => v))(bodySchema.parse(req.body)) as z.infer<typeof bodySchema>
        const [existing] = (await db.select().from(table).where(eq(table.name, input.name)).limit(1)) as LookupRow[];
        if (existing) throw AppError.conflict("Name already exists")
        try {
            await db.insert(table).values(input)
        } catch (err) {
            if (isDuplicateEntry(err)) throw AppError.conflict("Name already exists")
            throw err
        }
        const [item] = (await db.select().from(table).where(eq(table.name, input.name)).limit(1)) as LookupRow[];
        await dropCache()
        if (item) await audit(req, item.id, "CREATE", undefined, item)
        if (item) await options.afterChange?.(undefined, item as LookupRow)
        res.status(201).json({ success: true, data: item })
    }))

    router.patch("/:id", asyncHandler(async (req, res) => {
        const input = (options.normalize ?? ((v) => v))(updateSchema.parse(req.body)) as z.infer<typeof updateSchema>
        if (input.name !== undefined) {
            const [existing] = (await db.select().from(table).where(eq(table.name, input.name)).limit(1)) as LookupRow[];
            if (existing && existing.id !== routeParam(req, "id")) throw AppError.conflict("Name already exists")
        }
        const [before] = await db.select().from(table).where(eq(table.id, routeParam(req, "id"))).limit(1);
        if (!before) throw AppError.notFound("Not Found")
        try {
            await db.update(table).set({ ...input, updatedAt: new Date() }).where(eq(table.id, routeParam(req, "id")));
        } catch (err) {
            if (isDuplicateEntry(err)) throw AppError.conflict("Name already exists")
            throw err
        }
        const [item] = (await db.select().from(table).where(eq(table.id, routeParam(req, "id"))).limit(1)) as LookupRow[];
        if (!item) throw AppError.notFound("Not Found")
        await dropCache()
        await audit(req, item.id, "UPDATE", before, item)
        await options.afterChange?.(before as LookupRow, item as LookupRow)
        res.json({ success: true, data: item })
    }))

    router.delete("/:id", asyncHandler(async (req, res) => {
        const [existing] = (await db.select().from(table).where(eq(table.id, routeParam(req, "id"))).limit(1)) as LookupRow[];
        if (!existing) throw AppError.notFound("Not Found")
        const blocked = await options.deleteBlockers?.({ id: existing.id, name: String(existing.name) })
        if (blocked) throw AppError.conflict(blocked)
        try {
            await db.delete(table).where(eq(table.id, routeParam(req, "id")));
        } catch (err) {
            if (isStillReferenced(err)) {
                throw AppError.conflict(`${String(existing.name)} is still used by other records, so it can't be deleted. Deactivate it instead.`)
            }
            throw err
        }
        await dropCache()
        await audit(req, existing.id, "DELETE", existing, undefined)
        res.json({ success: true, data: { delete: true } })
    }))

    return router;

}
