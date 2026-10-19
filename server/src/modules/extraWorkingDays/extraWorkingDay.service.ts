import { asc, eq, gte, like } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { extraWorkingDays, users } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { dropRunsNoLongerWorkingOn, generateDueInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import type { CreateExtraWorkingDayInput } from "./extraWorkingDay.validation.js"

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
        return rows
            .filter((d) => {
                const ids = d.targetIds ?? []
                if (d.scope === "ALL") return true
                if (d.scope === "PEOPLE") return ids.includes(userId)
                if (d.scope === "DEPARTMENT") return !!me.departmentId && ids.includes(me.departmentId)
                return !!me.storeId && ids.includes(me.storeId)
            })
            .map((d) => ({ id: d.id, date: d.date, reason: d.reason }))
    },

    async create(input: CreateExtraWorkingDayInput, actorId: string) {
        if (input.date < orgLocalDate(Date.now())) throw AppError.badRequest("Pick today or a later date. Past days can't get runs any more.")
        const id = createId()
        const targetIds = input.scope === "ALL" ? [] : [...new Set(input.targetIds)]
        await db.insert(extraWorkingDays).values({ id, date: input.date, reason: input.reason, scope: input.scope, targetIds, createdBy: actorId })
        const [day] = await db.select().from(extraWorkingDays).where(eq(extraWorkingDays.id, id)).limit(1)
        await auditService.record({ entityType: "ExtraWorkingDay", entityId: id, action: "CREATE", actorId, after: day })
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
        const removedRuns = day.date === orgLocalDate(Date.now()) ? await dropRunsNoLongerWorkingOn(day.date) : 0
        return { day, removedRuns }
    },
}
