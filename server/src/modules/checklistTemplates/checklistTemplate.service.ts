import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { checklistTemplates, checklistTemplateItems } from "../../db/schema/index.js"
import { eq, and, asc, inArray, isNull } from "drizzle-orm"
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type {
    CreateChecklistTemplateInput,
    UpdateChecklistTemplateInput,
    CreateChecklistTemplateItemInput,
    UpdateChecklistTemplateItemInput,
} from "./checklistTemplate.validation.js"
import { auditService } from "../audit/audit.service.js"

// Soft-deleted rows must stay invisible everywhere a live template is looked up — same
// convention as Task/Ticket/ChecklistDefinition (see task.service.ts's own NOT_DELETED).
const NOT_DELETED = isNull(checklistTemplates.deletedAt)

// Not using Drizzle's relational query API (`db.query...with:{...}`) here — that API compiles
// every relation into a `LEFT JOIN LATERAL (...)` subquery, and the actual database this app
// runs against (MariaDB 10.11) doesn't support LATERAL joins at all (confirmed against the real
// local instance). Plain selects assembled by hand in JS instead — same pattern as
// task.service.ts/ticket.service.ts.
const getTemplateWithItems = async (id: string) => {
    const [template] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, id), NOT_DELETED)).limit(1)
    if (!template) return undefined
    const items = await db.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.templateId, id)).orderBy(asc(checklistTemplateItems.order))
    return { ...template, items }
}

export const checklistTemplateService = {
    async list(appliesTo?: "TASK" | "TICKET") {
        const templateRows = await db
            .select()
            .from(checklistTemplates)
            .where(appliesTo ? and(NOT_DELETED, eq(checklistTemplates.appliesTo, appliesTo)) : NOT_DELETED)
            .orderBy(asc(checklistTemplates.name))
        const templateIds = templateRows.map((t) => t.id)
        const itemRows = templateIds.length
            ? await db.select().from(checklistTemplateItems).where(inArray(checklistTemplateItems.templateId, templateIds)).orderBy(asc(checklistTemplateItems.order))
            : []
        const itemsByTemplate = new Map<string, typeof itemRows>()
        for (const item of itemRows) {
            const list = itemsByTemplate.get(item.templateId) ?? []
            list.push(item)
            itemsByTemplate.set(item.templateId, list)
        }
        return templateRows.map((t) => ({ ...t, items: itemsByTemplate.get(t.id) ?? [] }))
    },

    async getById(id: string) {
        const template = await getTemplateWithItems(id)
        if (!template) throw AppError.notFound("Checklist template not found")
        return template
    },

    async create(input: CreateChecklistTemplateInput, user: AccessTokenPayload) {
        const id = createId()
        await db.insert(checklistTemplates).values({
            id,
            name: input.name,
            appliesTo: input.appliesTo,
            departmentId: input.departmentId ?? null,
            createdBy: user.sub,
        })

        if (input.items?.length) {
            await db.insert(checklistTemplateItems).values(
                input.items.map((item, index) => ({
                    id: createId(),
                    label: item.label,
                    order: item.order ?? index,
                    requiredImageCount: item.requiredImageCount ?? 0,
                    maxImageCount: item.maxImageCount ?? null,
                    requiresLivePhoto: item.requiresLivePhoto ?? false,
                    defaultAssigneeId: item.defaultAssigneeId ?? null,
                    templateId: id,
                })),
            )
        }

        const created = await getTemplateWithItems(id)
        await auditService.record({ entityType: "ChecklistTemplate", entityId: id, action: "CREATE", actorId: user.sub, after: created })
        return created
    },

    async update(id: string, input: UpdateChecklistTemplateInput, actorId: string) {
        const [existing] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, id), NOT_DELETED)).limit(1)
        if (!existing) throw AppError.notFound("Checklist template not found")

        const patch: Partial<typeof checklistTemplates.$inferInsert> = { updatedAt: new Date() }
        if (input.name !== undefined) patch.name = input.name
        if (input.departmentId !== undefined) patch.departmentId = input.departmentId

        await db.update(checklistTemplates).set(patch).where(eq(checklistTemplates.id, id))
        const [template] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id)).limit(1)
        await auditService.record({ entityType: "ChecklistTemplate", entityId: id, action: "UPDATE", actorId, before: existing, after: template })
        return template
    },

    // Soft delete: sets deletedAt instead of removing the row (and its ChecklistTemplateItem
    // children) outright — same convention as Task/Ticket/ChecklistDefinition. Every read path
    // above (list/getById/update/addItem) hides it from here on via NOT_DELETED.
    async remove(id: string, actorId: string) {
        const [template] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, id), NOT_DELETED)).limit(1)
        if (!template) throw AppError.notFound("Checklist template not found")
        const deletedAt = new Date()
        await db.update(checklistTemplates).set({ deletedAt, updatedAt: deletedAt }).where(eq(checklistTemplates.id, id))
        await auditService.record({ entityType: "ChecklistTemplate", entityId: id, action: "DELETE", actorId, before: template })
        return template
    },

    async addItem(templateId: string, input: CreateChecklistTemplateItemInput) {
        const [template] = await db.select({ id: checklistTemplates.id }).from(checklistTemplates).where(and(eq(checklistTemplates.id, templateId), NOT_DELETED)).limit(1)
        if (!template) throw AppError.notFound("Checklist template not found")
        const id = createId()
        await db.insert(checklistTemplateItems).values({
            id,
            label: input.label,
            order: input.order ?? 0,
            requiredImageCount: input.requiredImageCount ?? 0,
            maxImageCount: input.maxImageCount ?? null,
            requiresLivePhoto: input.requiresLivePhoto ?? false,
            defaultAssigneeId: input.defaultAssigneeId ?? null,
            templateId,
        })
        const [item] = await db.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.id, id)).limit(1)
        return item
    },

    async updateItem(itemId: string, input: UpdateChecklistTemplateItemInput) {
        const [existing] = await db.select({ id: checklistTemplateItems.id }).from(checklistTemplateItems).where(eq(checklistTemplateItems.id, itemId)).limit(1)
        if (!existing) throw AppError.notFound("Checklist template item not found")

        const patch: Partial<typeof checklistTemplateItems.$inferInsert> = { updatedAt: new Date() }
        if (input.label !== undefined) patch.label = input.label
        if (input.order !== undefined) patch.order = input.order
        if (input.requiredImageCount !== undefined) patch.requiredImageCount = input.requiredImageCount
        if (input.maxImageCount !== undefined) patch.maxImageCount = input.maxImageCount
        if (input.requiresLivePhoto !== undefined) patch.requiresLivePhoto = input.requiresLivePhoto
        if (input.defaultAssigneeId !== undefined) patch.defaultAssigneeId = input.defaultAssigneeId

        await db.update(checklistTemplateItems).set(patch).where(eq(checklistTemplateItems.id, itemId))
        const [item] = await db.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.id, itemId)).limit(1)
        return item
    },

    async removeItem(itemId: string) {
        const [item] = await db.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.id, itemId)).limit(1)
        if (!item) throw AppError.notFound("Checklist template item not found")
        await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.id, itemId))
        return item
    },
}
