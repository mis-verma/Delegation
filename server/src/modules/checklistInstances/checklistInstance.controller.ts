import type { Request, Response } from "express"
import { checklistInstanceService, type InstanceStatusFilter, type InstanceRecurrence, type InstanceVerificationStatus } from "./checklistInstance.service.js"
import { setChecklistInstanceItemDoneSchema, verifyChecklistInstanceSchema, checklistInstanceComplianceReportQuerySchema, listChecklistInstancesQuerySchema } from "./checklistInstance.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveReportScope, resolveStoreIdForDepartment } from "../../utils/reportScope.js"

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
        const { page, limit } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.getMine(req.user!.sub, {
            status: req.query.status as InstanceStatusFilter | undefined,
            storeId: req.query.storeId as string | undefined,
            recurrence: req.query.recurrence as InstanceRecurrence | undefined,
            verificationStatus: req.query.verificationStatus as InstanceVerificationStatus | undefined,
            departmentId: req.query.departmentId as string | undefined,
            assigneeIds: parseIdsParam(req.query.assigneeIds),
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances?definitionId=&storeId=&status=&assigneeId=  (ADMIN only)
    list: asyncHandler(async (req: Request, res: Response) => {
        const { definitionId, storeId, status, assigneeId } = req.query
        const { page, limit } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.listAll({
            definitionId: definitionId as string | undefined,
            storeId: storeId as string | undefined,
            status: status as InstanceStatusFilter | undefined,
            assigneeId: assigneeId as string | undefined,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances/pending-verification (ADMIN/PC all stores, MANAGER own department)
    listPendingVerification: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.listPendingVerification(req.user!, page, limit)
        res.json({ success: true, ...result })
    }),

    // GET /checklist-instances/summary?mine=1|storeId=&assigneeId=&assigneeIds=&definitionId=
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
            userId: scopedToSelf || !isOrgWide ? req.user!.sub : undefined,
        })
        res.json({ success: true, data })
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

    // GET /checklist-instances/reports/compliance?groupBy=&storeId=&from=&to=
    // ADMIN/PC may pass any storeId (or none, for org-wide). SENIOR is forced to their own
    // store regardless of what's in the query — a SENIOR must never be able to read another
    // store's data by passing a different storeId. MANAGER has no store of their own, but their
    // department can optionally have a home store (Department.storeId) — resolve it so a
    // department head's checklist view isn't just org-wide.
    complianceReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceComplianceReportQuerySchema.parse(req.query)
        const { storeId: baseStoreId } = resolveReportScope(req.user!, { storeId: query.storeId })
        const storeId = req.user!.role === "MANAGER" && req.user!.departmentId
            ? await resolveStoreIdForDepartment(req.user!.departmentId)
            : baseStoreId;
        const data = await checklistInstanceService.complianceReport(query.groupBy, storeId, query.from, query.to)
        res.json({ success: true, data })
    }),
}
