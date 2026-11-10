import { and, eq, inArray, sql, type SQL } from "drizzle-orm"
import { db } from "../../config/db.js"
import { checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories } from "../../db/schema/index.js"

export const AUDIT_PASS_PCT = 80
const PASS_FRACTION = AUDIT_PASS_PCT / 100 - 1e-9

export type AuditAccessory = { checked: boolean; isCritical?: boolean; points?: number | null }

export const accessoryPoints = (a: Pick<AuditAccessory, "points">): number => (a.points && a.points > 0 ? a.points : 1)

export type AuditPerson = {
    isDone: boolean
    isNotApplicable: boolean
    accessories: readonly AuditAccessory[]
}

const counts = (person: AuditPerson) => !person.isNotApplicable && person.isDone && person.accessories.length > 0

export const personMissedCritical = (person: AuditPerson): boolean =>
    counts(person) && person.accessories.some((a) => a.isCritical && !a.checked)

export const personAuditScore = (person: AuditPerson): number | null => {
    if (!counts(person)) return null
    if (personMissedCritical(person)) return 0
    const total = person.accessories.reduce((sum, a) => sum + accessoryPoints(a), 0)
    const kept = person.accessories.reduce((sum, a) => sum + (a.checked ? accessoryPoints(a) : 0), 0)
    return kept / total
}

export const auditItemScore = (people: readonly AuditPerson[]): number | null => {
    const scores = people.map(personAuditScore).filter((s): s is number => s !== null)
    if (!scores.length) return null
    return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

export const auditMissedCritical = (people: readonly AuditPerson[]): boolean => people.some(personMissedCritical)

export const auditPasses = (score: number, missedCritical = false): boolean => !missedCritical && score >= PASS_FRACTION

const criticalMissedSql = (submissionId: SQL): SQL => sql`EXISTS (
    SELECT 1 FROM ${checklistInstanceItemSubmissionAccessories} cac
    WHERE cac.submissionId = ${submissionId} AND cac.isCritical = 1 AND cac.checked = 0
)`

export const auditFractionSql = (itemId: SQL): SQL => sql`(
    SELECT AVG(CASE WHEN ${criticalMissedSql(sql`asu.id`)} THEN 0 ELSE (
        SELECT SUM(CASE WHEN aac.checked = 1 THEN GREATEST(aac.points, 1) ELSE 0 END) * 1e0 / SUM(GREATEST(aac.points, 1))
        FROM ${checklistInstanceItemSubmissionAccessories} aac
        WHERE aac.submissionId = asu.id
    ) END)
    FROM ${checklistInstanceItemSubmissions} asu
    WHERE asu.itemId = ${itemId} AND asu.isDone = 1 AND asu.isNotApplicable = 0
)`

export const auditCriticalMissedSql = (itemId: SQL): SQL => sql`EXISTS (
    SELECT 1 FROM ${checklistInstanceItemSubmissions} csu
    WHERE csu.itemId = ${itemId} AND csu.isDone = 1 AND csu.isNotApplicable = 0 AND ${criticalMissedSql(sql`csu.id`)}
)`

export const auditPassSql = (itemId: SQL, fraction: SQL): SQL => sql`(${fraction} >= ${PASS_FRACTION} AND NOT ${auditCriticalMissedSql(itemId)})`

export const loadAuditItemScore = async (itemId: string): Promise<number | null> => {
    const people = await db.select({ id: checklistInstanceItemSubmissions.id, isDone: checklistInstanceItemSubmissions.isDone, isNotApplicable: checklistInstanceItemSubmissions.isNotApplicable })
        .from(checklistInstanceItemSubmissions)
        .where(eq(checklistInstanceItemSubmissions.itemId, itemId))
    const ids = people.map((p) => p.id)
    const accessories = ids.length
        ? await db.select({
            submissionId: checklistInstanceItemSubmissionAccessories.submissionId,
            checked: checklistInstanceItemSubmissionAccessories.checked,
            isCritical: checklistInstanceItemSubmissionAccessories.isCritical,
            points: checklistInstanceItemSubmissionAccessories.points,
        })
            .from(checklistInstanceItemSubmissionAccessories)
            .where(and(inArray(checklistInstanceItemSubmissionAccessories.submissionId, ids)))
        : []
    return auditItemScore(people.map((p) => ({
        isDone: p.isDone,
        isNotApplicable: p.isNotApplicable,
        accessories: accessories.filter((a) => a.submissionId === p.id),
    })))
}
