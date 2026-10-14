import ExcelJS from "exceljs"
import type { Response } from "express"
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/mysql-core"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import { checklistDefinitions } from "../../db/schema/checklistDefinition.js"
import { checklistInstanceAssignees, checklistInstanceItems, checklistInstances } from "../../db/schema/checklistInstance.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { streamCsv, type CsvColumn } from "../../utils/csv.js"
import { runDeadlineMs } from "../checklistInstances/checklistRunEnd.js"
import { hasExtraDay, isIdleHolidayRun, loadOffDayRules, type OffDayRules, type RunAssignee } from "../scores/offDayRules.js"
import { metDeadlinePct, onTimeOfFinishedPct, pooledCompliancePct, runCompletionPct, tallyRuns, type RunOutcome, type RunTally } from "../scores/scoreFormulas.js"
import type { ChecklistReportGrouping, ChecklistReportQuery } from "./checklistReport.validation.js"


export type ReportMetrics = {
    assigned: number
    completed: number
    completionPct: number | null
    onTime: number
    onTimePct: number | null
    onTimeOfFinishedPct: number | null
    metDeadlinePct: number | null
    due: number
    open: number
    missed: number
    submitted: number
    approved: number
    sentBack: number
    questionsDone: number
    notApplicable: number
    answersChecked: number
    compliancePct: number | null
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
    sharedRuns: number
}

export type DepartmentRow = ReportMetrics & {
    departmentId: string | null
    department: string
    people: number
    sharedRuns: number
}

export type DefinitionRow = ReportMetrics & { definitionId: string; title: string; recurrence: string }
export type StorePersonRow = ReportMetrics & { userId: string; storeId: string }
export type StoreTotalRow = ReportMetrics & { storeId: string }

export type ChecklistReport = {
    from: string
    to: string
    generatedAt: string
    storeName: string | null
    departmentName: string | null
    departmentLocked: boolean
    people: PersonRow[]
    departments: DepartmentRow[]
    storePeople?: StorePersonRow[]
    storeTotals?: StoreTotalRow[]
    definitions?: DefinitionRow[]
    totals: ReportMetrics
    
    unassigned: ReportMetrics
    sharing: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number }
    notes: string[]
}

export const REPORT_NOTES = [
    "A person is counted on every checklist assigned to them. A department, a store and the overall total count each checklist once, even when several people share it, so a department can differ from the sum of its people.",
    "Checklists due = completed + missed. A checklist is due once its cutoff has passed or it is completed. One still open before its cutoff is shown as Open and is in no percentage.",
    "Completion % = completed / due. There is no partial credit for a checklist that is only partly filled.",
    "On time % = completed before the cutoff / completed. Met deadline % = completed before the cutoff / due, so a missed checklist counts against it. A checklist with no cutoff is due at the end of its day.",
    "Compliance % is pooled: the weighted good answers divided by the weighted checked answers (Answers checked counts each question once). A critical question counts double, for or against. It is never an average of people's percentages.",
    "Only completed questions with an accepted-answer rule are checked. A question a reviewer sent back counts as a failed check for the person who had done it, even if it was redone well, and even if it has no accepted-answer rule. Not applicable and waived questions are left out.",
    "A person's Compliance % covers the answers credited to them on the checklists assigned to them (the same on their own card and in every list), a department's the answers credited to its people, and a store's and the overall total every checked answer on those checklists, whoever gave it.",
    "This report covers every kind of checklist (daily, weekly, monthly and one-time), so its totals can be higher than the daily-only Fill report. A checklist that has not opened yet, has no questions, or is a daily one left unfinished on a holiday (with no extra working day covering it) is not counted.",
]

const NO_DEPARTMENT_KEY = "__none__"
const NO_DEPARTMENT_LABEL = "No department"


const parentNotDeletedExpr = sql`NOT EXISTS (
    SELECT 1 FROM ${checklistDefinitions} d
    WHERE d.id = ${checklistInstances.definitionId} AND d.deletedAt IS NOT NULL
)`

const item = checklistInstanceItems


const boolScored = sql`(${item.itemType} IN ('YES_NO','PASS_FAIL') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.booleanAnswer} IS NOT NULL)`
const textScored = sql`(${item.itemType} IN ('MULTIPLE_CHOICE','DROPDOWN') AND JSON_LENGTH(${item.acceptableAnswers}) > 0 AND ${item.textValue} IS NOT NULL AND ${item.textValue} <> '')`
const numScored = sql`(${item.itemType} IN ('NUMBER_ENTRY','RATING') AND (${item.acceptableMin} IS NOT NULL OR ${item.acceptableMax} IS NOT NULL) AND ${item.numericValue} IS NOT NULL)`


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


const creditedToDepartment = (departmentId: string) => sql`EXISTS (
    SELECT 1 FROM ${users} cu
    WHERE cu.id = (CASE WHEN ${item.sendBackCount} > 0 AND ${item.sentBackFrom} IS NOT NULL THEN ${item.sentBackFrom} ELSE ${item.completedBy} END)
      AND cu.departmentId = ${departmentId}
)`
export const weightedScoredForDepartment = (departmentId: string) => sql<number>`SUM(CASE WHEN ${creditedToDepartment(departmentId)} THEN ${weightedScoredBody} ELSE 0 END)`
export const weightedGoodForDepartment = (departmentId: string) => sql<number>`SUM(CASE WHEN ${creditedToDepartment(departmentId)} THEN ${weightedGoodBody} ELSE 0 END)`


const creditedUser = sql<string | null>`(CASE WHEN ${item.sendBackCount} > 0 AND ${item.sentBackFrom} IS NOT NULL THEN ${item.sentBackFrom} ELSE ${item.completedBy} END)`


export type RunRow = {
    id: string
    definitionId: string
    title: string
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
    assigneeCount: number
    departmentSpan: number
}

export type RunFlags = RunOutcome & { skip: boolean; storeId: string; definitionId: string; title: string; recurrence: string; assigneeCount: number; departmentSpan: number }

export const runSelect = {
    id: checklistInstances.id,
    definitionId: checklistInstances.definitionId,
    title: checklistInstances.title,
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
    assigneeCount: sql<number>`(SELECT COUNT(*) FROM ${checklistInstanceAssignees} ac WHERE ac.instanceId = ${checklistInstances.id})`,
    departmentSpan: sql<number>`(SELECT COUNT(DISTINCT COALESCE(du.departmentId, '__none__')) FROM ${checklistInstanceAssignees} da INNER JOIN ${users} du ON du.id = da.userId WHERE da.instanceId = ${checklistInstances.id})`,
}
export const runGroupBy = [
    checklistInstances.id, checklistInstances.definitionId, checklistInstances.title, checklistInstances.storeId, checklistInstances.recurrence, checklistInstances.periodStart,
    checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime, checklistInstances.verificationStatus, checklistInstances.rejectionCount,
    checklistInstances.submittedAt, checklistInstances.completedFirstAt,
] as const

export type RunFlagContext = { offDayRules: OffDayRules; assigneesByRun: Map<string, RunAssignee[]>; offsetMs: number; now: number }


export const runFlagsOf = (r: RunRow, ctx: RunFlagContext): RunFlags => {
    const { offDayRules, assigneesByRun, offsetMs, now } = ctx
    const total = Number(r.total)
    const done = Number(r.done)
    const complete = total > 0 && done === total
    const deadline = runDeadlineMs(r, offsetMs / 60_000)
    const status = r.verificationStatus
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
        definitionId: r.definitionId,
        title: r.title,
        recurrence: r.recurrence,
        assigneeCount: Number(r.assigneeCount),
        departmentSpan: Number(r.departmentSpan),
        skip,
        complete,
        onTime: complete && (() => { const doneAt = r.completedFirstAt ?? r.lastDoneAt; return !doneAt || doneAt.getTime() <= deadline })(),
        missed: !complete && now >= deadline,
        submitted: r.submittedAt != null || status === "PENDING_APPROVAL" || status === "APPROVED",
        approved: status === "APPROVED",
        sentBack: r.rejectionCount > 0,
    }
}

export const loadExtraDayAssignees = async (runs: readonly Pick<RunRow, "id" | "periodStart">[], rules: OffDayRules): Promise<Map<string, RunAssignee[]>> => {
    const ids = runs.filter((r) => hasExtraDay(rules, r.periodStart.toISOString().slice(0, 10))).map((r) => r.id)
    const map = new Map<string, RunAssignee[]>()
    if (!ids.length) return map
    const rows = await db
        .select({ instanceId: checklistInstanceAssignees.instanceId, id: users.id, departmentId: users.departmentId, storeId: users.storeId })
        .from(checklistInstanceAssignees)
        .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
        .where(inArray(checklistInstanceAssignees.instanceId, ids))
    for (const a of rows) {
        const entry = { id: a.id, departmentId: a.departmentId, storeId: a.storeId }
        const list = map.get(a.instanceId)
        if (list) list.push(entry)
        else map.set(a.instanceId, [entry])
    }
    return map
}

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

    async build(
        user: AccessTokenPayload,
        query: Pick<ChecklistReportQuery, "from" | "to" | "storeId" | "departmentId" | "groupBy"> & { recurrence?: string },
        onlyUserId?: string,
        options: { byStore?: boolean; byDefinition?: boolean } = {},
    ): Promise<ChecklistReport> {
        const wantStores = options.byStore === true
        const wantDefinitions = options.byDefinition === true
        const { departmentId, locked } = onlyUserId ? { departmentId: undefined, locked: false } : resolveDepartmentScope(user, query.departmentId)
        const { from, to, storeId, groupBy } = query
        const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
        const now = Date.now()

    
        const runConditions = [
            gte(checklistInstances.periodStart, new Date(`${from}T00:00:00.000Z`)),
            lte(checklistInstances.periodStart, new Date(`${to}T00:00:00.000Z`)),
            parentNotDeletedExpr,
        ]
        if (storeId) runConditions.push(eq(checklistInstances.storeId, storeId))
        // One recurrence only (DAILY, WEEKLY, ...). Left out, every kind of checklist counts.
        if (query.recurrence) runConditions.push(sql`${checklistInstances.recurrence} = ${query.recurrence}`)
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
            db.select(runSelect)
                .from(checklistInstances)
                .leftJoin(item, eq(item.instanceId, checklistInstances.id))
                .where(runWhere)
                .groupBy(...runGroupBy),
            db.select({
                instanceId: checklistInstanceAssignees.instanceId,
                userId: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                role: users.role,
                departmentId: users.departmentId,
                storeId: users.storeId,
                isActive: users.isActive,
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

    
        const assigneesByRun = await loadExtraDayAssignees(runRows, offDayRules)
        const flagCtx: RunFlagContext = { offDayRules, assigneesByRun, offsetMs, now }
        const flagsByRun = new Map<string, RunFlags>(runRows.map((r) => [r.id, runFlagsOf(r, flagCtx)]))
        const countedRuns = [...flagsByRun.values()].filter((f) => !f.skip)
        // Runs that are not counted but carry answers (an unfinished daily run on a holiday): their answers
        // must not count either, so a skipped run is skipped everywhere.
        const skippedRunIds = [...flagsByRun.values()].filter((f) => f.skip).map((f) => f.id)

        // Item-level numbers per run and per credited person (who completed the answer, or who had done it
        // when it was sent back), with that person's department. Grouping by run keeps every split below
        // (person, department, store, checklist) a plain in-memory sum of the same rows, over the counted
        // runs only: a skipped run is skipped everywhere, so its answers never count either. Answers with
        // nobody credited are kept too: they only count where every answer on a run counts (totals, stores).
        const cu = alias(users, "cu")
        const itemWhere = and(runWhere, sql`(${item.isDone} = 1 OR ${item.sendBackCount} > 0)`)
        const itemMetrics = {
            done: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 0 THEN 1 ELSE 0 END)`,
            na: sql<number>`SUM(CASE WHEN ${item.isDone} = 1 AND ${item.isNotApplicable} = 1 THEN 1 ELSE 0 END)`,
            scored: scoredExpr,
            good: goodExpr,
            wScored: weightedScoredExpr,
            wGood: weightedGoodExpr,
        }
        const itemRows = await db.select({ instanceId: item.instanceId, userId: creditedUser, deptId: cu.departmentId, ...itemMetrics })
            .from(item)
            .innerJoin(checklistInstances, eq(checklistInstances.id, item.instanceId))
            .leftJoin(cu, sql`${cu.id} = ${creditedUser}`)
            .where(itemWhere)
            .groupBy(item.instanceId, creditedUser, cu.departmentId)
        const itemAcc = (r: { done: unknown; na: unknown; scored: unknown; good: unknown; wScored: unknown; wGood: unknown }): ItemAcc => ({
            done: Number(r.done), na: Number(r.na), scored: Number(r.scored), good: Number(r.good), wScored: Number(r.wScored), wGood: Number(r.wGood),
        })
        const addTo = (map: Map<string, ItemAcc>, key: string, acc: ItemAcc) => {
            const into = map.get(key) ?? emptyItemAcc()
            addItems(into, acc)
            map.set(key, into)
        }

        // Which (run, person) pairs exist inside this report. An answer is credited to a person's own row only
        // on a run that person is assigned to: the same rule for a person card and a list row (a person card
        // is this report filtered to one person), so the two can never differ.
        const assignedKeys = new Set(assigneeRows.map((a) => `${a.instanceId}|${a.userId}`))

        type Person = { row: (typeof assigneeRows)[number]; runs: RunOutcome[]; items: ItemAcc; shared: Set<string> }
        const peopleById = new Map<string, Person>()
        type Dept = { runs: RunOutcome[]; items: ItemAcc; people: Set<string>; shared: Set<string> }
        const deptByKey = new Map<string, Dept>()

        for (const a of assigneeRows) {
            const flags = flagsByRun.get(a.instanceId)
            if (!flags || flags.skip) continue
            let person = peopleById.get(a.userId)
            if (!person) {
                person = { row: a, runs: [], items: emptyItemAcc(), shared: new Set() }
                peopleById.set(a.userId, person)
            }
            person.runs.push(flags)
            if (flags.assigneeCount > 1) person.shared.add(flags.id)

            const key = a.departmentId ?? NO_DEPARTMENT_KEY
            let dept = deptByKey.get(key)
            if (!dept) {
                dept = { runs: [], items: emptyItemAcc(), people: new Set(), shared: new Set() }
                deptByKey.set(key, dept)
            }
            dept.people.add(a.userId)
            // A run shared by two people of one department counts once for that department (tallyRuns de-duplicates by run id).
            dept.runs.push(flags)
            if (flags.departmentSpan > 1) dept.shared.add(flags.id)
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
        }

        // One row per checklist (definition), every run once, answers as in totals.
        type DefinitionAcc = { title: string; recurrence: string; runs: RunOutcome[] }
        const definitionRuns = new Map<string, DefinitionAcc>()
        const definitionItems = new Map<string, ItemAcc>()
        if (wantDefinitions) {
            for (const f of countedRuns) {
                const d = definitionRuns.get(f.definitionId)
                if (d) { d.runs.push(f); d.title = f.title }
                else definitionRuns.set(f.definitionId, { title: f.title, recurrence: f.recurrence, runs: [f] })
            }
        }

        // Totals take every answer on the counted runs; with a person or department filter, only the answers
        // that filter is about.
        const totalItems = emptyItemAcc()
        const unassignedItems = emptyItemAcc()
        for (const r of itemRows) {
            const flags = flagsByRun.get(r.instanceId)
            if (!flags || flags.skip) continue
            const acc = itemAcc(r)
            const assignedHere = !!r.userId && assignedKeys.has(`${r.instanceId}|${r.userId}`)
            const inTotals = departmentId ? r.deptId === departmentId : onlyUserId ? r.userId === onlyUserId : true
            if (inTotals) {
                addItems(totalItems, acc)
                if (wantDefinitions) addTo(definitionItems, flags.definitionId, acc)
            }
            if (flags.assigneeCount === 0) addItems(unassignedItems, acc)
            if (wantStores) {
                addTo(storeTotalItems, flags.storeId, acc)
                const entry = assignedHere ? storePeople.get(`${flags.storeId}|${r.userId}`) : undefined
                if (entry) addItems(entry.items, acc)
            }
            if (!r.userId) continue
            const person = assignedHere ? peopleById.get(r.userId) : undefined
            if (person) addItems(person.items, acc)
            const dept = deptByKey.get(r.deptId ?? NO_DEPARTMENT_KEY)
            if (dept) addItems(dept.items, acc)
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
                sharedRuns: p.shared.size,
                ...toMetrics(tallyRuns(p.runs), p.items),
            })).sort((a, b) => byCompletionThenName(a, b, a.name, b.name))
            : []

        const departmentsOut: DepartmentRow[] = wantDepartments
            ? [...deptByKey.entries()].map(([key, d]): DepartmentRow => ({
                departmentId: key === NO_DEPARTMENT_KEY ? null : key,
                department: key === NO_DEPARTMENT_KEY ? NO_DEPARTMENT_LABEL : departmentNames.get(key) ?? NO_DEPARTMENT_LABEL,
                people: d.people.size,
                sharedRuns: d.shared.size,
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
            definitions: wantDefinitions
                ? [...definitionRuns.entries()]
                    .map(([id, d]): DefinitionRow => ({ definitionId: id, title: d.title, recurrence: d.recurrence, ...toMetrics(tallyRuns(d.runs), definitionItems.get(id) ?? emptyItemAcc()) }))
                    .sort((a, b) => a.title.localeCompare(b.title))
                : undefined,
            totals: toMetrics(tallyRuns(countedRuns), totalItems),
            unassigned: toMetrics(tallyRuns(countedRuns.filter((f) => f.assigneeCount === 0)), unassignedItems),
            sharing: {
                runsWithSeveralAssignees: countedRuns.filter((f) => f.assigneeCount > 1).length,
                runsAcrossDepartments: countedRuns.filter((f) => f.departmentSpan > 1).length,
                runsWithoutAssignee: countedRuns.filter((f) => f.assigneeCount === 0).length,
            },
            notes: REPORT_NOTES,
        }
    },
}


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
