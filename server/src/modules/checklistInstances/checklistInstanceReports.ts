import { db } from "../../config/db.js"
import {
    checklistInstances,
    checklistInstanceAssignees,

    checklistInstanceItems,

    checklistInstanceItemSubmissions,
    checklistInstanceItemSubmissionAccessories,
    checklistInstanceItemSubmissionImages,

    users,

    stores,
    departments,
    auditLogs,
    holidays,

} from "../../db/schema/index.js"
import { eq, and, inArray, desc, asc, sql, gte, lte, lt } from "drizzle-orm"
import { runDeadlineMs } from "./checklistRunEnd.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { env } from "../../config/env.js"
import { checklistReportService, type ChecklistReportQuery } from "./checklistReport.service.js"
import { weightedGoodExpr, weightedScoredExpr, weightedGoodForDepartment, weightedScoredForDepartment } from "../checklistReports/checklistReport.service.js"
import type { ChecklistReportScope } from "./checklistReportScope.js"
import { addDays, asOrgDay } from "./checklistReportRange.js"
import { hasExtraDay, isIdleHolidayRun, loadOffDayRules, type RunAssignee } from "../scores/offDayRules.js"
import { isRankable, metDeadlinePct, onTimeOfFinishedPct, pooledCompliancePct, runCompletionPct, tallyRuns, type RunOutcome } from "../scores/scoreFormulas.js"
import { isAdminOrPc } from "../../utils/roles.js"
import { clockParts } from "../../utils/clock.js"
import { parentNotDeletedExpr, paginate, buildMeta, isHod, instanceInDepartmentCondition, dayStartUtc } from "./checklistInstanceShared.js"

export const auditHistory = async (user: AccessTokenPayload, filter: { from?: string; to?: string; storeId?: string; personId?: string; page?: number; limit?: number }) => {
    const p = paginate(filter.page, filter.limit)
    const conditions = [eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr]
    if (filter.personId) conditions.push(eq(checklistInstanceItemSubmissions.userId, filter.personId))
    if (filter.storeId) conditions.push(eq(checklistInstances.storeId, filter.storeId))
    if (filter.from) conditions.push(gte(checklistInstances.periodStart, dayStartUtc(asOrgDay(filter.from))))
    if (filter.to) conditions.push(lt(checklistInstances.periodStart, dayStartUtc(addDays(asOrgDay(filter.to), 1))))
    if (!isAdminOrPc(user.role)) {
        if (!isHod(user) || !user.departmentId) return { data: [], meta: buildMeta(p, 0) }
        conditions.push(eq(users.departmentId, user.departmentId))
    }
    const where = and(...conditions)

    const [countRow] = await db.select({ n: sql<number>`COUNT(*)` })
        .from(checklistInstanceItemSubmissions)
        .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
        .where(where)
    const total = Number(countRow?.n ?? 0)

    const rows = await db.select({
        id: checklistInstanceItemSubmissions.id,
        remarks: checklistInstanceItemSubmissions.remarks,
        isNotApplicable: checklistInstanceItemSubmissions.isNotApplicable,
        completedAt: checklistInstanceItemSubmissions.completedAt,
        itemLabel: checklistInstanceItems.label,
        checklistTitle: checklistInstances.title,
        periodStart: checklistInstances.periodStart,
        storeId: checklistInstances.storeId,
        storeName: stores.name,
        personFirstName: users.firstName,
        personLastName: users.lastName,
        personIsActive: users.isActive,
    })
        .from(checklistInstanceItemSubmissions)
        .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
        .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
        .innerJoin(users, eq(users.id, checklistInstanceItemSubmissions.userId))
        .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
        .where(where)
        .orderBy(desc(checklistInstanceItemSubmissions.completedAt), asc(checklistInstanceItemSubmissions.id))
        .limit(p.limit).offset(p.offset)
    if (!rows.length) return { data: [], meta: buildMeta(p, total) }

    const submissionIds = rows.map((r) => r.id)
    const accessories = await db.select().from(checklistInstanceItemSubmissionAccessories)
        .where(inArray(checklistInstanceItemSubmissionAccessories.submissionId, submissionIds))
        .orderBy(asc(checklistInstanceItemSubmissionAccessories.createdAt), asc(checklistInstanceItemSubmissionAccessories.id))
    const images = await db.select().from(checklistInstanceItemSubmissionImages)
        .where(inArray(checklistInstanceItemSubmissionImages.submissionId, submissionIds))
        .orderBy(asc(checklistInstanceItemSubmissionImages.createdAt), asc(checklistInstanceItemSubmissionImages.id))

    const data = rows.map((r) => ({
        ...r,
        accessories: accessories.filter((a) => a.submissionId === r.id).map((a) => ({ name: a.name, checked: a.checked })),
        images: images.filter((img) => img.submissionId === r.id).map((img) => ({
            id: img.id,
            url: img.url,
            originalFilename: img.originalFilename,
            captureMethod: img.captureMethod,
            createdAt: img.createdAt,
        })),
    }))
    return { data, meta: buildMeta(p, total) }
}

export const formerPeople = async () => {
    const people = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        departmentName: departments.name,
        storeName: stores.name,
        updatedAt: users.updatedAt,
        deactivatedAt: users.deactivatedAt,
    })
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .leftJoin(stores, eq(stores.id, users.storeId))
        .where(eq(users.isActive, false))
    if (!people.length) return []
    const ids = people.map((p) => p.id)

    const [worked, assigned, audited, left] = await Promise.all([
        db.select({ userId: checklistInstanceItems.completedBy, n: sql<number>`COUNT(DISTINCT ${checklistInstanceItems.instanceId})` })
            .from(checklistInstanceItems)
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .where(and(inArray(checklistInstanceItems.completedBy, ids), parentNotDeletedExpr))
            .groupBy(checklistInstanceItems.completedBy),
        db.select({ userId: checklistInstanceAssignees.userId, n: sql<number>`COUNT(DISTINCT ${checklistInstanceAssignees.instanceId})` })
            .from(checklistInstanceAssignees)
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceAssignees.instanceId))
            .where(and(inArray(checklistInstanceAssignees.userId, ids), parentNotDeletedExpr))
            .groupBy(checklistInstanceAssignees.userId),
        db.select({ userId: checklistInstanceItemSubmissions.userId, n: sql<number>`COUNT(*)` })
            .from(checklistInstanceItemSubmissions)
            .innerJoin(checklistInstanceItems, eq(checklistInstanceItems.id, checklistInstanceItemSubmissions.itemId))
            .innerJoin(checklistInstances, eq(checklistInstances.id, checklistInstanceItems.instanceId))
            .where(and(inArray(checklistInstanceItemSubmissions.userId, ids), eq(checklistInstanceItemSubmissions.isDone, true), parentNotDeletedExpr))
            .groupBy(checklistInstanceItemSubmissions.userId),
        db.select({ userId: auditLogs.entityId, at: sql<Date>`MAX(${auditLogs.createdAt})`.mapWith(auditLogs.createdAt) })
            .from(auditLogs).where(and(eq(auditLogs.entityType, "User"), eq(auditLogs.action, "OFFBOARD"), inArray(auditLogs.entityId, ids)))
            .groupBy(auditLogs.entityId),
    ])
    const count = (rows: { userId: string | null; n: number }[]) => new Map(rows.map((r) => [r.userId, Number(r.n)]))
    const workedBy = count(worked), assignedBy = count(assigned), auditedBy = count(audited)
    const leftBy = new Map(left.map((r) => [r.userId, r.at]))

    return people.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        role: p.role,
        departmentName: p.departmentName,
        storeName: p.storeName,
        leftAt: p.deactivatedAt ?? leftBy.get(p.id) ?? p.updatedAt,
        runsAssigned: assignedBy.get(p.id) ?? 0,
        runsWorked: workedBy.get(p.id) ?? 0,
        auditsOnThem: auditedBy.get(p.id) ?? 0,
    })).sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime())
}

export const formerPeopleNames = async () => {
    return db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(eq(users.isActive, false))
        .orderBy(asc(users.firstName), asc(users.lastName))
}

export const personRuns = async (personId: string, filter: { page?: number; limit?: number }) => {
    const p = paginate(filter.page, filter.limit)
    const mine = sql`(
        ${checklistInstances.id} IN (SELECT a.instanceId FROM ${checklistInstanceAssignees} a WHERE a.userId = ${personId})
        OR ${checklistInstances.id} IN (SELECT i.instanceId FROM ${checklistInstanceItems} i WHERE i.completedBy = ${personId})
    )`
    const where = and(mine, parentNotDeletedExpr)

    const [countRow] = await db.select({ n: sql<number>`COUNT(*)` }).from(checklistInstances).where(where)
    const total = Number(countRow?.n ?? 0)

    const rows = await db.select({
        id: checklistInstances.id,
        title: checklistInstances.title,
        storeName: stores.name,
        periodStart: checklistInstances.periodStart,
        verificationStatus: checklistInstances.verificationStatus,
        total: sql<number>`COUNT(${checklistInstanceItems.id})`,
        done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
        theirs: sql<number>`COALESCE(SUM(CASE WHEN ${checklistInstanceItems.completedBy} = ${personId} THEN 1 ELSE 0 END), 0)`,
    })
        .from(checklistInstances)
        .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
        .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(where)
        .groupBy(checklistInstances.id, checklistInstances.title, stores.name, checklistInstances.periodStart, checklistInstances.verificationStatus)
        .orderBy(desc(checklistInstances.periodStart), desc(checklistInstances.id))
        .limit(p.limit).offset(p.offset)

    return {
        data: rows.map((r) => ({ ...r, total: Number(r.total), done: Number(r.done), theirs: Number(r.theirs) })),
        meta: buildMeta(p, total),
    }
}

export const periodReport = async (user: AccessTokenPayload, from: string, to: string, storeId?: string, departmentId?: string) => {
    const DAY = 86_400_000
    const startMs = Date.parse(`${from}T00:00:00.000Z`)
    const endMs = Date.parse(`${to}T00:00:00.000Z`)
    const spanDays = Math.round((endMs - startMs) / DAY) + 1
    const kind: "day" | "month" = spanDays <= 31 ? "day" : "month"
    const dayKeys = Array.from({ length: spanDays }, (_, i) => new Date(startMs + i * DAY).toISOString().slice(0, 10))
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const columns: { key: string; label: string }[] = []
    if (kind === "day") {
        for (const d of dayKeys) columns.push({ key: d, label: d })
    } else {
        const seen = new Set<string>()
        for (const d of dayKeys) {
            const key = d.slice(0, 7)
            if (seen.has(key)) continue
            seen.add(key)
            columns.push({ key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]}${key.slice(0, 4) !== from.slice(0, 4) || spanDays > 366 ? ` ${key.slice(2, 4)}` : ""}` })
        }
    }
    type Figures = {
        due: number
        completed: number
        onTime: number
        late: number
        missed: number
        open: number
        rate: number | null
        completion: number | null
        compliance: number | null
        onTimeOfFinishedPct: number | null
        metDeadlinePct: number | null
        rankable: boolean
    }
    const figuresOf = (outcomes: Iterable<RunOutcome>, good: number, scored: number): Figures => {
        const t = tallyRuns(outcomes)
        const metDeadline = metDeadlinePct(t.onTime, t.due)
        return {
            due: t.due, completed: t.completed, onTime: t.onTime, late: t.completed - t.onTime, missed: t.missed, open: t.open,
            rate: metDeadline,
            completion: runCompletionPct(t),
            compliance: pooledCompliancePct([{ weightedGood: good, weightedScored: scored }]),
            onTimeOfFinishedPct: onTimeOfFinishedPct(t.onTime, t.completed),
            metDeadlinePct: metDeadline,
            rankable: isRankable(t.due),
        }
    }
    const emptySummary: Figures = figuresOf([], 0, 0)
    const empty = {
        from, to, weekStart: from, kind, columns, days: kind === "day" ? dayKeys : ([] as string[]),
        holidays: {} as Record<string, string>, rows: [], summary: emptySummary,
        byStore: [] as (Figures & { storeId: string; storeName: string })[],
    }

    const conditions = [
        eq(checklistInstances.recurrence, "DAILY"),
        gte(checklistInstances.periodStart, new Date(startMs)),
        lte(checklistInstances.periodStart, new Date(endMs)),
        parentNotDeletedExpr,
    ]
    if (storeId) conditions.push(eq(checklistInstances.storeId, storeId))
    if (!isAdminOrPc(user.role)) {
        if (!isHod(user) || !user.departmentId) return empty
        conditions.push(instanceInDepartmentCondition(user.departmentId))
    } else if (departmentId) {
        conditions.push(instanceInDepartmentCondition(departmentId))
    }

    const headDepartmentId = (!isAdminOrPc(user.role) ? user.departmentId : departmentId) || undefined

    const runs = await db.select({
        id: checklistInstances.id,
        definitionId: checklistInstances.definitionId,
        title: checklistInstances.title,
        storeId: checklistInstances.storeId,
        scopeKey: checklistInstances.scopeKey,
        periodStart: checklistInstances.periodStart,
        periodEnd: checklistInstances.periodEnd,
        cutoffTime: checklistInstances.cutoffTime,
        opensTime: checklistInstances.opensTime,
        total: sql<number>`COUNT(${checklistInstanceItems.id})`,
        done: sql<number>`COALESCE(SUM(${checklistInstanceItems.isDone}), 0)`,
        lastDoneAt: sql<Date | null>`MAX(${checklistInstanceItems.completedAt})`.mapWith(checklistInstanceItems.completedAt),
        completedFirstAt: checklistInstances.completedFirstAt,
        wScored: headDepartmentId ? weightedScoredForDepartment(headDepartmentId) : weightedScoredExpr,
        wGood: headDepartmentId ? weightedGoodForDepartment(headDepartmentId) : weightedGoodExpr,
    })
        .from(checklistInstances)
        .leftJoin(checklistInstanceItems, eq(checklistInstanceItems.instanceId, checklistInstances.id))
        .where(and(...conditions))
        .groupBy(
            checklistInstances.id, checklistInstances.definitionId, checklistInstances.title, checklistInstances.storeId, checklistInstances.scopeKey,
            checklistInstances.periodStart, checklistInstances.periodEnd, checklistInstances.cutoffTime, checklistInstances.opensTime,
            checklistInstances.completedFirstAt,
        )
    if (!runs.length) return empty

    const holidayRows = await db.select({ date: holidays.date, name: holidays.name }).from(holidays).where(inArray(holidays.date, dayKeys))
    const holidayByDate = Object.fromEntries(holidayRows.map((h) => [h.date, h.name]))
    const offDayRules = await loadOffDayRules(from, to)
    const extraDayRunIds = runs.filter((r) => hasExtraDay(offDayRules, r.periodStart.toISOString().slice(0, 10))).map((r) => r.id)
    const assigneesByRun = new Map<string, RunAssignee[]>()
    if (extraDayRunIds.length) {
        const assigneeRows = await db
            .select({ instanceId: checklistInstanceAssignees.instanceId, id: users.id, departmentId: users.departmentId, storeId: users.storeId })
            .from(checklistInstanceAssignees)
            .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
            .where(inArray(checklistInstanceAssignees.instanceId, extraDayRunIds))
        for (const a of assigneeRows) {
            const list = assigneesByRun.get(a.instanceId)
            const entry = { id: a.id, departmentId: a.departmentId, storeId: a.storeId }
            if (list) list.push(entry)
            else assigneesByRun.set(a.instanceId, [entry])
        }
    }
    const storeIds = [...new Set(runs.map((r) => r.storeId))]
    const storeNames = new Map((await db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds))).map((s) => [s.id, s.name]))

    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    const now = Date.now()
    const today = new Date(now + offsetMs).toISOString().slice(0, 10)
    const deadlineOf = (r: { periodStart: Date; periodEnd: Date; cutoffTime: string | null; opensTime: string | null }) =>
        runDeadlineMs(r, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)

    type CellState = "done" | "late" | "missed" | "open" | "holiday" | "off" | "upcoming" | "summary"
    type Run = typeof runs[number]
    const stateOf = (r: Run): "done" | "late" | "missed" | "open" => {
        const total = Number(r.total), done = Number(r.done)
        const complete = total > 0 && done === total
        const deadline = deadlineOf(r)
        const doneAt = r.completedFirstAt ?? r.lastDoneAt
        if (complete) return doneAt && doneAt.getTime() > deadline ? "late" : "done"
        return now >= deadline ? "missed" : "open"
    }
    const pctOf = (good: number, scored: number) => pooledCompliancePct([{ weightedGood: good, weightedScored: scored }])
    const outcomeOf = (r: Run): RunOutcome => {
        const st = stateOf(r)
        return { id: r.id, complete: st === "done" || st === "late", onTime: st === "done", missed: st === "missed" }
    }

    const opensAtOf = (r: Run) => {
        let at = r.periodStart.getTime() - offsetMs
        if (r.opensTime) {
            const [oh, om] = clockParts(r.opensTime)
            at += (oh * 60 + om) * 60_000
        }
        return at
    }
    const countable = runs.filter((r) => {
        const total = Number(r.total), done = Number(r.done)
        if (total === 0) return false
        const date = r.periodStart.toISOString().slice(0, 10)
        if (isIdleHolidayRun(offDayRules, { date, recurrence: "DAILY", complete: done === total, storeId: r.storeId }, hasExtraDay(offDayRules, date) ? assigneesByRun.get(r.id) ?? [] : [])) return false
        if (done === 0 && opensAtOf(r) > now) return false
        return true
    })

    type Group = { definitionId: string; scopeKey: string; name: string; storeId: string; runs: Run[] }
    const grouped = new Map<string, Group>()
    for (const r of countable) {
        const key = `${r.definitionId}|${r.storeId}|${r.scopeKey}`
        const g = grouped.get(key) ?? { definitionId: r.definitionId, scopeKey: r.scopeKey, name: r.title, storeId: r.storeId, runs: [] }
        g.runs.push(r)
        g.name = r.title
        grouped.set(key, g)
    }

    type Tally = { outcomes: RunOutcome[]; scored: number; good: number }
    const newTally = (): Tally => ({ outcomes: [], scored: 0, good: 0 })
    const addRun = (t: Tally, r: Run) => {
        t.outcomes.push(outcomeOf(r))
        t.scored += Number(r.wScored)
        t.good += Number(r.wGood)
    }
    const figuresOfTally = (t: Tally | undefined): Figures => figuresOf(t?.outcomes ?? [], t?.good ?? 0, t?.scored ?? 0)
    const totals = newTally()
    const storeTotals = new Map<string, Tally>()
    const rows = [...grouped.values()].map((g) => {
        const acc = newTally()
        const byDay = new Map<string, Run>()
        const byMonth = new Map<string, Tally>()
        const store = storeTotals.get(g.storeId) ?? newTally()
        storeTotals.set(g.storeId, store)
        for (const r of g.runs) {
            const date = r.periodStart.toISOString().slice(0, 10)
            byDay.set(date, r)
            const month = byMonth.get(date.slice(0, 7)) ?? newTally()
            byMonth.set(date.slice(0, 7), month)
            for (const t of [acc, month, store, totals]) addRun(t, r)
        }

        const cells = columns.map((col) => {
            if (kind === "month") {
                return { date: col.key, state: "summary" as CellState, runId: null as string | null, done: 0, total: 0, ...figuresOfTally(byMonth.get(col.key)) }
            }
            const date = col.key
            const r = byDay.get(date)
            if (!r) {
                const state: CellState = holidayByDate[date] ? "holiday" : date >= today ? "upcoming" : "off"
                return { date, state, runId: null as string | null, done: 0, total: 0, compliance: null as number | null }
            }
            return { date, state: stateOf(r) as CellState, runId: r.id, done: Number(r.done), total: Number(r.total), compliance: pctOf(Number(r.wGood), Number(r.wScored)) }
        })
        return {
            definitionId: g.definitionId,
            scopeKey: g.scopeKey,
            name: g.name,
            storeId: g.storeId,
            storeName: storeNames.get(g.storeId) ?? "Store",
            cells,
            ...figuresOfTally(acc),
        }
    }).sort((a, b) => a.name.localeCompare(b.name) || a.storeName.localeCompare(b.storeName))

    return {
        from,
        to,
        weekStart: from,
        kind,
        columns,
        days: kind === "day" ? dayKeys : ([] as string[]),
        holidays: holidayByDate,
        rows,
        byStore: [...storeTotals.entries()].map(([id, t]) => ({ storeId: id, storeName: storeNames.get(id) ?? "Store", ...figuresOfTally(t) })),
        summary: figuresOfTally(totals),
    }
}

export const periodDepartmentScores = async (user: AccessTokenPayload, from: string, to: string, storeId?: string) => {
    const isOrgWide = isAdminOrPc(user.role)
    const list = await db.select({ id: departments.id, name: departments.name }).from(departments)
        .where(isOrgWide ? undefined : eq(departments.id, user.departmentId ?? ""))
        .orderBy(asc(departments.name))
    const reports = await Promise.all(list.map((dep) => periodReport(user, from, to, storeId, dep.id)))
    return list.map((dep, i) => ({ departmentId: dep.id, departmentName: dep.name, ...reports[i]?.summary }))
}

export const complianceReport = async (scope: ChecklistReportScope | null, query: ChecklistReportQuery) => {
    return checklistReportService.complianceReport(scope, query)
}
