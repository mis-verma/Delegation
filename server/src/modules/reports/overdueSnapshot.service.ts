import { and, desc, eq, lte, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { overdueSnapshots } from "../../db/schema/core.js"
import { ticketService } from "../tickets/ticket.service.js"
import { taskService } from "../tasks/task.service.js"
import { orgToday } from "../scores/scoreExplorer.service.js"

type Kind = "TICKETS" | "DELEGATIONS"

const upsert = async (day: string, kind: Kind, count: number) => {
    await db.insert(overdueSnapshots).values({ day, kind, count }).onDuplicateKeyUpdate({ set: { count, createdAt: sql`CURRENT_TIMESTAMP` } })
}

export const overdueSnapshotService = {
    async record(day: string = orgToday()) {
        const [tickets] = await ticketService.ownerStats("org")
        const [delegations] = await taskService.ownerStats("org")
        await upsert(day, "TICKETS", tickets?.overdueCount ?? 0)
        await upsert(day, "DELEGATIONS", delegations?.overdueCount ?? 0)
    },

    async countOn(day: string, kind: Kind): Promise<number | null> {
        const [row] = await db.select({ count: overdueSnapshots.count })
            .from(overdueSnapshots)
            .where(and(eq(overdueSnapshots.kind, kind), lte(overdueSnapshots.day, day)))
            .orderBy(desc(overdueSnapshots.day))
            .limit(1)
        return row?.count ?? null
    },

    async before(day: string) {
        const [tickets, delegations] = await Promise.all([this.countOn(day, "TICKETS"), this.countOn(day, "DELEGATIONS")])
        return { day, tickets, delegations }
    },
}
