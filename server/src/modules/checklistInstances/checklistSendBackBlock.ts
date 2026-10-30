import { and, eq, lte, ne, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistDefinitions, checklistInstanceAssignees, checklistInstances } from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"

export const SEND_BACK_GRACE_MS = 2 * 60 * 60 * 1000

export const SEND_BACK_BLOCK_MESSAGE = "A checklist was sent back to you. Fix it first, then carry on with your other checklists."

export const sendBackGraceEnded = (sentBackAt: Date | null, now: number): boolean =>
    sentBackAt !== null && now - sentBackAt.getTime() >= SEND_BACK_GRACE_MS

export const assertNoSendBackBlock = async (
    instanceId: string,
    verificationStatus: string,
    userId: string | undefined,
    now: Date,
) => {
    if (!userId || verificationStatus === "REJECTED") return
    const [blocking] = await db
        .select({ id: checklistInstances.id })
        .from(checklistInstances)
        .innerJoin(checklistInstanceAssignees, eq(checklistInstanceAssignees.instanceId, checklistInstances.id))
        .where(and(
            eq(checklistInstanceAssignees.userId, userId),
            eq(checklistInstances.verificationStatus, "REJECTED"),
            lte(checklistInstances.sentBackAt, new Date(now.getTime() - SEND_BACK_GRACE_MS)),
            ne(checklistInstances.id, instanceId),
            sql`NOT EXISTS (SELECT 1 FROM ${checklistDefinitions} d WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL)`,
        ))
        .limit(1)
    if (blocking) throw AppError.badRequest(SEND_BACK_BLOCK_MESSAGE)
}
