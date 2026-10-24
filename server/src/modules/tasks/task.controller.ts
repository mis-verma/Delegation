import type { Request , Response } from "express"
import { taskService } from "./task.service.js"
import { createTaskSchema , updateTaskSchema, verifyTaskSchema, declineTaskSchema, complianceReportQuerySchema, listTasksQuerySchema, taskOwnerStatsQuerySchema, taskSummaryQuerySchema } from "./task.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveReportScope, resolveDepartmentIdsForStore } from "../../utils/reportScope.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { routeParam } from "../../utils/routeParam.js"

const seniorDepartmentIds = async (user: AccessTokenPayload): Promise<string[] | undefined> => {
    if (user.role !== "SENIOR") return undefined;
    return user.storeId ? resolveDepartmentIdsForStore(user.storeId) : [];
};

export const taskController = {
    list : asyncHandler(async ( req : Request , res : Response) => {
        const query = listTasksQuerySchema.parse(req.query);
        const { data, meta } = await taskService.list(req.user!, query)
        res.json({ success : true, data, meta })
    }),

    getOne : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.getById(routeParam(req, "id") , req.user!);
        res.json({ success : true, data : task })
    }),

    create : asyncHandler(async (req : Request , res : Response) => {
        const input = createTaskSchema.parse(req.body);
        const task = await taskService.create(input , req.user!)
        res.status(201).json({ success : true, data : task })
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateTaskSchema.parse(req.body);
        const task = await taskService.update(routeParam(req, "id") , input , req.user!)
        res.json({ success : true, data : task });
    }),

    verify : asyncHandler(async (req : Request , res : Response) => {
        const input = verifyTaskSchema.parse(req.body);
        const task = await taskService.verify(routeParam(req, "id") , input , req.user!)
        res.json({ success : true, data : task });
    }),

    approveAssignment : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.approveAssignment(routeParam(req, "id") , req.user!)
        res.json({ success : true, data : task });
    }),

    decline : asyncHandler(async (req : Request , res : Response) => {
        const input = declineTaskSchema.parse(req.body);
        const task = await taskService.decline(routeParam(req, "id") , input.reason , req.user!)
        res.json({ success : true, data : task });
    }),

    reopenDeclined : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.reopenDeclined(routeParam(req, "id") , req.user!)
        res.json({ success : true, data : task });
    }),

    remove : asyncHandler(async (req : Request , res : Response) => {
        await taskService.remove(routeParam(req, "id") , req.user!)
        res.json({ success : true, data : { deleted : true } })
    }),

    restore : asyncHandler(async (req : Request , res : Response) => {
        const task = await taskService.restore(routeParam(req, "id") , req.user!)
        res.json({ success : true, data : task })
    }),

    complianceReport : asyncHandler(async (req : Request , res : Response) => {
        const query = complianceReportQuerySchema.parse(req.query);
        const role = req.user!.role;
        const isPrivileged = role === "ADMIN" || role === "PC";
        const { departmentId } = resolveReportScope(req.user!, { departmentId: query.departmentId });
        const isDeptOrOrgScoped = role === "MANAGER" || role === "SENIOR";
        const userId = isPrivileged ? query.userId : isDeptOrOrgScoped ? undefined : req.user!.sub;
        const departmentIds = await seniorDepartmentIds(req.user!);
        const data = await taskService.complianceReport(query.groupBy, departmentId, query.from, query.to, userId, departmentIds);
        res.json({ success : true, data })
    }),

    summary : asyncHandler(async (req : Request , res : Response) => {
        const { scope } = taskSummaryQuerySchema.parse(req.query);
        const data = await taskService.summary(req.user!, scope);
        res.json({ success : true, data })
    }),

    pendingApproval : asyncHandler(async (req : Request , res : Response) => {
        const { data, meta } = await taskService.pendingApproval(req.user!);
        res.json({ success : true, data, meta })
    }),

    ownerStats : asyncHandler(async (req : Request , res : Response) => {
        const query = taskOwnerStatsQuerySchema.parse(req.query);
        const { departmentId } = resolveReportScope(req.user!, { departmentId: query.departmentId });
        const departmentIds = await seniorDepartmentIds(req.user!);
        const data = await taskService.ownerStats(query.scope, query.from, query.to, departmentId, departmentIds);
        res.json({ success : true, data })
    }),
}
