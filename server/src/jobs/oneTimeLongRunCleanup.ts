import { and, eq } from "drizzle-orm"
import { db } from "../config/db.js"
import { auditLogs } from "../db/schema/core.js"
import { auditService } from "../modules/audit/audit.service.js"
import { dropUntouchedLongRuns } from "./checklistInstanceGenerator.job.js"

const MARKER = { entityType: "ChecklistRun", entityId: "long-runs", action: "CLEAN_LONG_RUNS" } as const

export const runOneTimeLongRunCleanup = async (): Promise<void> => {
    const [done] = await db.select({ id: auditLogs.id }).from(auditLogs)
        .where(and(eq(auditLogs.entityType, MARKER.entityType), eq(auditLogs.action, MARKER.action)))
        .limit(1)
    if (done) return

    const { found, removed } = await dropUntouchedLongRuns(true)
    await auditService.record({ ...MARKER, actorId: "system", after: { found, removed } })
    console.log(`[long-run-cleanup] removed ${removed} untouched whole-period run(s) of ${found} found`)
}
