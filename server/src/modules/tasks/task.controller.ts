import type { Request , Response } from "express"
import { taskService } from "./task.service.js"
import { createTaskSchema , updateTaskSchema, verifyTaskSchema, complianceReportQuerySchema, listTasksQuerySchema, taskOwnerStatsQuerySchema, taskSummaryQuerySchema } from "./task.validation.js"
import { asyncHandler } from "../../utils/asyncHandler.js"
import { resolveReportScope, resolveDepartmentIdsForStore } from "../../utils/reportScope.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

// Task has no storeId, so a SENIOR is scoped through every department that belongs to their store
// (undefined for every other role = no department-list filter). Fails closed: a SENIOR with no
// store gets an empty list, which the service turns into "no rows", never an org-wide view.
const seniorDepartmentIds = async (user: AccessTokenPayload): Promise<string[] | undefined> => {
    if (user.role !== "SENIOR") return undefined;
    return user.storeId ? resolveDepartmentIdsForStore(user.storeId) : [];
};

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
        const departmentIds = await seniorDepartmentIds(req.user!);
        const data = await taskService.complianceReport(query.groupBy, departmentId, query.from, query.to, userId, departmentIds);
        res.json({ success : true, data })
    }),

    summary : asyncHandler(async (req : Request , res : Response) => {
        const { scope } = taskSummaryQuerySchema.parse(req.query);
        const data = await taskService.summary(req.user!, scope);
        res.json({ success : true, data })
    }),

    // `data` is at most 8 rows; `meta.total` is the real number awaiting approval.
    pendingApproval : asyncHandler(async (req : Request , res : Response) => {
        const { data, meta } = await taskService.pendingApproval();
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
