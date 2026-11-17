import { and, eq, inArray, notInArray, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { invalidate } from "../../config/queryCache.js"
import { tags, taskTags } from "../../db/schema/task.js"
import { categorySubcategoryTags, categoryTags, ticketTags } from "../../db/schema/ticket.js"
import { AppError } from "../../utils/AppError.js"
import { duplicateGroups, unusedTags, type TagLike } from "./tagDuplicates.js"

const dropCaches = async () => {
    await invalidate("lookup:Tag")
    await invalidate("lookup:Category")
}

export const listTagsWithUsage = async (): Promise<TagLike[]> => {
    const rows = await db.select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        tickets: sql<number>`(SELECT COUNT(*) FROM ${ticketTags} WHERE ${ticketTags.tagId} = ${tags.id})`,
        tasks: sql<number>`(SELECT COUNT(*) FROM ${taskTags} WHERE ${taskTags.tagId} = ${tags.id})`,
    }).from(tags).orderBy(tags.name)
    return rows.map((row) => ({ ...row, tickets: Number(row.tickets), tasks: Number(row.tasks) }))
}

export const tagCleanupReport = async () => {
    const all = await listTagsWithUsage()
    return { tags: all, duplicates: duplicateGroups(all), unused: unusedTags(all) }
}

const assertKnown = (ids: string[], known: Set<string>) => {
    const missing = ids.filter((id) => !known.has(id))
    if (missing.length) throw AppError.badRequest("Some of those labels no longer exist. Reload the page and try again.")
}

export const deleteUnusedTags = async (ids: string[]) => {
    const all = await listTagsWithUsage()
    assertKnown(ids, new Set(all.map((tag) => tag.id)))
    const byId = new Map(all.map((tag) => [tag.id, tag]))
    const removable = ids.filter((id) => { const tag = byId.get(id); return tag ? tag.tickets + tag.tasks === 0 : false })
    const removing = new Set(removable)
    const keptIds = ids.filter((id) => !removing.has(id))
    const kept = keptIds.map((id) => byId.get(id)!.name)
    if (removable.length) {
        await db.delete(categoryTags).where(inArray(categoryTags.tagId, removable))
        await db.delete(categorySubcategoryTags).where(inArray(categorySubcategoryTags.tagId, removable))
        await db.delete(tags).where(inArray(tags.id, removable))
        await dropCaches()
    }
    return { deleted: removable.length, kept, keptIds }
}

export const mergeTags = async (fromIds: string[], intoId: string) => {
    const sources = fromIds.filter((id) => id !== intoId)
    if (!sources.length) throw AppError.badRequest("Pick at least one other label to merge in.")
    const all = await listTagsWithUsage()
    assertKnown([...sources, intoId], new Set(all.map((tag) => tag.id)))

    let movedTickets = 0
    let movedTasks = 0
    await db.transaction(async (tx) => {
        const alreadyTicket = tx.select({ id: ticketTags.ticketId }).from(ticketTags).where(eq(ticketTags.tagId, intoId))
        const ticketMove = await tx.update(ticketTags).set({ tagId: intoId })
            .where(and(inArray(ticketTags.tagId, sources), notInArray(ticketTags.ticketId, alreadyTicket)))
        movedTickets = ticketMove[0].affectedRows

        const alreadyTask = tx.select({ id: taskTags.taskId }).from(taskTags).where(eq(taskTags.tagId, intoId))
        const taskMove = await tx.update(taskTags).set({ tagId: intoId })
            .where(and(inArray(taskTags.tagId, sources), notInArray(taskTags.taskId, alreadyTask)))
        movedTasks = taskMove[0].affectedRows

        await tx.delete(ticketTags).where(inArray(ticketTags.tagId, sources))
        await tx.delete(taskTags).where(inArray(taskTags.tagId, sources))
        await tx.delete(categoryTags).where(inArray(categoryTags.tagId, sources))
        await tx.delete(categorySubcategoryTags).where(inArray(categorySubcategoryTags.tagId, sources))
        await tx.delete(tags).where(inArray(tags.id, sources))
    })
    await dropCaches()
    return { merged: sources.length, movedTickets, movedTasks }
}
