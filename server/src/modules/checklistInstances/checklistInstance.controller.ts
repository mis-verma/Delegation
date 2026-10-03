import type { Request, Response } from "express"
import { checklistInstanceService, type InstanceRecurrence, type InstanceVerificationStatus } from "./checklistInstance.service.js"
import { setChecklistInstanceItemDoneSchema, verifyChecklistInstanceSchema, sendBackChecklistInstanceSchema, checklistInstanceComplianceReportQuerySchema, checklistInstanceByStoreReportQuerySchema, listChecklistInstancesQuerySchema, listPendingVerificationQuerySchema, weeklyReportQuerySchema, decisionsQuerySchema } from "./checklistInstance.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveChecklistReportScope } from "./checklistReportScope.js"
import { checklistReportService } from "./checklistReport.service.js"

// "Assigned with" (MyChecklists' Options) sends a comma-separated list of user ids — a single
// scalar query param, same convention as every other filter on this controller, rather than
// repeated-key array syntax (?assigneeIds=a&assigneeIds=b), which needs extra body-parser config
// to come through as an array instead of a string of just the last value.
const parseIdsParam = (value: unknown): string[] | undefined => {
    if (typeof value !== "string" || !value) return undefined
    const ids = value.split(",").map((v) => v.trim()).filter(Boolean)
    return ids.length ? ids : undefined
}

export const checklistInstanceController = {
    // GET /checklist-instances/mine?status=OPEN|COMPLETED&storeId=&recurrence=&verificationStatus=&assigneeIds=
    // Paginated. Responds `{ success, data, meta }` — `data` is the same array shape as before,
    // so a caller that ignores `meta` still works, it just gets the first page.
    getMine: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, status, from, to } = listChecklistInstancesQuerySchema.parse(req.query)
        // Always excluded here, even for ADMIN/PC — My Checklists is everyone's own day-to-day
        // list, not an audit view, so a checklist someone deleted disappears from it for
        // literally every role. Audit history has one home: the Compliance Board's explicit
        // "Show deleted checklists" toggle (see `list` below) — this endpoint doesn't get a
        // parallel toggle of its own on purpose, to keep this list unambiguous ("nothing left to
        // do here" should always mean nothing left, full stop).
        const result = await checklistInstanceService.getMine(req.user!.sub, {
            status,
            storeId: req.query.storeId as string | undefined,
            recurrence: req.query.recurrence as InstanceRecurrence | undefined,
            verificationStatus: req.query.verificationStatus as InstanceVerificationStatus | undefined,
            departmentId: req.query.departmentId as string | undefined,
            assigneeIds: parseIdsParam(req.query.assigneeIds),
            includeDeleted: false,
            from,
            to,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances?definitionId=&storeId=&status=&assigneeId=&from=&to=&includeDeleted=
    // (ADMIN/PC org-wide; MANAGER/SENIOR their own department, see below.) includeDeleted is opt-IN, not automatic —
    // the Compliance Board defaults to hiding a deleted checklist's history (so deleting one
    // actually cleans up the board, matching what the delete confirmation promises), with this as
    // the explicit "show me the full audit history anyway" toggle. Still capped by role regardless
    // of what the client sends, in case the route's own gate ever loosens.
    list: asyncHandler(async (req: Request, res: Response) => {
        const { definitionId, storeId, assigneeId } = req.query
        const { page, limit, from, to, status } = listChecklistInstancesQuerySchema.parse(req.query)
        const isOrgWide = req.user!.role === "ADMIN" || req.user!.role === "PC"
        const includeDeleted = isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true")
        const result = await checklistInstanceService.listAll({
            definitionId: definitionId as string | undefined,
            storeId: storeId as string | undefined,
            status,
            assigneeId: assigneeId as string | undefined,
            // A department head (MANAGER/SENIOR) only ever gets their own department's checklists,
            // whatever the query says. No department on their record means no match at all: the id
            // below belongs to no department, so the filter resolves to an empty result instead of
            // being dropped (which would return every checklist).
            ...(isOrgWide ? {} : { departmentId: req.user!.departmentId ?? "no-department" }),
            from,
            to,
            includeDeleted,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances/pending-verification (ADMIN/PC all stores, MANAGER own department)
    listPendingVerification: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = listPendingVerificationQuerySchema.parse(req.query)
        const result = await checklistInstanceService.listPendingVerification(req.user!, page, limit)
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances/audit-history?from=&to=&storeId=&page=&limit= (ADMIN/PC everything,
    // MANAGER/SENIOR their own department's people: the scoping lives in the service).
    auditHistory: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, from, to } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.auditHistory(req.user!, {
            from,
            to,
            storeId: req.query.storeId as string | undefined,
            personId: req.query.personId as string | undefined,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances/decisions?from=&to=&limit= (ADMIN/PC all, MANAGER/SENIOR own department).
    // Today's submit/approve/reject/send-back actions by default, newest first.
    decisions: asyncHandler(async (req: Request, res: Response) => {
        const query = decisionsQuerySchema.parse(req.query)
        res.json({ success: true, data: await checklistInstanceService.decisions(req.user!, query) })
    }),

    // PATCH /checklist-instances/:id/reopen-approval (ADMIN only): APPROVED back to PENDING_APPROVAL
    reopenApproval: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.reopenApproval(req.params.id, req.user!)
        res.json({ success: true, data: instance })
    }),

    // GET /checklist-instances/former-people (ADMIN/PC): deactivated people and their checklist footprint
    formerPeople: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await checklistInstanceService.formerPeople() })
    }),

    // GET /checklist-instances/former-people/:userId/runs?page=&limit= (ADMIN/PC)
    personRuns: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.personRuns(req.params.userId, { page, limit })
        res.json({ success: true, ...result })
    }),

    pendingApprovalPreview: asyncHandler(async (req: Request, res: Response) => {
        const data = await checklistInstanceService.pendingApprovalPreview()
        res.json({ success: true, data })
    }),

    // GET /checklist-instances/summary?mine=1|storeId=&assigneeId=&assigneeIds=&definitionId=&includeDeleted=
    // The counts the compliance board and dashboard cards used to compute by downloading every
    // instance. `mine=1` scopes to the caller, which is what the dashboard cards want.
    summary: asyncHandler(async (req: Request, res: Response) => {
        const { definitionId, storeId, assigneeId, mine } = req.query
        const scopedToSelf = mine === "1" || mine === "true"
        // Only ADMIN/PC may ask for org-wide numbers; everyone else is pinned to their own, so
        // this can't be used to read another store's compliance by dropping `mine`.
        const isOrgWide = req.user!.role === "ADMIN" || req.user!.role === "PC"
        const data = await checklistInstanceService.summary({
            definitionId: definitionId as string | undefined,
            storeId: storeId as string | undefined,
            assigneeId: assigneeId as string | undefined,
            assigneeIds: parseIdsParam(req.query.assigneeIds),
            recurrence: req.query.recurrence as InstanceRecurrence | undefined,
            verificationStatus: req.query.verificationStatus as InstanceVerificationStatus | undefined,
            departmentId: req.query.departmentId as string | undefined,
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
            userId: scopedToSelf || !isOrgWide ? req.user!.sub : undefined,
            // Opt-in, not automatic (see `list` above's own comment) — a deleted checklist's
            // instances shouldn't inflate the Compliance Board's counts by default, only when the
            // viewer explicitly asks to include deleted-checklist history.
            includeDeleted: isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true"),
        })
        res.json({ success: true, data })
    }),

    // GET /checklist-instances/reports/weekly?weekStart=YYYY-MM-DD&storeId= (ADMIN/PC all, MANAGER/SENIOR own department)
    weeklyReport: asyncHandler(async (req: Request, res: Response) => {
        const { weekStart, storeId } = weeklyReportQuerySchema.parse(req.query)
        res.json({ success: true, data: await checklistInstanceService.weeklyReport(req.user!, weekStart, storeId) })
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.getById(req.params.id, req.user!)
        res.json({ success: true, data: instance })
    }),

    setItemDone: asyncHandler(async (req: Request, res: Response) => {
        const { isDone, ...values } = setChecklistInstanceItemDoneSchema.parse(req.body)
        const item = await checklistInstanceService.setItemDone(req.params.id, isDone, req.user!, values)
        res.json({ success: true, data: item })
    }),

    // PATCH /checklist-instances/:id/verify — ADMIN/PC any instance, MANAGER own department only,
    // plus whoever's explicitly named a reviewer on this instance regardless of role/department
    // (see checklistInstance.service.ts's assertCanVerify)
    verify: asyncHandler(async (req: Request, res: Response) => {
        const input = verifyChecklistInstanceSchema.parse(req.body)
        const instance = await checklistInstanceService.verify(req.params.id, input, req.user!)
        res.json({ success: true, data: instance })
    }),

    // PATCH /checklist-instances/:id/submit: the person who filled it in (or ADMIN/PC) sends it for review
    submit: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.submit(req.params.id, req.user!)
        res.json({ success: true, data: instance })
    }),

    // PATCH /checklist-instances/:id/send-back — same access as verify; reopens only the chosen questions
    sendBack: asyncHandler(async (req: Request, res: Response) => {
        const input = sendBackChecklistInstanceSchema.parse(req.body)
        const instance = await checklistInstanceService.sendBack(req.params.id, input, req.user!)
        res.json({ success: true, data: instance })
    }),

    // GET /checklist-instances/reports/compliance?groupBy=&storeId=&from=&to=
    // ADMIN/PC may pass any storeId (or none, for org-wide). MANAGER/SENIOR (both are department
    // heads) only see runs that have an assignee in their own department, the same rule History
    // uses; a head with no department fails CLOSED and gets an empty series, never org-wide rows.
    complianceReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceComplianceReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!, query.storeId)
        // Opt-in, ADMIN/PC only: same "show me deleted-checklist history anyway" toggle as
        // list/summary above, off by default so this org-wide trend doesn't include it silently.
        const isOrgWide = req.user!.role === "ADMIN" || req.user!.role === "PC"
        const includeDeleted = isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true")
        const data = await checklistInstanceService.complianceReport(scope, { groupBy: query.groupBy, from: query.from, to: query.to, includeDeleted })
        res.json({ success: true, data })
    }),

    // GET /checklist-instances/reports/by-store?from=&to=
    // One row per active store. ADMIN/PC: every store. MANAGER/SENIOR: only runs with an assignee in
    // their department (same scope as the trend report above). Empty, never org-wide, when unscoped.
    byStoreReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceByStoreReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!)
        const data = await checklistReportService.byStoreReport(scope, query)
        res.json({ success: true, data })
    }),
}
