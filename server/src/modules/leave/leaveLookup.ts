import { and, gte, inArray, lte } from "drizzle-orm"
import { db } from "../../config/db.js"
import { personLeaves } from "../../db/schema/core.js"

export const leaveUserIdsOn = async (dateStr: string, userIds: string[]): Promise<Set<string>> => {
    if (!userIds.length) return new Set()
    const rows = await db.select({ userId: personLeaves.userId }).from(personLeaves)
        .where(and(inArray(personLeaves.userId, userIds), lte(personLeaves.startDate, dateStr), gte(personLeaves.endDate, dateStr)))
    return new Set(rows.map((r) => r.userId))
}
