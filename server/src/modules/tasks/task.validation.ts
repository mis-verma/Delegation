import { z } from "zod"
import { TASK_PRIORITIES , TASK_STATUSES, TASK_REMINDER_CHANNELS } from "../../db/schema/task.js" ;
import { objectId } from "../../utils/index.js"

export const createTaskSchema = z.object({
    title : z.string().min(1),
    description : z.string().optional(),
    status : z.enum(TASK_STATUSES).optional(),
    priority : z.enum(TASK_PRIORITIES).optional(),
    startDate : z.string().datetime().optional(),
    dueDate : z.string().datetime().optional(),
    reminderMinutesBefore : z.number().int().positive().optional(),
    reminderChannel : z.enum(TASK_REMINDER_CHANNELS).optional(),
    projectId : objectId.optional(),
    assigneeId : objectId.optional(),
    additionalAssigneeIds : z.array(objectId).optional(),
    departmentId : objectId.optional(),
    // Labels. Capped so one request can't write an unbounded number of join rows; a delegation
    // carrying more than a dozen labels isn't labelled, it's noise.
    tagIds : z.array(objectId).max(12).optional(),
    // Explicit reviewers — additive on top of the role-based verify rule (ADMIN/PC always,
    // MANAGER/HOD within the task's own department). Capped same as tagIds: a hand-picked list,
    // not the whole org roster.
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
    // Archived Delegations view — flips the usual "hide soft-deleted rows" filter to "show only
    // soft-deleted rows" (see task.service.ts#list). Same visibility scope as the live list.
    archived : z.coerce.boolean().optional(),
    // Verification Queue only — attaches a per-task { total, done, missingPhotos } checklist
    // rollup to each row via one batched aggregate query, so the queue can show completion status
    // on a collapsed row without opening it. Opt-in because every other caller of this list (Task
    // List, Admin Task List, Dashboard) has no use for it and shouldn't pay the extra join.
    checklistSummary : z.coerce.boolean().optional(),
    // Comma-separated tag ids, matched as OR (a delegation carrying ANY of them). Filtering
    // server-side rather than in the client means the page's counts stay right — a client-side
    // tag filter over a truncated page would report the page's tally as the org's.
    tagIds : z.string().optional().transform((v) =>
        v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
    page : z.coerce.number().int().min(1).optional().default(1),
    // Capped at 200 (also the default) — high enough that today's usage never notices it, but
    // still a real ceiling so GET /tasks can't be made to return an unbounded result set.
    limit : z.coerce.number().int().min(1).max(200).optional().default(200),
})

export const parseTaskTextSchema = z.object({
    // Smart Add's free-form input (typed or transcribed) — capped well above any real message so
    // a malicious caller can't force extractTaskFromText to send a huge payload to the AI provider.
    text : z.string().min(1, "text is required").max(4000),
})

export const complianceReportQuerySchema = z.object({
    // 'none' = one bucket named 'range' for the whole from/to window. 'hour' is gone: with no
    // from/to the server defaults to the last 12 buckets (last 30 days for day), never unbounded.
    groupBy : z.enum(["day", "week", "month", "year", "none"]).default("day"),
    departmentId : objectId.optional(),
    // Lets an ADMIN/PC drill into one specific person's checklist completion (e.g. the Team
    // Overview page) — ignored for a non-privileged caller, who's always scoped to themselves
    // regardless of what's passed here (see task.controller.ts).
    userId : objectId.optional(),
    // Client sends computeRange()'s toISOString() output — matching createTaskSchema's
    // startDate/dueDate convention here catches a malformed value as a clean 400 instead of
    // an Invalid Date silently reaching the raw SQL template in complianceReport().
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
    assigneeId : objectId.nullable().optional(),
    departmentId : objectId.nullable().optional(),
    reminderMinutesBefore : z.number().int().positive().nullable().optional(),
    // Why the status change is being made. Not a Task column — the service peels it off and writes
    // it to TaskStatusUpdate. Required (enforced in the service, which is the only place that can
    // see whether `status` actually differs from what's stored) whenever the status moves.
    statusRemark : z.string().trim().min(1, "A remark is required to change the status.").max(1000).optional(),
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
