import { db } from "../../config/db.js"
import { holidays } from "../../db/schema/core.js"
import { asc, eq, inArray, like } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { dropUntouchedDailyRunsOn, previewDailyRunsOn } from "../../jobs/checklistInstanceGenerator.job.js"
import { orgLocalDate } from "../checklistInstances/checklistReportRange.js"
import type { CreateHolidayInput } from "./holiday.validation.js"

// Company-wide days off. The generator reads the table directly (checklistInstanceGenerator.job.ts's
// isHoliday) so no run is created on these dates; adding one here also clears that day's runs that
// nobody has started, so the day can't drag a score down.
export const holidayService = {
    async list(year?: number) {
        const where = year ? like(holidays.date, `${year}-%`) : undefined
        return db.select().from(holidays).where(where).orderBy(asc(holidays.date))
    },

    async create(input: CreateHolidayInput, actorId: string) {
        const [existing] = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, input.date)).limit(1)
        if (existing) throw AppError.conflict("That date is already a holiday.")

        const id = createId()
        await db.insert(holidays).values({ id, date: input.date, name: input.name, createdBy: actorId })
        const [holiday] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1)

        await auditService.record({ entityType: "Holiday", entityId: id, action: "CREATE", actorId, after: holiday })
        const removedRuns = await dropUntouchedDailyRunsOn(input.date)
        return { holiday, removedRuns }
    },

    // Several at once; dates that are already holidays are skipped, not errors, so pressing "add the
    // national holidays" twice is harmless.
    async createMany(entries: CreateHolidayInput[], actorId: string) {
        const unique = [...new Map(entries.map((e) => [e.date, e])).values()]
        const taken = new Set(
            (await db.select({ date: holidays.date }).from(holidays).where(inArray(holidays.date, unique.map((e) => e.date)))).map((r) => r.date),
        )
        const fresh = unique.filter((e) => !taken.has(e.date))

        let removedRuns = 0
        for (const entry of fresh) {
            const id = createId()
            await db.insert(holidays).values({ id, date: entry.date, name: entry.name, createdBy: actorId })
            await auditService.record({ entityType: "Holiday", entityId: id, action: "CREATE", actorId, after: { date: entry.date, name: entry.name } })
            removedRuns += await dropUntouchedDailyRunsOn(entry.date)
        }
        return { created: fresh.length, skipped: unique.length - fresh.length, removedRuns }
    },

    // Dry run for the "add a holiday" confirmation: how many of that day's daily runs nobody has started
    // (adding the holiday removes these, from history too when the date is in the past) and how many
    // someone has started (these stay). Writes nothing.
    async preview(date: string) {
        return previewDailyRunsOn(date)
    },

    // `backfilled` tells the client what to promise: the generator only creates runs for today, never
    // for days gone by, so removing a past holiday does not bring its runs back (false); removing
    // today's or a future one lets the next sweep generate the run again (true).
    async remove(id: string, actorId: string) {
        const [holiday] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1)
        if (!holiday) throw AppError.notFound("Holiday not found")
        await db.delete(holidays).where(eq(holidays.id, id))
        await auditService.record({ entityType: "Holiday", entityId: id, action: "DELETE", actorId, before: holiday })
        return { holiday, backfilled: holiday.date >= orgLocalDate(Date.now()) }
    },
}
