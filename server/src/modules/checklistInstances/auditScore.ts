import { and, eq, inArray, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories } from "../../db/schema/index.js"

export const AUDIT_PASS_PCT = 80
const PASS_FRACTION = AUDIT_PASS_PCT / 100 - 1e-9

export type AuditPerson = {
    isDone: boolean
    isNotApplicable: boolean
    accessories: readonly { checked: boolean }[]
}

export const personAuditScore = (person: AuditPerson): number | null => {
    if (person.isNotApplicable || !person.isDone || person.accessories.length === 0) return null
    return person.accessories.filter((a) => a.checked).length / person.accessories.length
}

export const auditItemScore = (people: readonly AuditPerson[]): number | null => {
    const scores = people.map(personAuditScore).filter((s): s is number => s !== null)
    if (!scores.length) return null
    return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

export const auditPasses = (score: number): boolean => score >= PASS_FRACTION

export const auditFractionSql = (itemId: SQL): SQL => sql`(
    SELECT AVG((
        SELECT SUM(aac.checked) * 1e0 / COUNT(*)
        FROM ${checklistInstanceItemSubmissionAccessories} aac
        WHERE aac.submissionId = asu.id
    ))
    FROM ${checklistInstanceItemSubmissions} asu
    WHERE asu.itemId = ${itemId} AND asu.isDone = 1 AND asu.isNotApplicable = 0
)`

export const auditPassSql = (fraction: SQL): SQL => sql`(${fraction} >= ${PASS_FRACTION})`

export const loadAuditItemScore = async (itemId: string): Promise<number | null> => {
    const people = await db.select({ id: checklistInstanceItemSubmissions.id, isDone: checklistInstanceItemSubmissions.isDone, isNotApplicable: checklistInstanceItemSubmissions.isNotApplicable })
        .from(checklistInstanceItemSubmissions)
        .where(eq(checklistInstanceItemSubmissions.itemId, itemId))
    const ids = people.map((p) => p.id)
    const accessories = ids.length
        ? await db.select({ submissionId: checklistInstanceItemSubmissionAccessories.submissionId, checked: checklistInstanceItemSubmissionAccessories.checked })
            .from(checklistInstanceItemSubmissionAccessories)
            .where(and(inArray(checklistInstanceItemSubmissionAccessories.submissionId, ids)))
        : []
    return auditItemScore(people.map((p) => ({
        isDone: p.isDone,
        isNotApplicable: p.isNotApplicable,
        accessories: accessories.filter((a) => a.submissionId === p.id),
    })))
}
