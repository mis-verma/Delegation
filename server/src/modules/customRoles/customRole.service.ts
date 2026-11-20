import { and, asc, eq, ne, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { customRoles, users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { emitOrgChanged } from "../../sockets/socket.js"
import type { CreateCustomRoleInput, UpdateCustomRoleInput } from "./customRole.validation.js"

const DUPLICATE_MESSAGE = "A role with that name already exists."

const isDuplicateError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null
    return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY"
}

const assertNameFree = async (name: string, exceptId?: string) => {
    const sameName = sql`lower(${customRoles.name}) = ${name.toLowerCase()}`
    const [existing] = await db.select({ id: customRoles.id }).from(customRoles)
        .where(exceptId ? and(sameName, ne(customRoles.id, exceptId)) : sameName).limit(1)
    if (existing) throw AppError.conflict(DUPLICATE_MESSAGE)
}

const getByIdOrThrow = async (id: string) => {
    const [role] = await db.select().from(customRoles).where(eq(customRoles.id, id)).limit(1)
    if (!role) throw AppError.notFound("Role not found")
    return role
}

const countPeople = async (id: string) => {
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.customRoleId, id))
    return Number(row?.n ?? 0)
}

export const customRoleService = {
    async list() {
        const [rows, counts] = await Promise.all([
            db.select().from(customRoles).orderBy(asc(customRoles.name)),
            db.select({ id: users.customRoleId, n: sql<number>`count(*)` }).from(users)
                .where(sql`${users.customRoleId} is not null`).groupBy(users.customRoleId),
        ])
        const countById = new Map(counts.map((c) => [c.id as string, Number(c.n)]))
        return rows.map((r) => ({ ...r, peopleCount: countById.get(r.id) ?? 0 }))
    },

    async getById(id: string) {
        return getByIdOrThrow(id)
    },

    async create(input: CreateCustomRoleInput, actorId: string) {
        const name = input.name.trim()
        await assertNameFree(name)

        const id = createId()
        try {
            await db.insert(customRoles).values({
                id,
                name,
                baseRole: input.baseRole,
                description: input.description ?? null,
                isActive: input.isActive ?? true,
            })
        } catch (err) {
            if (isDuplicateError(err)) throw AppError.conflict(DUPLICATE_MESSAGE)
            throw err
        }

        const created = await getByIdOrThrow(id)
        await auditService.record({ entityType: "CustomRole", entityId: id, action: "CREATE", actorId, after: created })
        emitOrgChanged("customRole", id)
        return created
    },

    async update(id: string, input: UpdateCustomRoleInput, actorId: string) {
        const before = await getByIdOrThrow(id)

        const patch: Partial<typeof customRoles.$inferInsert> = {}
        if (input.name !== undefined) {
            const name = input.name.trim()
            await assertNameFree(name, id)
            patch.name = name
        }
        if (input.baseRole !== undefined) patch.baseRole = input.baseRole
        if (input.description !== undefined) patch.description = input.description ?? null
        if (input.isActive !== undefined) patch.isActive = input.isActive

        try {
            await db.update(customRoles).set({ ...patch, updatedAt: new Date() }).where(eq(customRoles.id, id))
        } catch (err) {
            if (isDuplicateError(err)) throw AppError.conflict(DUPLICATE_MESSAGE)
            throw err
        }

        const after = await getByIdOrThrow(id)
        await auditService.record({ entityType: "CustomRole", entityId: id, action: "UPDATE", actorId, before, after })
        emitOrgChanged("customRole", id)
        return after
    },

    async remove(id: string, actorId: string) {
        const role = await getByIdOrThrow(id)
        const peopleCount = await countPeople(id)
        if (peopleCount > 0) {
            throw AppError.conflict(`${peopleCount} ${peopleCount === 1 ? "person uses" : "people use"} ${role.name}. Move them to another role first, or deactivate it instead.`)
        }
        await db.delete(customRoles).where(eq(customRoles.id, id))
        await auditService.record({ entityType: "CustomRole", entityId: id, action: "DELETE", actorId, before: role })
        emitOrgChanged("customRole", id)
        return role
    },
}
