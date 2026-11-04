import { and, eq, inArray, ne } from "drizzle-orm"
import { db } from "../config/db.js"
import { checklistImages, checklistItems, checklists, taskChecklistItems, taskChecklists, taskImages } from "../db/schema/index.js"
import { AppError } from "./AppError.js"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type CorrectionInput = { correctionItemIds?: string[]; photoOnlyItemIds?: string[] }

const correctionPlan = (input: CorrectionInput) => {
    const photoOnly = [...new Set(input.photoOnlyItemIds ?? [])]
    const all = [...new Set([...(input.correctionItemIds ?? []), ...photoOnly])]
    return { all, photoOnly }
}

const NOT_ON_IT = "Some of the ticked checklist items are not on this one anymore. Open it again and retry."

export const reopenTicketChecklistItems = async (tx: Tx, ticketId: string, input: CorrectionInput, reviewerId: string, now: Date) => {
    const { all, photoOnly } = correctionPlan(input)
    if (!all.length) return 0
    const owned = await tx.select({ id: checklistItems.id })
        .from(checklistItems)
        .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
        .where(and(eq(checklists.ticketId, ticketId), inArray(checklistItems.id, all)))
    if (owned.length !== all.length) throw AppError.badRequest(NOT_ON_IT)
    await tx.update(checklistItems).set({ isDone: false, completedAt: null, updatedAt: now }).where(inArray(checklistItems.id, all))
    if (photoOnly.length) {
        await tx.update(checklistImages)
            .set({ reviewStatus: "REJECTED", reviewReason: "OTHER", reviewedBy: reviewerId, reviewedAt: now, updatedAt: now })
            .where(and(inArray(checklistImages.checklistItemId, photoOnly), ne(checklistImages.reviewStatus, "REJECTED")))
    }
    return all.length
}

export const reopenTaskChecklistItems = async (tx: Tx, taskId: string, input: CorrectionInput, reviewerId: string, now: Date) => {
    const { all, photoOnly } = correctionPlan(input)
    if (!all.length) return 0
    const owned = await tx.select({ id: taskChecklistItems.id })
        .from(taskChecklistItems)
        .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.taskChecklistId))
        .where(and(eq(taskChecklists.taskId, taskId), inArray(taskChecklistItems.id, all)))
    if (owned.length !== all.length) throw AppError.badRequest(NOT_ON_IT)
    await tx.update(taskChecklistItems).set({ isDone: false, completedAt: null, updatedAt: now }).where(inArray(taskChecklistItems.id, all))
    if (photoOnly.length) {
        await tx.update(taskImages)
            .set({ reviewStatus: "REJECTED", reviewReason: "OTHER", reviewedBy: reviewerId, reviewedAt: now, updatedAt: now })
            .where(and(inArray(taskImages.taskChecklistItemId, photoOnly), ne(taskImages.reviewStatus, "REJECTED")))
    }
    return all.length
}
