import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistDefinitions, checklistDefinitionAssignees } from "../../db/schema/index.js"
import { generateInstanceForDefinition, loadDefinitionForGeneration, syncLiveInstances } from "../../jobs/checklistInstanceGenerator.job.js"

// Today's live checklist runs follow a person's changes straight away: the same pattern the
// offboarding flow uses (load the definition, sync the runs already stamped out today, then stamp
// out anything newly due). Always best-effort: a failure is logged and never fails the user change
// that triggered it, because the nightly sweep corrects any run this misses.
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

// Every active checklist these people are assigned to gets its live runs refreshed. Used when a
// person's week-off days, department or store change (which decide who gets which run).
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
