import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistDefinitions, checklistDefinitionAssignees } from "../../db/schema/index.js"
import { generateInstanceForDefinition, loadDefinitionForGeneration, syncLiveInstances } from "../../jobs/checklistInstanceGenerator.job.js"

export const refreshLiveChecklistsForDefinitions = async (definitionIds: Iterable<string>, label: string) => {
    for (const definitionId of new Set(definitionIds)) {
        try {
            const generation = await loadDefinitionForGeneration(definitionId)
            if (!generation) continue
            const now = new Date()
            await syncLiveInstances(generation, now)
            await generateInstanceForDefinition(generation, now)
        } catch (err) {
            console.error(`Updating today's checklist runs after ${label} failed for ${definitionId}:`, err)
        }
    }
}

export const refreshLiveChecklistsForUsers = async (userIds: string[], label: string) => {
    if (!userIds.length) return
    try {
        const rows = await db.selectDistinct({ id: checklistDefinitions.id })
            .from(checklistDefinitionAssignees)
            .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionAssignees.definitionId))
            .where(and(
                inArray(checklistDefinitionAssignees.userId, userIds),
                eq(checklistDefinitions.isActive, true),
                isNull(checklistDefinitions.deletedAt),
            ))
        await refreshLiveChecklistsForDefinitions(rows.map((r) => r.id), label)
    } catch (err) {
        console.error(`Finding checklists to refresh after ${label} failed:`, err)
    }
}
