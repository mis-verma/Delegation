import { and, count, desc, eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { drafts } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateDraftInput, DraftKind, UpdateDraftInput } from "./draft.validation.js"
import { isAdminOrPc } from "../../utils/roles.js"

const MAX_DRAFTS_PER_KIND = 50

const UNTITLED: Record<DraftKind, string> = { TICKET: "Untitled ticket", CHECKLIST: "Untitled checklist" }

const canUseKind = (user: AccessTokenPayload, kind: DraftKind) => kind !== "CHECKLIST" || isAdminOrPc(user.role)

const findOwn = async (id: string, userId: string) => {
    const [row] = await db.select().from(drafts).where(and(eq(drafts.id, id), eq(drafts.userId, userId))).limit(1)
    if (!row) throw AppError.notFound("Draft not found")
    return row
}

export const draftService = {
    async list(user: AccessTokenPayload, kind?: DraftKind) {
        const where = kind ? and(eq(drafts.userId, user.sub), eq(drafts.kind, kind)) : eq(drafts.userId, user.sub)
        const rows = await db.select().from(drafts).where(where).orderBy(desc(drafts.updatedAt)).limit(MAX_DRAFTS_PER_KIND * 2)
        return rows.filter((r) => canUseKind(user, r.kind))
    },

    async get(id: string, user: AccessTokenPayload) {
        const row = await findOwn(id, user.sub)
        if (!canUseKind(user, row.kind)) throw AppError.forbidden()
        return row
    },

    async create(user: AccessTokenPayload, input: CreateDraftInput) {
        if (!canUseKind(user, input.kind)) throw AppError.forbidden("Only an admin or PC can save checklist drafts.")
        const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(drafts).where(and(eq(drafts.userId, user.sub), eq(drafts.kind, input.kind)))
        if (Number(total) >= MAX_DRAFTS_PER_KIND) throw AppError.conflict(`You already have ${MAX_DRAFTS_PER_KIND} drafts. Publish or delete one first.`)
        const id = createId()
        const now = new Date()
        await db.insert(drafts).values({
            id,
            kind: input.kind,
            userId: user.sub,
            title: input.title || UNTITLED[input.kind],
            payload: input.payload,
            createdAt: now,
            updatedAt: now,
        })
        return findOwn(id, user.sub)
    },

    async update(id: string, user: AccessTokenPayload, input: UpdateDraftInput) {
        const existing = await findOwn(id, user.sub)
        if (!canUseKind(user, existing.kind)) throw AppError.forbidden()
        await db.update(drafts).set({
            ...(input.title !== undefined ? { title: input.title || UNTITLED[existing.kind] } : {}),
            ...(input.payload !== undefined ? { payload: input.payload } : {}),
            updatedAt: new Date(),
        }).where(eq(drafts.id, id))
        return findOwn(id, user.sub)
    },

    async remove(id: string, user: AccessTokenPayload) {
        await findOwn(id, user.sub)
        await db.delete(drafts).where(eq(drafts.id, id))
    },
}
