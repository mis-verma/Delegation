import type { Request, Response } from "express"
import { checklistInstanceService, type InstanceRecurrence, type InstanceVerificationStatus } from "./checklistInstance.service.js"
import { setChecklistInstanceItemDoneSchema, verifyChecklistInstanceSchema, sendBackChecklistInstanceSchema, waiveChecklistItemSchema, raiseChecklistTicketSchema, checklistInstanceComplianceReportQuerySchema, checklistInstanceByStoreReportQuerySchema, checklistInstanceScoreRunsQuerySchema, listChecklistInstancesQuerySchema, listPendingVerificationQuerySchema, periodReportQuerySchema, decisionsQuerySchema, summaryQuerySchema } from "./checklistInstance.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveChecklistReportScope } from "./checklistReportScope.js"
import { checklistReportService } from "./checklistReport.service.js"
import { cachedReport } from "../../utils/reportCache.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { routeParam } from "../../utils/routeParam.js"

const parseIdsParam = (value: unknown): string[] | undefined => {
    if (typeof value !== "string" || !value) return undefined
    const ids = value.split(",").map((v) => v.trim()).filter(Boolean)
    return ids.length ? ids : undefined
}

export const checklistInstanceController = {
    getMine: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, status, from, to } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.getMine(req.user!.sub, {
            status,
            storeId: req.query.storeId as string | undefined,
            recurrence: req.query.recurrence as InstanceRecurrence | undefined,
            verificationStatus: req.query.verificationStatus as InstanceVerificationStatus | undefined,
            departmentId: req.query.departmentId as string | undefined,
            assigneeIds: parseIdsParam(req.query.assigneeIds),
            includeDeleted: false,
            hideEnded: !(isAdminOrPc(req.user!.role)),
            from,
            to,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    getMyFocus: asyncHandler(async (req: Request, res: Response) => {
        const data = await checklistInstanceService.getMyFocus(req.user!.sub, { hideEnded: !(isAdminOrPc(req.user!.role)) })
        res.json({ success: true, data })
    }),

    list: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, from, to, status, definitionId, storeId, assigneeId } = listChecklistInstancesQuerySchema.parse(req.query)
        const isOrgWide = isAdminOrPc(req.user!.role)
        const includeDeleted = isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true")
        const result = await checklistInstanceService.listAll({
            definitionId,
            storeId,
            status,
            assigneeId,
            ...(isOrgWide ? {} : { departmentId: req.user!.departmentId ?? "no-department" }),
            from,
            to,
            includeDeleted,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    listPendingVerification: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = listPendingVerificationQuerySchema.parse(req.query)
        const result = await checklistInstanceService.listPendingVerification(req.user!, page, limit)
        res.json({ success: true, ...result })
    }),

    auditHistory: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, from, to, storeId, personId } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.auditHistory(req.user!, {
            from,
            to,
            storeId,
            personId,
            page,
            limit,
        })
        res.json({ success: true, ...result })
    }),

    decisions: asyncHandler(async (req: Request, res: Response) => {
        const query = decisionsQuerySchema.parse(req.query)
        res.json({ success: true, data: await checklistInstanceService.decisions(req.user!, query) })
    }),

    reopenApproval: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.reopenApproval(routeParam(req, "id"), req.user!)
        res.json({ success: true, data: instance })
    }),

    formerPeople: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await checklistInstanceService.formerPeople() })
    }),

    formerPeopleNames: asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: await checklistInstanceService.formerPeopleNames() })
    }),

    personRuns: asyncHandler(async (req: Request, res: Response) => {
        const { page, limit } = listChecklistInstancesQuerySchema.parse(req.query)
        const result = await checklistInstanceService.personRuns(routeParam(req, "userId"), { page, limit })
        res.json({ success: true, ...result })
    }),

    pendingApprovalPreview: asyncHandler(async (req: Request, res: Response) => {
        const { data, meta } = await checklistInstanceService.pendingApprovalPreview(req.user!)
        res.json({ success: true, data, meta })
    }),

    summary: asyncHandler(async (req: Request, res: Response) => {
        const { definitionId, storeId, assigneeId, mine } = req.query
        const { from, to } = summaryQuerySchema.parse(req.query)
        const scopedToSelf = mine === "1" || mine === "true"
        const isOrgWide = isAdminOrPc(req.user!.role)
        const isDeptHead = isDepartmentHeadRole(req.user!.role)
        const wantsVisible = req.query.scope === "visible" && !scopedToSelf
        const useDepartment = wantsVisible && isDeptHead
        const data = await checklistInstanceService.summary({
            definitionId: definitionId as string | undefined,
            storeId: storeId as string | undefined,
            assigneeId: isOrgWide ? (assigneeId as string | undefined) : undefined,
            assigneeIds: parseIdsParam(req.query.assigneeIds),
            recurrence: req.query.recurrence as InstanceRecurrence | undefined,
            verificationStatus: req.query.verificationStatus as InstanceVerificationStatus | undefined,
            departmentId: useDepartment ? (req.user!.departmentId ?? "no-department") : (req.query.departmentId as string | undefined),
            from,
            to,
            userId: scopedToSelf || (!isOrgWide && !useDepartment) ? req.user!.sub : undefined,
            hideEnded: !isOrgWide,
            includeDeleted: isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true"),
        })
        res.json({ success: true, data })
    }),

    periodReport: asyncHandler(async (req: Request, res: Response) => {
        const { from, to, storeId, departmentId } = periodReportQuerySchema.parse(req.query)
        res.json({ success: true, data: await cachedReport("period", req, () => checklistInstanceService.periodReport(req.user!, from, to, storeId, departmentId)) })
    }),
    departmentScores: asyncHandler(async (req: Request, res: Response) => {
        const { from, to, storeId } = periodReportQuerySchema.parse(req.query)
        res.json({ success: true, data: await cachedReport("departments", req, () => checklistInstanceService.periodDepartmentScores(req.user!, from, to, storeId)) })
    }),
    getOne: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.getById(routeParam(req, "id"), req.user!)
        res.json({ success: true, data: instance })
    }),

    itemHistory: asyncHandler(async (req: Request, res: Response) => {
        const data = await checklistInstanceService.itemHistory(routeParam(req, "id"), req.user!)
        res.json({ success: true, data })
    }),

    setItemDone: asyncHandler(async (req: Request, res: Response) => {
        const { isDone, ...values } = setChecklistInstanceItemDoneSchema.parse(req.body)
        const item = await checklistInstanceService.setItemDone(routeParam(req, "id"), isDone, req.user!, values)
        res.json({ success: true, data: item })
    }),

    verify: asyncHandler(async (req: Request, res: Response) => {
        const input = verifyChecklistInstanceSchema.parse(req.body)
        const instance = await checklistInstanceService.verify(routeParam(req, "id"), input, req.user!)
        res.json({ success: true, data: instance })
    }),

    submit: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.submit(routeParam(req, "id"), req.user!)
        res.json({ success: true, data: instance })
    }),

    waiveItem: asyncHandler(async (req: Request, res: Response) => {
        const input = waiveChecklistItemSchema.parse(req.body)
        const instance = await checklistInstanceService.waiveItem(routeParam(req, "id"), routeParam(req, "itemId"), input, req.user!)
        res.json({ success: true, data: instance })
    }),
    unwaiveItem: asyncHandler(async (req: Request, res: Response) => {
        const instance = await checklistInstanceService.unwaiveItem(routeParam(req, "id"), routeParam(req, "itemId"), req.user!)
        res.json({ success: true, data: instance })
    }),
    raiseTicket: asyncHandler(async (req: Request, res: Response) => {
        const input = raiseChecklistTicketSchema.parse(req.body)
        const instance = await checklistInstanceService.raiseTicket(routeParam(req, "id"), routeParam(req, "itemId"), input, req.user!)
        res.status(201).json({ success: true, data: instance })
    }),
    sendBack: asyncHandler(async (req: Request, res: Response) => {
        const input = sendBackChecklistInstanceSchema.parse(req.body)
        const instance = await checklistInstanceService.sendBack(routeParam(req, "id"), input, req.user!)
        res.json({ success: true, data: instance })
    }),

    complianceReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceComplianceReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!, query.storeId)
        const isOrgWide = isAdminOrPc(req.user!.role)
        const includeDeleted = isOrgWide && (req.query.includeDeleted === "1" || req.query.includeDeleted === "true")
        const data = await cachedReport("compliance", req, () => checklistInstanceService.complianceReport(scope, { groupBy: query.groupBy, from: query.from, to: query.to, includeDeleted, assigneeId: query.assigneeId }))
        res.json({ success: true, data })
    }),

    byStoreReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceByStoreReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!)
        const data = await cachedReport("by-store", req, () => checklistReportService.byStoreReport(scope, query))
        res.json({ success: true, data })
    }),

    departmentMonthlyReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceByStoreReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!)
        const data = await cachedReport("department-monthly", req, () => checklistReportService.departmentMonthlyReport(scope, query))
        res.json({ success: true, data })
    }),

    scoreRunsReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceScoreRunsQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!, query.storeId)
        if (scope && !scope.departmentId && query.departmentId) scope.departmentId = query.departmentId
        const data = await cachedReport("score-runs", req, () => checklistReportService.scoreRunsReport(scope, query))
        res.json({ success: true, data })
    }),

    storeDailyReport: asyncHandler(async (req: Request, res: Response) => {
        const query = checklistInstanceByStoreReportQuerySchema.parse(req.query)
        const scope = resolveChecklistReportScope(req.user!)
        const data = await cachedReport("store-daily", req, () => checklistReportService.storeDailyReport(scope, query))
        res.json({ success: true, data })
    }),
}
