import { asc, eq, like } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { extraWorkingDays } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { dropRunsNoLongerWorkingOn, generateDueInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import type { CreateExtraWorkingDayInput } from "./extraWorkingDay.validation.js"

// Days people work although they are normally off (Sunday overtime and the like). The checklist generator
// reads the table directly (checklistInstanceGenerator.job.ts's applyWorkingDayRules); adding today's date
// creates the runs straight away, and removing it takes back the runs nobody started.
export const extraWorkingDayService = {
    async list(year?: number) {
        const where = year ? like(extraWorkingDays.date, `${year}-%`) : undefined
        return db.select().from(extraWorkingDays).where(where).orderBy(asc(extraWorkingDays.date))
    },

    async create(input: CreateExtraWorkingDayInput, actorId: string) {
        // The generator never goes back in time, so a day that has already passed would do nothing.
        if (input.date < orgLocalDate(Date.now())) throw AppError.badRequest("Pick today or a later date. Past days can't get runs any more.")
        const id = createId()
        const targetIds = input.scope === "ALL" ? [] : [...new Set(input.targetIds)]
        await db.insert(extraWorkingDays).values({ id, date: input.date, reason: input.reason, scope: input.scope, targetIds, createdBy: actorId })
        const [day] = await db.select().from(extraWorkingDays).where(eq(extraWorkingDays.id, id)).limit(1)
        await auditService.record({ entityType: "ExtraWorkingDay", entityId: id, action: "CREATE", actorId, after: day })
        // Today: make the runs now instead of waiting for the next half-hourly sweep.
        if (input.date === orgLocalDate(Date.now())) {
            await generateDueInstances().catch((err) => console.error("Creating runs for today's extra working day failed:", err))
        }
        return day
    },

    async remove(id: string, actorId: string) {
        const [day] = await db.select().from(extraWorkingDays).where(eq(extraWorkingDays.id, id)).limit(1)
        if (!day) throw AppError.notFound("Extra working day not found")
        await db.delete(extraWorkingDays).where(eq(extraWorkingDays.id, id))
        await auditService.record({ entityType: "ExtraWorkingDay", entityId: id, action: "DELETE", actorId, before: day })
        // Today: runs it created that nobody started come back off people's lists.
        const removedRuns = day.date === orgLocalDate(Date.now()) ? await dropRunsNoLongerWorkingOn(day.date) : 0
        return { day, removedRuns }
    },
}
