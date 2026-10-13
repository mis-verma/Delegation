import ExcelJS from "exceljs"
import type { Response } from "express"
import { and, eq, gte, lte, notInArray, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/mysql-core"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { checklistDefinitions } from "../../db/schema/checklistDefinition.js"
import { checklistInstanceAssignees, checklistInstanceItems, checklistInstances } from "../../db/schema/checklistInstance.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { streamCsv, type CsvColumn } from "../../utils/csv.js"
import { hasExtraDay, isIdleHolidayRun, loadOffDayRules, type RunAssignee } from "../scores/offDayRules.js"
import { metDeadlinePct, onTimeOfFinishedPct, pooledCompliancePct, runCompletionPct, tallyRuns, type RunOutcome, type RunTally } from "../scores/scoreFormulas.js"
import type { ChecklistReportGrouping, ChecklistReportQuery } from "./checklistReport.validation.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportMetrics = {
    assigned: number
    completed: number
    /** Run based: completed / due. Runs still open before their deadline are in neither side. */
    completionPct: number | null
    onTime: number
    /** Same figure as onTimeOfFinishedPct, kept for older callers: on time / completed. */
    onTimePct: number | null
    /** On time / completed ("of finished"). */
    onTimeOfFinishedPct: number | null
    /** On time / due: a late or missed run both count against it. */
    metDeadlinePct: number | null
    /** completed + missed: runs whose deadline has passed, or that are done. */
    due: number
    /** Not completed and still before the deadline. In no percentage and not missed. */
    open: number
    missed: number
    submitted: number
    approved: number
    sentBack: number
    questionsDone: number
    notApplicable: number
    answersChecked: number
    /** Pooled weighted compliance: weightedGood / weightedScored over every checked answer. */
    compliancePct: number | null
    /** The raw weights behind compliancePct (critical x2), so rows can be pooled without averaging percentages. */
    weightedGood: number
    weightedScored: number
}

export type PersonRow = ReportMetrics & {
    userId: string
    name: string
    role: string
    department: string
    store: string
    status: "Active" | "Left"
}

export type DepartmentRow = ReportMetrics & {
    departmentId: string | null
    department: string
    people: number
}

/** One person's runs and answers inside one store: the same figures as `build` with that store as the filter. */
export type StorePersonRow = ReportMetrics & { userId: string; storeId: string }
/** One store's runs (each counted once) with every checked answer on them, whoever gave it. */
export type StoreTotalRow = ReportMetrics & { storeId: string }

export type ChecklistReport = {
    from: string
    to: string
    generatedAt: string
    storeName: string | null
    departmentName: string | null
    // True when the department filter was forced by the caller's role (MANAGER / SENIOR).
    departmentLocked: boolean
    people: PersonRow[]
    departments: DepartmentRow[]
    /** Only when asked for (`byStore`): every person's figures split by the store of each run. */
    storePeople?: StorePersonRow[]
    /** Only when asked for (`byStore`): one row per store, each run counted once. */
    storeTotals?: StoreTotalRow[]
    /** Every run in scope counted once (never once per assignee) with every checked answer on those runs. */
    totals: ReportMetrics
    notes: string[]
}

export const REPORT_NOTES = [
    "A person is counted on every checklist assigned to them. A department, a store and the overall total count each checklist once, even when several people share it, so a department can differ from the sum of its people.",
    "Checklists due = completed + missed. A checklist is due once its cutoff has passed or it is completed. One still open before its cutoff is shown as Open and is in no percentage.",
    "Completion % = completed / due. There is no partial credit for a checklist that is only partly filled.",
    "On time % = completed before the cutoff / completed. Met deadline % = completed before the cutoff / due, so a missed checklist counts against it. A checklist with no cutoff is due at the end of its day.",
    "Compliance % is pooled: the weighted good answers divided by the weighted checked answers (Answers checked counts each question once). A critical question counts double, for or against. It is never an average of people's percentages.",
    "Only completed questions with an accepted-answer rule are checked. A question a reviewer sent back counts as a failed check for the person who had done it, even if it was redone well, and even if it has no accepted-answer rule. Not applicable and waived questions are left out.",
    "A person's Compliance % covers the answers credited to them, a department's the answers credited to its people, and a store's and the overall total every checked answer on those checklists, whoever gave it.",
    "This report covers every kind of checklist (daily, weekly, monthly and one-time), so its totals can be higher than the daily-only Fill report. A checklist that has not opened yet, has no questions, or is a daily one left unfinished on a holiday (with no extra working day covering it) is not counted.",
]

const NO_DEPARTMENT_KEY = "__none__"
const NO_DEPARTMENT_LABEL = "No department"

// ---------------------------------------------------------------------------
// SQL fragments
// ---------------------------------------------------------------------------

// Same idea as parentNotDeletedExpr in checklistInstance.service.ts (not exported there): a
// checklist whose template was soft-deleted drops out of every view, reports included.
const parentNotDeletedExpr = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

const item = checklistInstanceItems

// Mirrors answerVerdict() in client/src/features/checklist/checklistCompliance.ts. An item is
// scored only when it is done, not "not applicable", has an accepted-answer rule that fits its
// type, and carries an answer to compare. The three shapes of "has an answer inside a rule":
//  - YES_NO / PASS_FAIL: booleanAnswer set and acceptableAnswers non-empty
//  - MULTIPLE_CHOICE / DROPDOWN: textValue set (non-empty) and acceptableAnswers non-empty
//  - NUMBER_ENTRY / RATING: numericValue set and at least one of acceptableMin / acceptableMax
const boolScored = sql`(${item.itemType} IN ('YES_NO','PASS_FAIL') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.booleanAnswer} IS NOT NULL)`
const textScored = sql`(${item.itemType} IN ('MULTIPLE_CHOICE','DROPDOWN') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.textValue} IS NOT NULL AND ${item.textValue} <> '')`
const numScored = sql`(${item.itemType} IN ('NUMBER_ENTRY','RATING') AND (${item.acceptableMin} IS NOT NULL OR ${item.acceptableMax} IS NOT NULL) AND ${item.numericValue} IS NOT NULL)`

// A question a reviewer sent back (sendBackCount > 0) is a FAILED check whatever its answer is now,
// even if redone well later and even if it has no accepted-answer rule: it was not right first time.
// It stays scored, and counts as not good, on the person who had done it (sentBackFrom).
// A WAIVED question (a reviewer excused it, with a reason) is left out of compliance entirely.
const sentBack = sql`(${item.sendBackCount} > 0 AND ${item.isNotApplicable} = 0 AND ${item.waivedAt} IS NULL)`
const ruleScored = sql`(${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${item.waivedAt} IS NULL AND (${boolScored} OR ${textScored} OR ${numScored}))`

const scoredExpr = sql<number>`SUM(CASE WHEN ${sentBack} THEN 1 WHEN ${ruleScored} THEN 1 ELSE 0 END)`
const goodExpr = sql<number>`SUM(CASE
    WHEN ${item.waivedAt} IS NOT NULL THEN 0
    WHEN ${sentBack} THEN 0
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${boolScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.booleanAnswer})) THEN 1
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${textScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.textValue})) THEN 1
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${numScored}
        AND (${item.acceptableMin} IS NULL OR ${item.numericValue} >= ${item.acceptableMin})
        AND (${item.acceptableMax} IS NULL OR ${item.numericValue} <= ${item.acceptableMax}) THEN 1
    ELSE 0 END)`

// A critical question counts double in Compliance %: weighted twins of scoredExpr/goodExpr above
// (Answers checked stays the raw count).
const weightExpr = sql`(CASE WHEN ${item.isCritical} = 1 THEN 2 ELSE 1 END)`
const weightedScoredBody = sql`(CASE WHEN ${sentBack} THEN ${weightExpr} WHEN ${ruleScored} THEN ${weightExpr} ELSE 0 END)`
const weightedGoodBody = sql`(CASE
    WHEN ${item.waivedAt} IS NOT NULL THEN 0
    WHEN ${sentBack} THEN 0
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${boolScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.booleanAnswer})) THEN ${weightExpr}
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${textScored} AND JSON_CONTAINS(${item.acceptableAnswers}, JSON_QUOTE(${item.textValue})) THEN ${weightExpr}
    WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 AND ${numScored}
        AND (${item.acceptableMin} IS NULL OR ${item.numericValue} >= ${item.acceptableMin})
        AND (${item.acceptableMax} IS NULL OR ${item.numericValue} <= ${item.acceptableMax}) THEN ${weightExpr}
    ELSE 0 END)`
export const weightedScoredExpr = sql<number>`SUM(${weightedScoredBody})`
export const weightedGoodExpr = sql<number>`SUM(${weightedGoodBody})`

// The same two figures, counting only the questions credited to people of one department. A department
// head looking at a checklist shared across departments sees their own people's answers, not the other
// departments' (who a question is credited to is explained under creditedUser below).
const creditedToDepartment = (departmentId: string) => sql`EXISTS (
    SELECT 1 FROM ${users} cu
    WHERE cu.id = (CASE WHEN ${item.sendBackCount} > 0 AND ${item.sentBackFrom} IS NOT NULL THEN ${item.sentBackFrom} ELSE ${item.completedBy} END)
      AND cu.departmentId = ${departmentId}
)`
export const weightedScoredForDepartment = (departmentId: string) => sql<number>`SUM(CASE WHEN ${creditedToDepartment(departmentId)} THEN ${weightedScoredBody} ELSE 0 END)`
export const weightedGoodForDepartment = (departmentId: string) => sql<number>`SUM(CASE WHEN ${creditedToDepartment(departmentId)} THEN ${weightedGoodBody} ELSE 0 END)`

// Who a question is credited to: whoever completed it, except a sent-back question, which is credited
// (as a failure) to the person who had done it when it was sent back.
const creditedUser = sql<string | null>`(CASE WHEN ${item.sendBackCount} > 0 AND ${item.sentBackFrom} IS NOT NULL THEN ${item.sentBackFrom} ELSE ${item.completedBy} END)`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunRow = {
    id: string
    storeId: string
    recurrence: string
    periodStart: Date
    periodEnd: Date
    cutoffTime: string | null
    opensTime: string | null
    verificationStatus: string
    rejectionCount: number
    submittedAt: Date | null
    total: number
    done: number
    lastDoneAt: Date | null
    completedFirstAt: Date | null
}

/** What one run came to. `skip`: not counted at all (not opened yet, no questions, or an idle daily run on a holiday). */
type RunFlags = RunOutcome & { skip: boolean; storeId: string }

const emptyItemAcc = () => ({ done: 0, na: 0, scored: 0, good: 0, wScored: 0, wGood: 0 })
type ItemAcc = ReturnType<typeof emptyItemAcc>

const addItems = (into: ItemAcc, from: ItemAcc) => {
    into.done += from.done
    into.na += from.na
    into.scored += from.scored
    into.good += from.good
    into.wScored += from.wScored
    into.wGood += from.wGood
}

// Run counts come from the shared run formulas (scoreFormulas.ts), answers are pooled from their raw
// weights: compliance is weightedGood / weightedScored, never an average of percentages.
const toMetrics = (r: RunTally, i: ItemAcc): ReportMetrics => ({
    assigned: r.assigned,
    completed: r.completed,
    completionPct: runCompletionPct(r),
    onTime: r.onTime,
    onTimePct: onTimeOfFinishedPct(r.onTime, r.completed),
    onTimeOfFinishedPct: onTimeOfFinishedPct(r.onTime, r.completed),
    metDeadlinePct: metDeadlinePct(r.onTime, r.due),
    due: r.due,
    open: r.open,
    missed: r.missed,
    submitted: r.submitted,
    approved: r.approved,
    sentBack: r.sentBack,
    questionsDone: i.done,
    notApplicable: i.na,
    answersChecked: i.scored,
    compliancePct: pooledCompliancePct([{ weightedGood: i.wGood, weightedScored: i.wScored }]),
    weightedGood: i.wGood,
    weightedScored: i.wScored,
})


// Worst completion first so the people who need a conversation are at the top; a missing
// percentage (nothing assigned) sorts last.
const byCompletionThenName = (a: { completionPct: number | null }, b: { completionPct: number | null }, an: string, bn: string) =>
    (a.completionPct ?? 101) - (b.completionPct ?? 101) || an.localeCompare(bn)

const resolveDepartmentScope = (user: AccessTokenPayload, requested?: string): { departmentId?: string; locked: boolean } => {
    if (user.role === "ADMIN" || user.role === "PC") return { departmentId: requested, locked: false }
    if (user.role === "MANAGER" || user.role === "SENIOR") {
        // No department on the record means no people to show, not "everyone": this id matches nothing.
        return { departmentId: user.departmentId ?? "no-department", locked: true }
    }
    throw AppError.forbidden()
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export const checklistReportService = {
    /**
     * `onlyUserId` narrows the report to one person's runs and answers. It skips the role check, so the
     * caller (the scores module) must already have decided the viewer may see that person.
     * `options.byStore` also returns `storePeople` and `storeTotals`: each person's figures per store and
     * each store's own totals, in the same single pass, so a caller scoring every store does not have to
     * build the report once per store.
     *
     * Counting rules (the same everywhere, see scores/scoreFormulas.ts): a run is counted when it is real
     * work (opened, has questions, not an idle daily run on a holiday). A person row counts the runs they
     * are assigned; a department, a store and `totals` count every run ONCE, however many people it is
     * assigned to. Compliance pools every checked answer on the counted runs: a person row the answers
     * credited to them, a department row the answers credited to its people, a store row and `totals` every
     * answer on those runs whoever gave it.
     */
    async build(
        user: AccessTokenPayload,
        query: Pick<ChecklistReportQuery, "from" | "to" | "storeId" | "departmentId" | "groupBy">,
        onlyUserId?: string,
        options: { byStore?: boolean } = {},
    ): Promise<ChecklistReport> {
        const wantStores = options.byStore === true
        const { departmentId, locked } = onlyUserId ? { departmentId: undefined, locked: false } : resolveDepartmentScope(user, query.departmentId)
        const { from, to, storeId, groupBy } = query
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const now = Date.now()

        // Runs in range, minus soft-deleted checklists, minus other stores. With a department filter
        // only runs that have someone from that department assigned matter, which keeps the item
        // pass below small for a department head.
        const runConditions = [
            gte(checklistInstances.periodStart, new Date(`${from}T00:00:00.000Z`)),
            lte(checklistInstances.periodStart, new Date(`${to}T00:00:00.000Z`)),
            parentNotDeletedExpr,
        ]
        if (storeId) runConditions.push(eq(checklistInstances.storeId, storeId))
        if (onlyUserId) {
            runConditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a3
                WHERE a3.instanceId = ${checklistInstances.id} AND a3.userId = ${onlyUserId}
            )`)
        }
        if (departmentId) {
            runConditions.push(sql`EXISTS (
                SELECT 1 FROM ${checklistInstanceAssignees} a2
                INNER JOIN ${users} u2 ON u2.id = a2.userId
                WHERE a2.instanceId = ${checklistInstances.id} AND u2.departmentId = ${departmentId}
            )`)
        }
        const runWhere = and(...runConditions)

        const [runRows, assigneeRows, departmentRows, storeRows, offDayRules] = await Promise.all([
            // One row per run, items folded into counts.
            db.select({
                id: checklistInstances.id,
                storeId: checklistInstances.storeId,
                recurrence: checklistInstances.recurrence,
                periodStart: checklistInstances.periodStart,
                periodEnd: checklistInstances.periodEnd,
                cutoffTime: checklistInstances.cutoffTime,
                opensTime: checklistInstances.opensTime,
                verificationStatus: checklistInstances.verificationStatus,
                rejectionCount: checklistInstances.rejectionCount,
                submittedAt: checklistInstances.submittedAt,
                total: sql<number>`COUNT(${item.id})`,
                done: sql<number>`COALESCE(SUM(${item.isDone}), 0)`,
                lastDoneAt: sql<Date | null>`MAX(${item.completedAt})`.mapWith(item.completedAt),
                completedFirstAt: checklistInstances.completedFirstAt,
            })
                .from(checklistInstances)
                .leftJoin(item, eq(item.instanceId, checklistInstances.id))
                .where(runWhere)
                .groupBy(
                    checklistInstances.id, checklistInstances.storeId, checklistInstances.recurrence, checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime,
                    checklistInstances.opensTime, checklistInstances.verificationStatus, checklistInstances.rejectionCount, checklistInstances.submittedAt,
                    checklistInstances.completedFirstAt,
                ),
            // Who each run belongs to, with the person's details, so there is no per-person lookup.
            db.select({
                instanceId: checklistInstanceAssignees.instanceId,
                userId: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                role: users.role,
                departmentId: users.departmentId,
                storeId: users.storeId,
                isActive: users.isActive,
                // The store the run belongs to (not the person's own store), for the per-store split.
                instanceStoreId: checklistInstances.storeId,
            })
                .from(checklistInstanceAssignees)
                .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
                .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                .where(and(runWhere, departmentId ? eq(users.departmentId, departmentId) : undefined, onlyUserId ? eq(users.id, onlyUserId) : undefined)),
            db.select({ id: departments.id, name: departments.name }).from(departments),
            db.select({ id: stores.id, name: stores.name }).from(stores),
            // Holidays and extra working days in the window, so an idle daily run on a holiday is not a miss.
            loadOffDayRules(from, to),
        ])

        const departmentNames = new Map(departmentRows.map((d) => [d.id, d.name]))
        const storeNames = new Map(storeRows.map((s) => [s.id, s.name]))

        const assigneesByRun = new Map<string, RunAssignee[]>()
        for (const a of assigneeRows) {
            const list = assigneesByRun.get(a.instanceId)
            const entry = { id: a.userId, departmentId: a.departmentId, storeId: a.storeId }
            if (list) list.push(entry)
            else assigneesByRun.set(a.instanceId, [entry])
        }

        // Deadline = periodStart (the org-local day as UTC midnight) + cutoff clock time - org offset.
        // An overnight window (cutoff earlier than opens) rolls to the next day. No cutoff = end of day.
        const flagsOf = (r: RunRow): RunFlags => {
            const total = Number(r.total)
            const complete = total > 0 && Number(r.done) === total
            let deadline: number
            if (!r.cutoffTime) {
                deadline = r.periodEnd.getTime() - offsetMs
            } else {
                const [h, m] = r.cutoffTime.split(":").map(Number)
                let minutes = h * 60 + m
                if (r.opensTime && r.cutoffTime < r.opensTime) minutes += 24 * 60
                deadline = r.periodStart.getTime() + minutes * 60_000 - offsetMs
            }
            const status = r.verificationStatus
            const done = Number(r.done)
            // When the run opens for filling: the opens time that day, or the start of the day.
            let opensAt = r.periodStart.getTime() - offsetMs
            if (r.opensTime) {
                const [oh, om] = r.opensTime.split(":").map(Number)
                opensAt += (oh * 60 + om) * 60_000
            }
            const date = r.periodStart.toISOString().slice(0, 10)
            const idleHoliday = isIdleHolidayRun(offDayRules, { date, recurrence: r.recurrence, complete, storeId: r.storeId }, hasExtraDay(offDayRules, date) ? assigneesByRun.get(r.id) ?? [] : [])
            const skip = total === 0 || idleHoliday || (done === 0 && opensAt > now)
            return {
                id: r.id,
                storeId: r.storeId,
                skip,
                complete,
                onTime: complete && (() => { const doneAt = r.completedFirstAt ?? r.lastDoneAt; return !doneAt || doneAt.getTime() <= deadline })(),
                missed: !complete && now > deadline,
                submitted: r.submittedAt != null || status === "PENDING_APPROVAL" || status === "APPROVED",
                approved: status === "APPROVED",
                sentBack: r.rejectionCount > 0,
            }
        }
        const flagsByRun = new Map<string, RunFlags>(runRows.map((r) => [r.id, flagsOf(r)]))
        const countedRuns = [...flagsByRun.values()].filter((f) => !f.skip)
        // Runs that are not counted but carry answers (an unfinished daily run on a holiday): their answers
        // must not count either, so a skipped run is skipped everywhere.
        const skippedRunIds = [...flagsByRun.values()].filter((f) => f.skip).map((f) => f.id)

        // Item-level numbers by the person each answer is credited to (who completed it, or who had done it
        // when it was sent back) and that person's department, over the counted runs. Answers with nobody
        // credited are kept too: they only count in totals, where every answer on a run counts.
        const cu = alias(users, "cu")
        const itemWhere = and(runWhere, sql`(${item.isDone} = 1 OR ${item.sendBackCount} > 0)`, skippedRunIds.length ? notInArray(item.instanceId, skippedRunIds) : undefined)
        const itemMetrics = {
            done: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 THEN 1 ELSE 0 END)`,
            na: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 1 THEN 1 ELSE 0 END)`,
            scored: scoredExpr,
            good: goodExpr,
            wScored: weightedScoredExpr,
            wGood: weightedGoodExpr,
        }
        const [itemRows, storeItemRows] = await Promise.all([
            db.select({ userId: creditedUser, deptId: cu.departmentId, ...itemMetrics })
                .from(item)
                .innerJoin(checklistInstances, eq(checklistInstances.id, item.instanceId))
                .leftJoin(cu, sql`${cu.id} = ${creditedUser}`)
                .where(itemWhere)
                .groupBy(creditedUser, cu.departmentId),
            // Only run when the per-store split was asked for.
            wantStores
                ? db.select({ userId: creditedUser, storeId: checklistInstances.storeId, ...itemMetrics })
                    .from(item)
                    .innerJoin(checklistInstances, eq(checklistInstances.id, item.instanceId))
                    .where(itemWhere)
                    .groupBy(creditedUser, checklistInstances.storeId)
                : Promise.resolve([]),
        ])
        const itemAcc = (r: { done: unknown; na: unknown; scored: unknown; good: unknown; wScored: unknown; wGood: unknown }): ItemAcc => ({
            done: Number(r.done), na: Number(r.na), scored: Number(r.scored), good: Number(r.good), wScored: Number(r.wScored), wGood: Number(r.wGood),
        })

        type Person = { row: (typeof assigneeRows)[number]; runs: RunOutcome[]; items: ItemAcc }
        const peopleById = new Map<string, Person>()
        type Dept = { runs: RunOutcome[]; items: ItemAcc; people: Set<string> }
        const deptByKey = new Map<string, Dept>()

        for (const a of assigneeRows) {
            const flags = flagsByRun.get(a.instanceId)
            if (!flags || flags.skip) continue
            let person = peopleById.get(a.userId)
            if (!person) {
                person = { row: a, runs: [], items: emptyItemAcc() }
                peopleById.set(a.userId, person)
            }
            person.runs.push(flags)

            const key = a.departmentId ?? NO_DEPARTMENT_KEY
            let dept = deptByKey.get(key)
            if (!dept) {
                dept = { runs: [], items: emptyItemAcc(), people: new Set() }
                deptByKey.set(key, dept)
            }
            dept.people.add(a.userId)
            // A run shared by two people of one department counts once for that department (tallyRuns de-duplicates by run id).
            dept.runs.push(flags)
        }

        // Answers go to the person they are credited to (only people who appear in the report, i.e. who had
        // a checklist assigned in the period, get a row to show them on) and to that person's department.
        // Totals take every answer on the counted runs; with a person or department filter, only the answers
        // that filter is about.
        const totalItems = emptyItemAcc()
        for (const r of itemRows) {
            const acc = itemAcc(r)
            const inTotals = departmentId ? r.deptId === departmentId : onlyUserId ? r.userId === onlyUserId : true
            if (inTotals) addItems(totalItems, acc)
            if (!r.userId) continue
            const person = peopleById.get(r.userId)
            if (person) addItems(person.items, acc)
            const dept = deptByKey.get(r.deptId ?? NO_DEPARTMENT_KEY)
            if (dept) addItems(dept.items, acc)
        }

        // The same per-person figures, split by the store each run belongs to, and each store's own totals
        // (every run once, every answer on it). Equal to building this report once per store with that
        // store as the filter, in one pass.
        type StorePerson = { userId: string; storeId: string; runs: RunOutcome[]; items: ItemAcc }
        const storePeople = new Map<string, StorePerson>()
        const storeRuns = new Map<string, RunOutcome[]>()
        const storeTotalItems = new Map<string, ItemAcc>()
        if (wantStores) {
            for (const f of countedRuns) {
                const list = storeRuns.get(f.storeId)
                if (list) list.push(f)
                else storeRuns.set(f.storeId, [f])
            }
            for (const a of assigneeRows) {
                const flags = flagsByRun.get(a.instanceId)
                if (!flags || flags.skip || !a.instanceStoreId) continue
                const key = `${a.instanceStoreId}|${a.userId}`
                let entry = storePeople.get(key)
                if (!entry) {
                    entry = { userId: a.userId, storeId: a.instanceStoreId, runs: [], items: emptyItemAcc() }
                    storePeople.set(key, entry)
                }
                entry.runs.push(flags)
            }
            for (const r of storeItemRows) {
                if (!r.storeId) continue
                const acc = itemAcc(r)
                const totalForStore = storeTotalItems.get(r.storeId) ?? emptyItemAcc()
                addItems(totalForStore, acc)
                storeTotalItems.set(r.storeId, totalForStore)
                const entry = r.userId ? storePeople.get(`${r.storeId}|${r.userId}`) : undefined
                if (entry) addItems(entry.items, acc)
            }
        }

        const wantPeople = groupBy === "person" || groupBy === "both"
        const wantDepartments = groupBy === "department" || groupBy === "both"

        const people: PersonRow[] = wantPeople
            ? [...peopleById.values()].map((p): PersonRow => ({
                userId: p.row.userId,
                name: `${p.row.firstName} ${p.row.lastName ?? ""}`.trim(),
                role: p.row.role,
                department: p.row.departmentId ? departmentNames.get(p.row.departmentId) ?? NO_DEPARTMENT_LABEL : NO_DEPARTMENT_LABEL,
                store: p.row.storeId ? storeNames.get(p.row.storeId) ?? "" : "",
                status: p.row.isActive ? "Active" : "Left",
                ...toMetrics(tallyRuns(p.runs), p.items),
            })).sort((a, b) => byCompletionThenName(a, b, a.name, b.name))
            : []

        const departmentsOut: DepartmentRow[] = wantDepartments
            ? [...deptByKey.entries()].map(([key, d]): DepartmentRow => ({
                departmentId: key === NO_DEPARTMENT_KEY ? null : key,
                department: key === NO_DEPARTMENT_KEY ? NO_DEPARTMENT_LABEL : departmentNames.get(key) ?? NO_DEPARTMENT_LABEL,
                people: d.people.size,
                ...toMetrics(tallyRuns(d.runs), d.items),
            })).sort((a, b) => byCompletionThenName(a, b, a.department, b.department))
            : []

        return {
            from,
            to,
            generatedAt: new Date().toISOString(),
            storeName: storeId ? storeNames.get(storeId) ?? null : null,
            departmentName: departmentId ? departmentNames.get(departmentId) ?? null : null,
            departmentLocked: locked,
            people,
            departments: departmentsOut,
            storePeople: wantStores
                ? [...storePeople.values()].map((p): StorePersonRow => ({ userId: p.userId, storeId: p.storeId, ...toMetrics(tallyRuns(p.runs), p.items) }))
                : undefined,
            storeTotals: wantStores
                ? [...storeRuns.entries()].map(([id, runs]): StoreTotalRow => ({ storeId: id, ...toMetrics(tallyRuns(runs), storeTotalItems.get(id) ?? emptyItemAcc()) }))
                : undefined,
            totals: toMetrics(tallyRuns(countedRuns), totalItems),
            notes: REPORT_NOTES,
        }
    },
}

// ---------------------------------------------------------------------------
// Export columns and writers
// ---------------------------------------------------------------------------

type ColumnDef = CsvColumn & { width: number; tone?: boolean }

const METRIC_COLUMNS: ColumnDef[] = [
    { key: "assigned", label: "Checklists assigned", width: 12 },
    { key: "completed", label: "Completed", width: 12 },
    { key: "completionPct", label: "Completion %", width: 12, tone: true },
    { key: "onTime", label: "Completed on time", width: 12 },
    { key: "onTimePct", label: "On-time %", width: 11, tone: true },
    { key: "missed", label: "Missed", width: 10 },
    { key: "submitted", label: "Submitted", width: 11 },
    { key: "approved", label: "Approved", width: 11 },
    { key: "sentBack", label: "Sent back", width: 11 },
    { key: "questionsDone", label: "Questions done", width: 12 },
    { key: "notApplicable", label: "Not applicable", width: 12 },
    { key: "answersChecked", label: "Answers checked", width: 12 },
    { key: "compliancePct", label: "Compliance %", width: 12, tone: true },
]

export const PERSON_COLUMNS: ColumnDef[] = [
    { key: "name", label: "Name", width: 26 },
    { key: "role", label: "Role", width: 12 },
    { key: "department", label: "Department", width: 22 },
    { key: "store", label: "Store", width: 22 },
    { key: "status", label: "Status", width: 10 },
    ...METRIC_COLUMNS,
]

export const DEPARTMENT_COLUMNS: ColumnDef[] = [
    { key: "department", label: "Department", width: 26 },
    { key: "people", label: "People", width: 10 },
    ...METRIC_COLUMNS,
]

const exportColumns = (grouping: "person" | "department") => (grouping === "department" ? DEPARTMENT_COLUMNS : PERSON_COLUMNS)

// CSV is one table, so "both" falls back to people.
export const csvGrouping = (groupBy: ChecklistReportGrouping): "person" | "department" => (groupBy === "department" ? "department" : "person")

export const streamReportCsv = async (res: Response, report: ChecklistReport, grouping: "person" | "department") => {
    const rows: Record<string, unknown>[] = grouping === "department" ? report.departments : report.people
    async function* iterate() {
        for (const row of rows) yield row
    }
    await streamCsv(res, iterate(), exportColumns(grouping))
}

const TONE_FILL = { good: "FFD1FAE5", warn: "FFFEF3C7", bad: "FFFEE2E2" } as const
// Same cut-offs as rateToneClass in the client (80 and 50).
const toneFor = (value: number) => (value >= 80 ? TONE_FILL.good : value >= 50 ? TONE_FILL.warn : TONE_FILL.bad)

const addSheet = (
    workbook: ExcelJS.Workbook,
    name: string,
    title: string,
    report: ChecklistReport,
    columns: ColumnDef[],
    rows: Record<string, unknown>[],
) => {
    const sheet = workbook.addWorksheet(name)
    columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width })

    const generated = new Date(report.generatedAt)
    const generatedLocal = new Date(generated.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
        .toISOString().slice(0, 16).replace("T", " ")
    sheet.addRow([title]).font = { bold: true, size: 14 }
    sheet.addRow([`Period: ${report.from} to ${report.to}`])
    sheet.addRow([`Store: ${report.storeName ?? "All stores"}    Department: ${report.departmentName ?? "All departments"}`])
    const offsetMin = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES
    const zone = `UTC${offsetMin < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0")}:${String(Math.abs(offsetMin) % 60).padStart(2, "0")}`
    sheet.addRow([`Generated: ${generatedLocal} (${zone})`])
    sheet.addRow([])

    const headerRow = sheet.addRow(columns.map((c) => c.label))
    headerRow.font = { bold: true }
    headerRow.alignment = { vertical: "middle", wrapText: true }
    headerRow.height = 32
    headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } }
        cell.border = { bottom: { style: "thin" } }
    })
    sheet.views = [{ state: "frozen", ySplit: headerRow.number, xSplit: 1 }]

    for (const row of rows) {
        const excelRow = sheet.addRow(columns.map((c) => row[c.key] ?? null))
        columns.forEach((c, i) => {
            if (!c.tone) return
            const value = row[c.key]
            if (typeof value === "number") excelRow.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: toneFor(value) } }
        })
    }
    if (!rows.length) sheet.addRow(["No checklists ran in this period"])

    sheet.addRow([])
    sheet.addRow(["Notes"]).font = { bold: true }
    for (const note of report.notes) sheet.addRow([note])
}

export const writeReportXlsx = async (res: Response, report: ChecklistReport, groupBy: ChecklistReportGrouping) => {
    const workbook = new ExcelJS.Workbook()
    workbook.created = new Date(report.generatedAt)
    if (groupBy === "person" || groupBy === "both") {
        addSheet(workbook, "People", "Checklist Completion and Compliance Report: People", report, PERSON_COLUMNS, report.people as unknown as Record<string, unknown>[])
    }
    if (groupBy === "department" || groupBy === "both") {
        addSheet(workbook, "Departments", "Checklist Completion and Compliance Report: Departments", report, DEPARTMENT_COLUMNS, report.departments as unknown as Record<string, unknown>[])
    }
    await workbook.xlsx.write(res)
    res.end()
}
