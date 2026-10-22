import { z } from "zod"
import { TASK_PRIORITIES , TASK_STATUSES, TASK_REMINDER_CHANNELS } from "../../db/schema/task.js" ;
import { objectId } from "../../utils/index.js"

export const createTaskSchema = z.object({
    title : z.string().min(1),
    description : z.string().optional(),
    status : z.enum(["draft", "todo"]).optional(),
    priority : z.enum(TASK_PRIORITIES).optional(),
    startDate : z.string().datetime().optional(),
    dueDate : z.string().datetime().optional(),
    reminderMinutesBefore : z.number().int().positive().optional(),
    reminderChannel : z.enum(TASK_REMINDER_CHANNELS).optional(),
    projectId : objectId.optional(),
    assigneeId : objectId.optional(),
    additionalAssigneeIds : z.array(objectId).optional(),
    departmentId : objectId.optional(),
    tagIds : z.array(objectId).max(12).optional(),
    reviewerIds : z.array(objectId).max(20).optional()
});

export const confirmSmartTaskSchema = z.object({
    title : z.string().min(1),
    context : z.string().optional(),
    category : z.enum(["issue", "delegated_task"]),
    priority : z.enum(TASK_PRIORITIES),
    dueDate : z.string().datetime(),
    assigneeId : objectId.optional(),
    departmentId : objectId.optional(),
    assigneeRaw : z.string().optional(),
    departmentRaw : z.string().optional(),
    confidence : z.number().optional(),
    rawInput : z.string(),
    inputMode : z.enum(["voice", "text"]),
    wonBy : z.string().optional(),
    channel : z.enum(["whatsapp" , "web"])
})

export const listTasksQuerySchema = z.object({
    userId : objectId.optional(),
    status : z.enum(TASK_STATUSES).optional(),
    archived : z.coerce.boolean().optional(),
    checklistSummary : z.coerce.boolean().optional(),
    tagIds : z.string().optional().transform((v) =>
        v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
    page : z.coerce.number().int().min(1).optional().default(1),
    limit : z.coerce.number().int().min(1).max(200).optional().default(200),
})

export const taskSummaryQuerySchema = z.object({
    scope : z.enum(["mine", "visible"]).optional(),
})

export const parseTaskTextSchema = z.object({
    text : z.string().min(1, "text is required").max(4000),
})

export const complianceReportQuerySchema = z.object({
    groupBy : z.enum(["day", "week", "month", "year", "none"]).default("day"),
    departmentId : objectId.optional(),
    userId : objectId.optional(),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional()
})

export const taskOwnerStatsQuerySchema = z.object({
    scope : z.enum(["department", "user", "org"]).default("org"),
    departmentId : objectId.optional(),
    from : z.string().datetime().optional(),
    to : z.string().datetime().optional()
})

export const updateTaskSchema = createTaskSchema.partial().extend({
    status : z.enum(TASK_STATUSES).optional(),
    assigneeId : objectId.nullable().optional(),
    departmentId : objectId.nullable().optional(),
    startDate : z.string().datetime().nullable().optional(),
    dueDate : z.string().datetime().nullable().optional(),
    reminderMinutesBefore : z.number().int().positive().nullable().optional(),
    statusRemark : z.string().trim().min(1, "A remark is required to change the status.").max(1000).optional(),
});

export const declineTaskSchema = z.object({
    reason : z.string().trim().min(1, "Say why you are declining it.").max(500),
});

export const verifyTaskSchema = z.object({
    action : z.enum(["APPROVE", "REJECT"]),
    note : z.string().optional(),
}).refine(v => v.action === "APPROVE" || !!v.note?.trim(), {
    message : "A note is required when rejecting.",
    path : ["note"],
})

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ComplianceReportQuery = z.infer<typeof complianceReportQuerySchema>;
export type TaskOwnerStatsQuery = z.infer<typeof taskOwnerStatsQuerySchema>;
export type VerifyTaskInput = z.infer<typeof verifyTaskSchema>;
export type ConfirmSmartTaskInput = z.infer<typeof confirmSmartTaskSchema>;
export type ParseTaskTextInput = z.infer<typeof parseTaskTextSchema>;
