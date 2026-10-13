import { eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { departments, stores, users } from "../../db/schema/core.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { AppError } from "../../utils/AppError.js"
import { checklistReportService, type DefinitionRow } from "../checklistReports/checklistReport.service.js"
import { foldChecklist, type ModuleBlocks } from "./scoreBlocks.js"
import { capWindow, explorerNotes, shapeExplorer, type ExplorerModule, type ExplorerRow, type ExplorerShape, type ExplorerView, type ScoredRow } from "./scoreExplorer.js"
import { scoreService, type ScoreCollection } from "./score.service.js"

export type ExplorerQuery = {
    from: string
    to: string
    view: ExplorerView
    storeId?: string
    departmentId?: string
    module?: ExplorerModule
    /** DAILY, WEEKLY, MONTHLY, ONE_TIME (the API calls it ONCE), QUARTERLY or YEARLY; left out = every kind. */
    recurrence?: string
    /** Drill-down: the person, department or store the rows belong to. */
    parentId?: string
}

export type ExplorerParent = { id: string; kind: "person" | "department" | "store"; name: string }

export type ExplorerResponse = {
    /** The window actually scored: `to` is capped at today. `asOf` is the moment "due" was decided (ISO). */
    window: { from: string; to: string; asOf: string; requestedTo: string; capped: boolean }
    scope: { role: string; orgWide: boolean; departmentLocked: boolean; departmentId?: string }
    view: ExplorerView
    parent: ExplorerParent | null
    total: ExplorerRow
    rows: ExplorerRow[]
    unassigned: ExplorerRow | null
    /** Checklist runs counted in `total` that are shared or unassigned: why departments or people may not add up to it. */
    sharing: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number }
    notes: string[]
}

/** Org-local today (YYYY-MM-DD). */
export const orgToday = (now = Date.now()) => new Date(now + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)

const isOrgWide = (v: AccessTokenPayload) => v.role === "ADMIN" || v.role === "PC"
const isHead = (v: AccessTokenPayload) => v.role === "MANAGER" || v.role === "SENIOR"

// Finds what a parentId is (a person, a department or a store) and checks the viewer may open it. Admin/PC any;
// a department head only their own department and the people on its record; stores are Admin/PC only.
const resolveParent = async (viewer: AccessTokenPayload, parentId: string): Promise<ExplorerParent> => {
    const [person] = await db.select({ firstName: users.firstName, lastName: users.lastName, departmentId: users.departmentId }).from(users).where(eq(users.id, parentId)).limit(1)
    if (person) {
        if (!isOrgWide(viewer) && !(isHead(viewer) && !!viewer.departmentId && viewer.departmentId === person.departmentId)) throw AppError.forbidden()
        return { id: parentId, kind: "person", name: `${person.firstName} ${person.lastName ?? ""}`.trim() }
    }
    const [dept] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, parentId)).limit(1)
    if (dept) {
        if (!isOrgWide(viewer) && !(isHead(viewer) && !!viewer.departmentId && viewer.departmentId === parentId)) throw AppError.forbidden()
        return { id: parentId, kind: "department", name: dept.name }
    }
    const [store] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, parentId)).limit(1)
    if (store) {
        if (!isOrgWide(viewer)) throw AppError.forbidden()
        return { id: parentId, kind: "store", name: store.name }
    }
    throw AppError.notFound("Nothing found to drill into")
}

/** A report row's blocks, for rows built straight from the checklist report. */
const asScored = (id: string, name: string, blocks: ModuleBlocks): ScoredRow => ({ id, name, ...blocks })

export const scoreExplorerService = {
    /**
     * The Score Explorer: one call for every way of cutting the scores (department, store, person, checklist, module),
     * with the same Row shape each time. It is built from the same code as /scores/report and /scores (collect,
     * storeRows, forScope), so a row here is the number shown there. ADMIN/PC see the organisation, MANAGER/SENIOR
     * their own department, everyone else gets 403.
     */
    async explorer(viewer: AccessTokenPayload, q: ExplorerQuery): Promise<ExplorerResponse> {
        const orgWide = isOrgWide(viewer)
        const head = isHead(viewer)
        if (!orgWide && !head) throw AppError.forbidden()

        const now = new Date()
        const win = capWindow(q.from, q.to, orgToday(now.getTime()))
        const { from, to } = win

        const parent = q.parentId ? await resolveParent(viewer, q.parentId) : null
        if (parent?.kind === "person" && q.view !== "checklist" && q.view !== "module") throw AppError.badRequest("A person has no rows to drill into except their checklists and modules.")
        if (parent && q.view === "store") throw AppError.badRequest("Stores are the top of the tree: there is nothing to drill into.")
        if (q.view === "store" && q.departmentId) throw AppError.badRequest("Stores cannot be narrowed by department.")

        // What the drill-down and the filters narrow to.
        const storeId = q.storeId ?? (parent?.kind === "store" ? parent.id : undefined)
        const departmentId = q.departmentId ?? (parent?.kind === "department" ? parent.id : undefined)
        const filter = { storeId, departmentId, recurrence: q.recurrence }
        const lockedDepartment = head ? viewer.departmentId ?? "no-department" : undefined
        let storesHidden = false
        let sharing = { runsWithSeveralAssignees: 0, runsAcrossDepartments: 0, runsWithoutAssignee: 0 }

        // Total and rows per view.
        let shape: ExplorerShape
        const shaped = (c: ScoreCollection, extra: Partial<Parameters<typeof shapeExplorer>[0]> = {}) =>
            shapeExplorer({
                view: q.view, module: q.module, parentId: parent?.id, total: c.total, unassigned: c.unassigned,
                departments: c.departments, people: c.people, sharedRunsByPerson: c.sharedRunsByPerson, sharedRunsByDepartment: c.sharedRunsByDepartment, ...extra,
            })

        if (parent?.kind === "person") {
            // One person's checklists (or modules): the person card's numbers, cut by checklist.
            const card = await scoreService.forScope(viewer, "person", parent.id, from, to)
            let definitions: DefinitionRow[] | undefined
            let blocks: ModuleBlocks = { checklist: card.checklist, ticket: card.ticket, delegation: card.delegation }
            if (q.view === "checklist" || q.recurrence) {
                const report = await checklistReportService.build(viewer, { from, to, groupBy: "person", recurrence: q.recurrence }, parent.id, { byDefinition: true })
                definitions = report.definitions
                blocks = { ...blocks, checklist: foldChecklist(report.totals) }
            }
            shape = shapeExplorer({ view: q.view, module: q.module, parentId: parent.id, total: asScored("total", parent.name, blocks), unassigned: null, definitions })
        } else if (q.view === "store") {
            if (head) {
                // Stores are Admin and PC only: a head gets an empty list and the department total.
                storesHidden = true
                const c = await scoreService.collect(viewer, from, to, orgWide, filter)
                sharing = c.checklistSharing
                shape = shaped(c, { stores: [] })
            } else {
                const [c, storeRows] = await Promise.all([
                    scoreService.collect(viewer, from, to, orgWide, filter),
                    scoreService.storeRows(viewer, from, to, { recurrence: q.recurrence }),
                ])
                sharing = c.checklistSharing
                shape = shaped(c, { stores: storeId ? storeRows.filter((s) => s.id === storeId) : storeRows })
            }
        } else {
            const c = await scoreService.collect(viewer, from, to, orgWide, filter, { definitions: q.view === "checklist" })
            sharing = c.checklistSharing
            shape = shaped(c, { definitions: c.definitions })
        }

        const departmentOut = lockedDepartment ?? departmentId
        return {
            window: { from, to, asOf: now.toISOString(), requestedTo: q.to, capped: win.capped },
            scope: { role: viewer.role, orgWide, departmentLocked: head, ...(departmentOut ? { departmentId: departmentOut } : {}) },
            view: q.view,
            parent,
            total: shape.total,
            rows: shape.rows,
            unassigned: shape.unassigned,
            sharing,
            notes: explorerNotes({ view: q.view, module: q.module, recurrence: q.recurrence, storeId, departmentLocked: head, storesHidden, parentKind: parent?.kind ?? null }),
        }
    },
}

