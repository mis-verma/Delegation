import { asc, eq, gte, inArray, like } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { extraWorkingDays, users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { dropRunsNoLongerWorkingOn, generateDueInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import type { CreateExtraWorkingDayInput } from "./extraWorkingDay.validation.js"
import { extraDayCovers } from "../scores/workingDayRules.js"

export const extraWorkingDayService = {
    async list(year?: number) {
        const where = year ? like(extraWorkingDays.date, `${year}-%`) : undefined
        return db.select().from(extraWorkingDays).where(where).orderBy(asc(extraWorkingDays.date))
    },

    async mine(userId: string) {
        const [me] = await db.select({ departmentId: users.departmentId, storeId: users.storeId }).from(users).where(eq(users.id, userId)).limit(1)
        if (!me) return []
        const yesterday = orgLocalDate(Date.now() - 86_400_000)
        const rows = await db.select().from(extraWorkingDays).where(gte(extraWorkingDays.date, yesterday)).orderBy(asc(extraWorkingDays.date))
        const person = { id: userId, departmentId: me.departmentId, storeId: me.storeId }
        return rows
            .filter((d) => extraDayCovers({ scope: d.scope, targetIds: d.targetIds ?? [] }, person))
            .map((d) => ({ id: d.id, date: d.date, reason: d.reason }))
    },

    async create(input: CreateExtraWorkingDayInput, actorId: string) {
        const today = orgLocalDate(Date.now())
        if (input.dates.some((d) => d < today)) throw AppError.badRequest("Pick today or later dates. Past days can't get runs any more.")
        const targetIds = input.scope === "ALL" ? [] : [...new Set(input.targetIds)]
        const rows = input.dates.map((date) => ({ id: createId(), date, reason: input.reason, scope: input.scope, targetIds, createdBy: actorId }))
        await db.insert(extraWorkingDays).values(rows)
        const days = await db.select().from(extraWorkingDays).where(inArray(extraWorkingDays.id, rows.map((r) => r.id))).orderBy(asc(extraWorkingDays.date))
        await Promise.all(days.map((day) => auditService.record({ entityType: "ExtraWorkingDay", entityId: day.id, action: "CREATE", actorId, after: day })))
        void generateDueInstances().catch((err) => console.error("Creating runs for an extra working day failed:", err))
        return days
    },

    async remove(id: string, actorId: string) {
        const [day] = await db.select().from(extraWorkingDays).where(eq(extraWorkingDays.id, id)).limit(1)
        if (!day) throw AppError.notFound("Extra working day not found")
        await db.delete(extraWorkingDays).where(eq(extraWorkingDays.id, id))
        await auditService.record({ entityType: "ExtraWorkingDay", entityId: id, action: "DELETE", actorId, before: day })
        const removedRuns = day.date >= orgLocalDate(Date.now()) ? await dropRunsNoLongerWorkingOn(day.date) : 0
        return { day, removedRuns }
    },
}
