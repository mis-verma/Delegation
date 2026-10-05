import { and, asc, eq, ne, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { dressTypes, users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import type { CreateDressTypeInput, UpdateDressTypeInput } from "./dressType.validation.js"

const DUPLICATE_MESSAGE = "A dress type with that name already exists."

const isDuplicateError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null
    return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY"
}

// Case-insensitive on purpose: gives a clean 409 before the unique index has to.
const assertNameFree = async (name: string, exceptId?: string) => {
    const sameName = sql`lower(${dressTypes.name}) = ${name.toLowerCase()}`
    const [existing] = await db.select({ id: dressTypes.id }).from(dressTypes)
        .where(exceptId ? and(sameName, ne(dressTypes.id, exceptId)) : sameName).limit(1)
    if (existing) throw AppError.conflict(DUPLICATE_MESSAGE)
}

const toPublic = (row: typeof dressTypes.$inferSelect, peopleCount: number) => ({
    id: row.id,
    name: row.name,
    gender: row.gender ?? null,
    isActive: row.isActive,
    peopleCount,
})

const countPeople = async (id: string) => {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.dressTypeId, id))
    return Number(row?.n ?? 0)
}

// Admin-defined ways of dressing for work. A person points at one (User.dressTypeId) and an audit
// question carries a tick-list per type (ChecklistDefinitionItem.accessoriesByType).
export const dressTypeService = {
    async list() {
        const [rows, counts] = await Promise.all([
            db.select().from(dressTypes).orderBy(asc(dressTypes.name)),
            db.select({ id: users.dressTypeId, n: sql<number>`count(*)` }).from(users)
                .where(sql`${users.dressTypeId} is not null`).groupBy(users.dressTypeId),
        ])
        const byType = new Map(counts.map((c) => [c.id, Number(c.n)]))
        return rows.map((r) => toPublic(r, byType.get(r.id) ?? 0))
    },

    async create(input: CreateDressTypeInput, actorId: string) {
        const name = input.name.trim()
        await assertNameFree(name)
        const id = createId()
        try {
            await db.insert(dressTypes).values({ id, name, gender: input.gender ?? null })
        } catch (err) {
            if (isDuplicateError(err)) throw AppError.conflict(DUPLICATE_MESSAGE)
            throw err
        }
        const [row] = await db.select().from(dressTypes).where(eq(dressTypes.id, id)).limit(1)
        const created = toPublic(row, 0)
        await auditService.record({ entityType: "DressType", entityId: id, action: "CREATE", actorId, after: created })
        return created
    },

    async update(id: string, input: UpdateDressTypeInput, actorId: string) {
        const [before] = await db.select().from(dressTypes).where(eq(dressTypes.id, id)).limit(1)
        if (!before) throw AppError.notFound("Dress type not found")
        const name = input.name?.trim()
        if (name !== undefined && name.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(name, id)

        const set: Partial<typeof dressTypes.$inferInsert> = { updatedAt: new Date() }
        if (name !== undefined) set.name = name
        if (input.gender !== undefined) set.gender = input.gender
        if (input.isActive !== undefined) set.isActive = input.isActive
        try {
            await db.update(dressTypes).set(set).where(eq(dressTypes.id, id))
        } catch (err) {
            if (isDuplicateError(err)) throw AppError.conflict(DUPLICATE_MESSAGE)
            throw err
        }
        const [row] = await db.select().from(dressTypes).where(eq(dressTypes.id, id)).limit(1)
        const peopleCount = await countPeople(id)
        const updated = toPublic(row, peopleCount)
        await auditService.record({ entityType: "DressType", entityId: id, action: "UPDATE", actorId, before: toPublic(before, peopleCount), after: updated })
        return updated
    },

    // The foreign key (ON DELETE SET NULL) clears User.dressTypeId; people fall back to their gender list.
    async remove(id: string, actorId: string) {
        const [before] = await db.select().from(dressTypes).where(eq(dressTypes.id, id)).limit(1)
        if (!before) throw AppError.notFound("Dress type not found")
        const peopleCount = await countPeople(id)
        await db.delete(dressTypes).where(eq(dressTypes.id, id))
        await auditService.record({ entityType: "DressType", entityId: id, action: "DELETE", actorId, before: toPublic(before, peopleCount) })
    },
}
