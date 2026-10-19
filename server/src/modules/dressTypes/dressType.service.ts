import { and, asc, eq, isNull, ne, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { dressTypes, users } from "../../db/schema/core.js"
import { checklistDefinitionItems, checklistDefinitions } from "../../db/schema/checklistDefinition.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import type { CreateDressTypeInput, UpdateDressTypeInput } from "./dressType.validation.js"

const DUPLICATE_MESSAGE = "A dress type with that name already exists."

const isDuplicateError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null
    return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY"
}

const assertNameFree = async (name: string, exceptId?: string) => {
    const sameName = sql`lower(${dressTypes.name}) = ${name.toLowerCase()}`
    const [existing] = await db.select({ id: dressTypes.id }).from(dressTypes)
        .where(exceptId ? and(sameName, ne(dressTypes.id, exceptId)) : sameName).limit(1)
    if (existing) throw AppError.conflict(DUPLICATE_MESSAGE)
}

const toPublic = (row: typeof dressTypes.$inferSelect, peopleCount: number, auditQuestionCount: number) => ({
    id: row.id,
    name: row.name,
    gender: row.gender ?? null,
    isActive: row.isActive,
    peopleCount,
    auditQuestionCount,
})

const countPeople = async (id: string) => {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.dressTypeId, id), eq(users.isActive, true)))
    return Number(row?.n ?? 0)
}

const auditQuestionCounts = async (): Promise<Map<string, number>> => {
    const rows = await db.select({ byType: checklistDefinitionItems.accessoriesByType })
        .from(checklistDefinitionItems)
        .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionItems.definitionId))
        .where(and(
            isNull(checklistDefinitions.deletedAt),
            sql`${checklistDefinitionItems.accessoriesByType} IS NOT NULL AND JSON_LENGTH(${checklistDefinitionItems.accessoriesByType}) > 0`,
        ))
    const counts = new Map<string, number>()
    for (const { byType } of rows) {
        for (const [typeId, list] of Object.entries(byType ?? {})) {
            if (Array.isArray(list) && list.length > 0) counts.set(typeId, (counts.get(typeId) ?? 0) + 1)
        }
    }
    return counts
}

export const dressTypeService = {
    async list() {
        const [rows, counts, questionCounts] = await Promise.all([
            db.select().from(dressTypes).orderBy(asc(dressTypes.name)),
            db.select({ id: users.dressTypeId, n: sql<number>`count(*)` }).from(users)
                .where(and(sql`${users.dressTypeId} is not null`, eq(users.isActive, true))).groupBy(users.dressTypeId),
            auditQuestionCounts(),
        ])
        const byType = new Map(counts.map((c) => [c.id, Number(c.n)]))
        return rows.map((r) => toPublic(r, byType.get(r.id) ?? 0, questionCounts.get(r.id) ?? 0))
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
        const created = toPublic(row, 0, 0)
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
        const [peopleCount, questionCounts] = await Promise.all([countPeople(id), auditQuestionCounts()])
        const questionCount = questionCounts.get(id) ?? 0
        const updated = toPublic(row, peopleCount, questionCount)
        await auditService.record({ entityType: "DressType", entityId: id, action: "UPDATE", actorId, before: toPublic(before, peopleCount, questionCount), after: updated })
        return updated
    },

    async remove(id: string, actorId: string) {
        const [before] = await db.select().from(dressTypes).where(eq(dressTypes.id, id)).limit(1)
        if (!before) throw AppError.notFound("Dress type not found")
        const peopleCount = await countPeople(id)
        if (peopleCount > 0) {
            const who = peopleCount === 1 ? "1 person is" : `${peopleCount} people are`
            throw AppError.conflict(`${who} still set to ${before.name}. Change them first, or turn it off instead.`)
        }
        const questionCount = (await auditQuestionCounts()).get(id) ?? 0
        await db.delete(dressTypes).where(eq(dressTypes.id, id))
        await auditService.record({ entityType: "DressType", entityId: id, action: "DELETE", actorId, before: toPublic(before, peopleCount, questionCount) })
    },
}
