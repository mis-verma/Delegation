import type { Request , Response } from "express"
import { taskService } from "./task.service.js"
import { createTaskSchema , updateTaskSchema, verifyTaskSchema, complianceReportQuerySchema, listTasksQuerySchema, taskOwnerStatsQuerySchema } from "./task.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveReportScope, resolveDepartmentIdsForStore } from "../../utils/reportScope.js"

export const taskController = {
    list : asyncHandler(async ( req : Request , res : Response) => {
        const query = listTasksQuerySchema.parse(req.query);
        const { data, meta } = await taskService.list(req.user!, query.userId, query.status, query.page, query.limit, query.tagIds, query.archived, query.checklistSummary)
        res.json({ success : true, data, meta })
    }),

    getOne : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.getById(req.params.id , req.user!);
        res.json({ success : true, data : task })
    }),

    create : asyncHandler(async (req : Request , res : Response) => {
        const input = createTaskSchema.parse(req.body);
        const task = await taskService.create(input , req.user!)
        res.status(201).json({ success : true, data : task })
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateTaskSchema.parse(req.body);
        const task = await taskService.update(req.params.id , input , req.user!)
        res.json({ success : true, data : task });
    }),

    verify : asyncHandler(async (req : Request , res : Response) => {
        const input = verifyTaskSchema.parse(req.body);
        const task = await taskService.verify(req.params.id , input , req.user!)
        res.json({ success : true, data : task });
    }),

    remove : asyncHandler(async (req : Request , res : Response) => {
        await taskService.remove(req.params.id , req.user!)
        res.json({ success : true, data : { deleted : true } })
    }),

    restore : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.restore(req.params.id , req.user!)
        res.json({ success : true, data : task })
    }),

    complianceReport : asyncHandler(async (req : Request , res : Response) => {
        const query = complianceReportQuerySchema.parse(req.query);
        const role = req.user!.role;
        const isPrivileged = role === "ADMIN" || role === "PC";
        const { departmentId } = resolveReportScope(req.user!, { departmentId: query.departmentId });
        const isDeptOrOrgScoped = role === "MANAGER" || role === "SENIOR";
        const userId = isPrivileged ? query.userId : isDeptOrOrgScoped ? undefined : req.user!.sub;
        // Task has no storeId, so a SENIOR resolves through every department that belongs to
        // their store instead of falling back to org-wide (see reportScope.ts).
        const departmentIds = role === "SENIOR" && req.user!.storeId
            ? await resolveDepartmentIdsForStore(req.user!.storeId)
            : undefined;
        const data = await taskService.complianceReport(query.groupBy, departmentId, query.from, query.to, userId, departmentIds);
        res.json({ success : true, data })
    }),

    summary : asyncHandler(async (req : Request , res : Response) => {
        const data = await taskService.summary(req.user!);
        res.json({ success : true, data })
    }),

    pendingApproval : asyncHandler(async (req : Request , res : Response) => {
        const data = await taskService.pendingApproval();
        res.json({ success : true, data })
    }),

    ownerStats : asyncHandler(async (req : Request , res : Response) => {
        const query = taskOwnerStatsQuerySchema.parse(req.query);
        const role = req.user!.role;
        const { departmentId } = resolveReportScope(req.user!, { departmentId: query.departmentId });
        // Task has no storeId, so a SENIOR resolves through every department that belongs to
        // their store instead (same as complianceReport above).
        const departmentIds = role === "SENIOR" && req.user!.storeId
            ? await resolveDepartmentIdsForStore(req.user!.storeId)
            : undefined;
        const data = await taskService.ownerStats(query.scope, query.from, query.to, departmentId, departmentIds);
        res.json({ success : true, data })
    }),
}
