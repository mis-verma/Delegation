import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskStatusUpdates, tags, taskTags, taskReviewers, TASK_STATUSES } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, or, inArray, asc, desc, sql, isNull, isNotNull, ne, type SQL } from "drizzle-orm"
import { cached, cacheKey, bumpVersions, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { ConfirmSmartTaskInput, CreateTaskInput, UpdateTaskInput, VerifyTaskInput } from "./task.validation.js"
import { activeDepartmentHeadIds, canApproveAtStage, type ApprovalStage } from "../tickets/ticketApproval.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { auditService } from "../audit/audit.service.js"
import { emitTaskEvent } from "../../sockets/taskEvent.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"

const selfAndDepartmentCondition = (user: AccessTokenPayload) =>
    or(eq(tasks.userId, user.sub), eq(tasks.assigneeId, user.sub));

const NOT_DELETED = isNull(tasks.deletedAt);

const tagsByTask = async (taskIds: string[]) => {
    const byTask = new Map<string, { id: string; name: string; color: string | null }[]>();
    if (!taskIds.length) return byTask;

    const rows = await db.select({
        taskId: taskTags.taskId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
    })
        .from(taskTags)
        .innerJoin(tags, eq(taskTags.tagId, tags.id))
        .where(inArray(taskTags.taskId, taskIds))
        .orderBy(asc(tags.name));

    for (const row of rows) {
        const list = byTask.get(row.taskId) ?? [];
        list.push({ id: row.id, name: row.name, color: row.color });
        byTask.set(row.taskId, list);
    }
    return byTask;
};

const syncTaskTags = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    taskId: string,
    tagIds: string[],
) => {
    await tx.delete(taskTags).where(eq(taskTags.taskId, taskId));
    if (!tagIds.length) return;

    const unique = [...new Set(tagIds)];
    const existing = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique));
    if (!existing.length) return;

    await tx.insert(taskTags).values(existing.map((tag) => ({ taskId, tagId: tag.id })));
};

const taskTagIds = async (taskId: string): Promise<string[]> =>
    (await db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, taskId)))
        .map((r) => r.tagId).sort();

const additionalAssigneeTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskAdditionalAssignees.taskId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.userId, userId));
    return rows.map((r) => r.taskId);
};

const reviewerTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskReviewers.taskId })
        .from(taskReviewers)
        .where(eq(taskReviewers.userId, userId));
    return rows.map((r) => r.taskId);
};

const syncTaskReviewers = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    taskId: string,
    userIds: string[],
) => {
    await tx.delete(taskReviewers).where(eq(taskReviewers.taskId, taskId));
    if (!userIds.length) return;
    const unique = [...new Set(userIds)];
    await tx.insert(taskReviewers).values(unique.map((userId) => ({ taskId, userId })));
};

const reviewersByTask = async (taskIds: string[]) => {
    const byTask = new Map<string, { id: string; firstName: string; lastName: string | null; email: string }[]>();
    if (!taskIds.length) return byTask;

    const rows = await db.select({
        taskId: taskReviewers.taskId,
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
    })
        .from(taskReviewers)
        .innerJoin(users, eq(taskReviewers.userId, users.id))
        .where(inArray(taskReviewers.taskId, taskIds));

    for (const row of rows) {
        const list = byTask.get(row.taskId) ?? [];
        list.push({ id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.email });
        byTask.set(row.taskId, list);
    }
    return byTask;
};

const buildVisibilityCondition = async (user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC" || user.role === "APPROVAL_MANAGER") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    const selfCondition = additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);

    const reviewedIds = await reviewerTaskIds(user.sub);
    const withReviewer = reviewedIds.length
        ? or(selfCondition, inArray(tasks.id, reviewedIds))
        : selfCondition;

    if (user.role === "MANAGER" && user.departmentId) {
        return or(eq(tasks.departmentId, user.departmentId), withReviewer);
    }

    if (user.role === "SENIOR" && user.departmentId) {
        return or(and(eq(tasks.departmentId, user.departmentId), eq(tasks.status, "pending_approval")), withReviewer);
    }

    return withReviewer;
};

const assertCanVerify = async (
    task: { id: string; departmentId: string | null; assigneeId: string | null; userId: string; approvalStage: ApprovalStage | null },
    user: AccessTokenPayload,
) => {
    if (user.role !== "ADMIN") {
        const additional = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, task.id))).map((r) => r.userId);
        if (task.assigneeId === user.sub || additional.includes(user.sub)) {
            throw AppError.forbidden("You can't approve a delegation assigned to you. Someone else has to review it.");
        }
    }
    const stage: ApprovalStage = task.approvalStage ?? "PC";
    const [reviewer] = stage === "PC"
        ? await db.select({ id: taskReviewers.id })
            .from(taskReviewers)
            .where(and(eq(taskReviewers.taskId, task.id), eq(taskReviewers.userId, user.sub)))
            .limit(1)
        : [];
    if (canApproveAtStage(stage, task, user, !!reviewer)) return;
    throw AppError.forbidden(stage === "HOD" ? "This delegation is waiting for the department head to approve first." : "This delegation is waiting for the PC to give the final approval.");
};

const buildMutationCondition = async (user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    return additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);
};

const assertCanSetReviewers = (reviewerIds: string[] | undefined, user: AccessTokenPayload) => {
    if (reviewerIds === undefined) return;
    if (user.role !== "ADMIN" && user.role !== "PC") {
        throw AppError.forbidden("Only an admin or PC can choose who reviews a delegation.");
    }
};

const FRONT_LINE_CONTENT_FIELDS = [
    "title", "description", "priority", "startDate", "dueDate", "reminderMinutesBefore", "reminderChannel",
    "projectId", "additionalAssigneeIds", "tagIds",
] as const;
const assertFrontLineCanEdit = (
    existing: { userId: string; assigneeId: string | null; status: string },
    isAdditionalAssignee: boolean,
    input: UpdateTaskInput,
    user: AccessTokenPayload,
) => {
    if (user.role !== "USER" && user.role !== "AGENT") return;
    const touchesContent = FRONT_LINE_CONTENT_FIELDS.some((field) => input[field] !== undefined);
    if (!touchesContent) return;
    const isCreator = existing.userId === user.sub;
    const isAssignee = existing.assigneeId === user.sub || isAdditionalAssignee;
    if (isCreator && (existing.status === "draft" || !isAssignee)) return;
    throw AppError.forbidden("You can update the status of this delegation, not its details. Ask the person who gave it to you.");
};

const replaceAdditionalAssignees = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    taskId: string,
    userIds: string[] | undefined,
) => {
    if (userIds === undefined) return;
    await tx.delete(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, taskId));
    if (userIds.length) {
        await tx.insert(taskAdditionalAssignees).values(userIds.map((userId) => ({ taskId, userId })));
    }
};

const loadStatusUpdates = async (taskId: string) => {
    const rows = await db.select({
        update: taskStatusUpdates,
        changedByUser: { id: users.id, email: users.email, firstName: users.firstName, role: users.role },
    })
        .from(taskStatusUpdates)
        .leftJoin(users, eq(taskStatusUpdates.changedBy, users.id))
        .where(eq(taskStatusUpdates.taskId, taskId))
        .orderBy(desc(taskStatusUpdates.createdAt));
    return rows.map((r) => ({ ...r.update, changedByUser: r.changedByUser }));
};

export type TaskOwnerStatsRow = {
    ownerId: string | null;
    total: number;
    done: number;
    overdueCount: number;
    createdCount: number;
    doneOrWaitingCount: number;
    windowDefaulted: false;
};

export type TaskPendingApprovalRow = {
    id: string;
    title: string;
    submittedBy: string | null;
    waitingSince: string;
};

export type TaskSummaryRow = {
    total: number;
    pending: number;
    newToday: number;
    due: number;
    overdue: number;
    completed: number;
    draft: number;
};

export type TaskSummaryScope = "mine" | "visible";

const TASK_SUMMARY_PREFIX = "task-summary";
const SUMMARY_TTL_SECONDS = 10;

const TASK_SUMMARY_VERSION = `${TASK_SUMMARY_PREFIX}:all`;
const dropTaskSummaries = () => bumpVersions(TASK_SUMMARY_VERSION);

const taskOwnerStatsByColumn = async (
    column: SQL,
    conditions: SQL[],
    grouped: boolean,
    allAssignees = false,
): Promise<TaskOwnerStatsRow[]> => {
    const where = sql`WHERE ${sql.join([
        sql`t.deletedAt IS NULL`,
        sql`t.status <> 'draft'`,
        sql`t.category = 'delegation'`,
        sql`t.parentTaskId IS NULL`,
        ...conditions,
    ], sql` AND `)}`;
    const groupBy = grouped ? sql`GROUP BY ownerId` : sql``;
    const now = utcSql(new Date());

    const source = allAssignees
        ? sql`(
            SELECT t0.*, t0.assigneeId AS ownerKey FROM Task t0 WHERE t0.assigneeId IS NOT NULL
            UNION ALL
            SELECT t1.*, taa.userId AS ownerKey FROM Task t1 JOIN TaskAdditionalAssignee taa ON taa.taskId = t1.id
        ) t`
        : sql`Task t`;
    const [rows] = await db.execute(sql`
        SELECT
            ${column} AS ownerId,
            COUNT(*) AS total,
            COALESCE(SUM(t.status IN ('done', 'pending_approval')), 0) AS done,
            COALESCE(SUM(t.status NOT IN ('done', 'draft', 'pending_approval') AND t.dueDate IS NOT NULL AND t.dueDate < ${now}), 0) AS overdueCount
        FROM ${source}
        ${where}
        ${groupBy}
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        ownerId: r.ownerId != null ? String(r.ownerId) : null,
        total: Number(r.total),
        done: Number(r.done),
        overdueCount: Number(r.overdueCount),
        createdCount: Number(r.total),
        doneOrWaitingCount: Number(r.done),
        windowDefaulted: false as const,
    }));
};

export const taskService = {
    async list(user: AccessTokenPayload, filterUserId?: string, status?: string, page = 1, limit = 200, tagIds?: string[], archived = false, includeChecklistSummary = false) {
        let condition;
        if (status === "draft") {
            condition = eq(tasks.userId, user.sub);
        } else if ((user.role === "ADMIN" || user.role === "PC") && filterUserId) {
            const additionalIds = await additionalAssigneeTaskIds(filterUserId);
            condition = additionalIds.length
                ? or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId), inArray(tasks.id, additionalIds))
                : or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId));
        } else {
            condition = await buildVisibilityCondition(user);
        }

        const deletedFilter = archived ? isNotNull(tasks.deletedAt) : NOT_DELETED;
        const statusFilter = status
            ? eq(tasks.status, status as any)
            : (archived ? undefined : ne(tasks.status, "draft"));

        const filters = [deletedFilter, condition, statusFilter];

        if (tagIds?.length) {
            const idList = sql.join(tagIds.map((id) => sql`${id}`), sql`, `);
            filters.push(sql`EXISTS (SELECT 1 FROM ${taskTags} tt WHERE tt.taskId = ${tasks.id} AND tt.tagId IN (${idList}))`);
        }

        const active = filters.filter(Boolean);
        const where = active.length ? and(...active) : undefined;

        const [rows, totalRows] = await Promise.all([
            db.select().from(tasks)
                .where(where)
                .orderBy(desc(tasks.createdAt))
                .offset((page - 1) * limit)
                .limit(limit),
            db.select({ count: sql<number>`count(*)` }).from(tasks).where(where),
        ]);
        const total = Number(totalRows[0]?.count ?? 0);
        const meta = { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total };
        if (!rows.length) return { data: [], meta };

        const taskIds = rows.map((t) => t.id);
        const [attachmentRows, tagMap] = await Promise.all([
            db.select({ taskId: taskAttachments.taskId, url: taskAttachments.url, mimeType: taskAttachments.mimeType })
                .from(taskAttachments)
                .where(inArray(taskAttachments.taskId, taskIds)),
            tagsByTask(taskIds),
        ]);
        const attachmentsByTask = new Map<string, { url: string; mimeType: string }[]>();
        for (const a of attachmentRows) {
            const list = attachmentsByTask.get(a.taskId) ?? [];
            list.push({ url: a.url, mimeType: a.mimeType });
            attachmentsByTask.set(a.taskId, list);
        }

        const checklistSummaryByTask = new Map<string, { total: number; done: number; missingPhotos: number }>();
        if (includeChecklistSummary) {
            const [summaryRows] = await db.execute(sql`
                SELECT
                    tc.taskId AS taskId,
                    COUNT(*) AS totalItems,
                    SUM(tci.isDone) AS doneItems,
                    SUM(CASE WHEN tci.requiredImageCount > 0 AND COALESCE(img.totalCount, 0) < tci.requiredImageCount THEN 1 ELSE 0 END) AS missingPhotoItems
                FROM TaskChecklistItem tci
                JOIN TaskChecklist tc ON tc.id = tci.taskChecklistId
                LEFT JOIN (
                    SELECT taskChecklistItemId, COUNT(*) AS totalCount FROM TaskImage GROUP BY taskChecklistItemId
                ) img ON img.taskChecklistItemId = tci.id
                WHERE tc.taskId IN (${sql.join(taskIds.map((id) => sql`${id}`), sql`, `)})
                GROUP BY tc.taskId
            `);
            for (const r of summaryRows as unknown as any[]) {
                checklistSummaryByTask.set(r.taskId as string, { total: Number(r.totalItems), done: Number(r.doneItems), missingPhotos: Number(r.missingPhotoItems) });
            }
        }

        return {
            data: rows.map((task) => ({
                ...task,
                attachments: attachmentsByTask.get(task.id) ?? [],
                tags: tagMap.get(task.id) ?? [],
                ...(includeChecklistSummary
                    ? { checklistSummary: checklistSummaryByTask.get(task.id) ?? { total: 0, done: 0, missingPhotos: 0 } }
                    : {}),
            })),
            meta,
        };
    },

    async createFromSmartInput(input: ConfirmSmartTaskInput, user: AccessTokenPayload) {
        const id = createId();
        await db.insert(tasks).values({
            id,
            title: input.title,
            description: input.context || null,
            category: input.category === "delegated_task" ? "delegation" : "issue",
            priority: input.priority,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            userId: user.sub,
            assigneeId: input.assigneeId ?? null,
            departmentId: input.departmentId ?? null,
            aiMeta: {
                rawInput: input.rawInput,
                inputMode: input.inputMode,
                channel: input.channel,
                extractedAssigneeName: input.assigneeRaw || null,
                extractedDepartment: input.departmentRaw || null,
                confidence: input.confidence ?? null,
                model: input.wonBy ?? null,
            },
        });

        const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

        emitTaskEvent('task:created', {
            userId: task!.userId,
            assigneeId: task!.assigneeId ?? null,
            departmentId: task!.departmentId ?? null,
        }, task);

        await auditService.record({ entityType: "Task", entityId: task!.id, action: "CREATE", actorId: user.sub, after: task });
        await dropTaskSummaries();

        if (task!.assigneeId) {
            await notifySafely(() => notificationService.notifyTaskAssigned({
                _id: task!.id,
                title: task!.title,
                userId: task!.userId,
                assigneeId: task!.assigneeId,
            }));
        } else {
            await notifySafely(() => notificationService.notifyTaskUnassigned({
                _id: task!.id,
                title: task!.title,
                departmentId: task!.departmentId,
            }, user.sub));
        }

        return task!;
    },

    async getById(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found")

        const checklistRows = await db.select().from(taskChecklists).where(eq(taskChecklists.taskId, task.id));
        const checklistIds = checklistRows.map((c) => c.id);
        const itemRows = checklistIds.length
            ? await db.select().from(taskChecklistItems).where(inArray(taskChecklistItems.taskChecklistId, checklistIds))
            : [];
        const itemIds = itemRows.map((i) => i.id);
        const imageRows = itemIds.length
            ? await db.select().from(taskImages).where(inArray(taskImages.taskChecklistItemId, itemIds))
            : [];

        const imagesByItem = new Map<string, typeof imageRows>();
        for (const img of imageRows) {
            const list = imagesByItem.get(img.taskChecklistItemId) ?? [];
            list.push(img);
            imagesByItem.set(img.taskChecklistItemId, list);
        }
        const itemsByChecklist = new Map<string, (typeof itemRows[number] & { images: typeof imageRows })[]>();
        for (const item of itemRows) {
            const list = itemsByChecklist.get(item.taskChecklistId) ?? [];
            list.push({ ...item, images: imagesByItem.get(item.id) ?? [] });
            itemsByChecklist.set(item.taskChecklistId, list);
        }
        const checklists = checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }));

        const attachmentRows = await db.select({
            attachment: taskAttachments,
            uploadedByUser: { id: users.id, email: users.email, firstName: users.firstName, role: users.role },
        })
            .from(taskAttachments)
            .leftJoin(users, eq(taskAttachments.uploadedBy, users.id))
            .where(eq(taskAttachments.taskId, task.id));
        const attachments = attachmentRows.map((r) => ({ ...r.attachment, uploadedByUser: r.uploadedByUser }));

        return {
            ...task,
            checklists,
            attachments,
            tags: (await tagsByTask([task.id])).get(task.id) ?? [],
            reviewers: (await reviewersByTask([task.id])).get(task.id) ?? [],
            statusUpdates: await loadStatusUpdates(task.id),
        };
    },

    async create(input: CreateTaskInput, user: AccessTokenPayload) {
        const { additionalAssigneeIds, tagIds, reviewerIds, startDate, dueDate, ...rest } = input;
        assertCanSetReviewers(reviewerIds, user);
        const id = createId();

        const task = await db.transaction(async (tx) => {
            await tx.insert(tasks).values({
                id,
                ...rest,
                startDate: startDate ? new Date(startDate) : undefined,
                dueDate: dueDate ? new Date(dueDate) : undefined,
                userId: user.sub,
            });

            if (additionalAssigneeIds?.length) {
                await tx.insert(taskAdditionalAssignees).values(
                    additionalAssigneeIds.map((userId) => ({ taskId: id, userId })),
                );
            }

            if (tagIds) await syncTaskTags(tx, id, tagIds);
            if (reviewerIds?.length) await syncTaskReviewers(tx, id, reviewerIds);

            const [created] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
            return created!;
        });

        if (task.assigneeId && task.status !== "draft") {
            await notifySafely(() => notificationService.notifyTaskAssigned({
                _id: task.id,
                title: task.title,
                userId: task.userId,
                assigneeId: task.assigneeId,
                additionalAssigneeIds,
            }));
        } else if (task.status !== "draft" && !additionalAssigneeIds?.length) {
            await notifySafely(() => notificationService.notifyTaskUnassigned({
                _id: task.id,
                title: task.title,
                departmentId: task.departmentId,
            }, user.sub));
        }

        await auditService.record({ entityType: "Task", entityId: task.id, action: "CREATE", actorId: user.sub, after: task });
        await dropTaskSummaries();

        return task;
    },

    async update(id: string, input: UpdateTaskInput, user: AccessTokenPayload) {
        if (user.role === "PC" || user.role === "APPROVAL_MANAGER") {
            throw AppError.forbidden(`${user.role === "PC" ? "PC" : "An approval manager"} can only act on a delegation through the verification queue.`)
        }

        const mutationCondition = await buildMutationCondition(user);
        const where = mutationCondition ? and(eq(tasks.id, id), mutationCondition, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        const [existing] = await db.select().from(tasks).where(where).limit(1);
        if (!existing) throw AppError.notFound("Delegation not found");

        if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (user.role === "AGENT" || user.role === "USER")) {
            throw AppError.forbidden("Only a manager or above can reassign a delegation's assignee or department.")
        }
        assertCanSetReviewers(input.reviewerIds, user);
        if (user.role === "USER" || user.role === "AGENT") {
            const additionalIds = await additionalAssigneeTaskIds(user.sub);
            assertFrontLineCanEdit(existing, additionalIds.includes(existing.id), input, user);
        }

        const beforeStatus = existing.status;

        if (input.status === "draft" && beforeStatus !== "draft") {
            throw AppError.badRequest("A delegation that has gone out can't be turned back into a draft.")
        }
        if (beforeStatus === "done" && input.status !== undefined && input.status !== "done" && user.role !== "ADMIN") {
            throw AppError.forbidden("Only a verifier can reopen a delegation that's already been verified.")
        }
        if (beforeStatus === "done" && user.role !== "ADMIN") {
            const changesSomething = Object.entries(input).some(([field, value]) =>
                value !== undefined && field !== "statusRemark" && !(field === "status" && value === "done"));
            if (changesSomething) {
                throw AppError.forbidden("This delegation is approved and closed. Only an admin can change it.")
            }
        }

        if (input.status === "done" && beforeStatus !== "done") {
            throw AppError.badRequest("A delegation can only be marked done by approving it — send it for review first, then approve it from there.")
        } else if (input.status === "on_hold" && beforeStatus !== "on_hold") {
            if (beforeStatus !== "todo" && beforeStatus !== "in_progress") {
                throw AppError.badRequest("Only a delegation that is To do or In progress can be put on hold.")
            }
        } else if (beforeStatus === "on_hold" && input.status !== undefined && input.status !== "on_hold" && input.status !== "in_progress") {
            throw AppError.badRequest("Resume this delegation to In Progress first.")
        } else if (input.status === "pending_approval" && beforeStatus !== "pending_approval") {
            if (beforeStatus !== "in_progress") {
                throw AppError.badRequest("Move this delegation to In Progress before sending it for review.")
            }
            const checklistRows = await db.select().from(taskChecklists).where(eq(taskChecklists.taskId, existing.id));
            const checklistIds = checklistRows.map((c) => c.id);
            const itemRows = checklistIds.length
                ? await db.select().from(taskChecklistItems).where(inArray(taskChecklistItems.taskChecklistId, checklistIds))
                : [];
            const itemsByChecklist = new Map<string, typeof itemRows>();
            for (const item of itemRows) {
                const list = itemsByChecklist.get(item.taskChecklistId) ?? [];
                list.push(item);
                itemsByChecklist.set(item.taskChecklistId, list);
            }
            const checklistsWithItems = checklistRows.map((c) => ({ ...c, items: itemsByChecklist.get(c.id) ?? [] }));
            assertChecklistsResolved(checklistsWithItems, "sending this delegation for review")
        }

        const { additionalAssigneeIds, tagIds, reviewerIds, startDate, dueDate, statusRemark, ...rest } = input;
        const beforeTagIds = await taskTagIds(id);
        const beforeAdditionalIds = additionalAssigneeIds !== undefined
            ? (await db.select({ userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId)
            : [];

        const isStatusChange = input.status !== undefined && input.status !== beforeStatus;
        const remark = statusRemark?.trim();
        if (isStatusChange && !remark && input.status !== "pending_approval") {
            throw AppError.badRequest("A remark is required to change a delegation's status.")
        }

        const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (startDate !== undefined) update.startDate = startDate ? new Date(startDate) : null;
        if (dueDate !== undefined) update.dueDate = dueDate ? new Date(dueDate) : null;
        if ("dueDate" in input || "reminderMinutesBefore" in input) {
            update.reminderSentAt = null;
        }
        if (input.status === "pending_approval" && beforeStatus !== "pending_approval") {
            update.submittedAt = new Date();
            const workers = additionalAssigneeIds !== undefined
                ? additionalAssigneeIds
                : (await db.select({ userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);
            const headIds = await activeDepartmentHeadIds(
                (rest.departmentId !== undefined ? rest.departmentId : existing.departmentId) ?? null,
                [rest.assigneeId !== undefined ? rest.assigneeId : existing.assigneeId, existing.userId, ...workers],
            );
            update.approvalStage = headIds.length > 0 ? "HOD" : "PC";
            update.hodApprovedBy = null;
            update.hodApprovedAt = null;
        } else if (input.status !== undefined && input.status !== "pending_approval" && beforeStatus === "pending_approval") {
            update.approvalStage = null;
            update.hodApprovedBy = null;
            update.hodApprovedAt = null;
        }
        if (beforeStatus === "done" && input.status !== undefined && input.status !== "done") {
            update.verifiedBy = null;
            update.verifiedAt = null;
            update.verificationNote = null;
        }

        const task = await db.transaction(async (tx) => {
            await tx.update(tasks).set(update).where(and(eq(tasks.id, id), mutationCondition ?? eq(tasks.id, id)));
            await replaceAdditionalAssignees(tx, id, additionalAssigneeIds);
            if (tagIds !== undefined) await syncTaskTags(tx, id, tagIds);
            if (reviewerIds !== undefined) await syncTaskReviewers(tx, id, reviewerIds);
            if (isStatusChange) {
                await tx.insert(taskStatusUpdates).values({
                    taskId: id,
                    changedBy: user.sub,
                    fromStatus: beforeStatus,
                    toStatus: input.status!,
                    remark: remark ?? "",
                });
            }
            const [updated] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
            return updated;
        });
        if (!task) throw AppError.notFound("Delegation not found")

        const updatedTarget = {
            userId: task.userId,
            assigneeId: task.assigneeId ?? null,
            departmentId: task.departmentId ?? null,
        };
        emitTaskEvent('task:updated', updatedTarget, task);
        if (existing.assigneeId !== task.assigneeId || existing.departmentId !== task.departmentId) {
            emitTaskEvent('task:updated', {
                userId: existing.userId,
                assigneeId: existing.assigneeId ?? null,
                departmentId: existing.departmentId ?? null,
            }, task);
        }

        const currentAdditionalIds = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);

        if (input.status === "pending_approval" && beforeStatus !== "pending_approval") {
            const reviewerIds = ((await reviewersByTask([id])).get(id) ?? []).map((r) => r.id);
            await notifySafely(() => notificationService.notifyPendingVerification({
                _id: task.id,
                title: task.title,
                departmentId: task.departmentId ?? undefined,
                assigneeId: task.assigneeId ?? undefined,
                additionalAssigneeIds: currentAdditionalIds,
                reviewerIds,
            }, 'TASK', task.approvalStage ?? 'PC'));
        }

        if (input.status === "on_hold" && beforeStatus !== "on_hold" && remark) {
            await notifySafely(() => notificationService.notifyTicketOnHold({
                _id: task.id,
                title: task.title,
                userId: task.userId,
                assigneeId: task.assigneeId ?? undefined,
            }, remark, user.sub, 'TASK'));
        }

        if (beforeStatus === "draft" && task.status !== "draft") {
            if (task.assigneeId || currentAdditionalIds.length) {
                await notifySafely(() => notificationService.notifyTaskAssigned({
                    _id: task.id,
                    title: task.title,
                    userId: task.userId,
                    assigneeId: task.assigneeId,
                    additionalAssigneeIds: currentAdditionalIds,
                }));
            } else {
                await notifySafely(() => notificationService.notifyTaskUnassigned({
                    _id: task.id,
                    title: task.title,
                    departmentId: task.departmentId,
                }, user.sub));
            }
        } else if (task.status !== "draft") {
            const beforeAdditional = new Set(beforeAdditionalIds);
            const newPrimary = task.assigneeId && task.assigneeId !== existing.assigneeId && !beforeAdditional.has(task.assigneeId) ? task.assigneeId : null;
            const newAdditional = additionalAssigneeIds !== undefined
                ? currentAdditionalIds.filter((uid) => !beforeAdditional.has(uid) && uid !== existing.assigneeId)
                : [];
            if (newPrimary || newAdditional.length) {
                await notifySafely(() => notificationService.notifyTaskAssigned({
                    _id: task.id,
                    title: task.title,
                    userId: task.userId,
                    assigneeId: newPrimary,
                    additionalAssigneeIds: newAdditional,
                }));
            }
        }

        const afterTagIds = tagIds !== undefined ? await taskTagIds(id) : beforeTagIds;
        await auditService.record({
            entityType: "Task", entityId: id, action: "UPDATE", actorId: user.sub,
            before: { ...existing, tagIds: beforeTagIds },
            after: { ...task, tagIds: afterTagIds },
        });

        await dropTaskSummaries();

        return {
            ...task,
            tags: (await tagsByTask([id])).get(id) ?? [],
            reviewers: (await reviewersByTask([id])).get(id) ?? [],
            statusUpdates: await loadStatusUpdates(id),
        };
    },

    async verify(id: string, input: VerifyTaskInput, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);
        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found")

        if (task.status !== "pending_approval") {
            throw AppError.badRequest("This delegation isn't pending approval.")
        }

        await assertCanVerify(task, user);

        const fromStatus = task.status;
        const stage: ApprovalStage = task.approvalStage ?? "PC";
        const stageHandOff = input.action === "APPROVE" && stage === "HOD" && user.role !== "ADMIN";
        const update: Record<string, unknown> = { updatedAt: new Date(), verificationNote: input.note ?? null };
        if (stageHandOff) {
            update.approvalStage = "PC";
            update.hodApprovedBy = user.sub;
            update.hodApprovedAt = new Date();
        } else if (input.action === "APPROVE") {
            update.status = "done";
            update.verifiedBy = user.sub;
            update.verifiedAt = new Date();
            update.approvalStage = null;
        } else {
            update.status = "in_progress";
            update.approvalStage = null;
            update.hodApprovedBy = null;
            update.hodApprovedAt = null;
        }
        const [result] = await db.update(tasks).set(update).where(and(eq(tasks.id, id), eq(tasks.status, fromStatus)));
        if (result.affectedRows === 0) {
            throw AppError.badRequest("This delegation isn't pending approval.")
        }

        await db.insert(taskStatusUpdates).values({
            taskId: id,
            changedBy: user.sub,
            fromStatus,
            toStatus: (update.status ?? fromStatus) as typeof TASK_STATUSES[number],
            remark: input.note?.trim() || (stageHandOff ? "Approved by the department head, sent to PC." : input.action === "APPROVE" ? "Approved." : "Sent back for rework."),
        });

        const [updated] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
        const additionalAssigneeIds = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);

        if (stageHandOff) {
            const reviewerIds = ((await reviewersByTask([id])).get(id) ?? []).map((r) => r.id);
            await notifySafely(() => notificationService.notifyPendingVerification({
                _id: updated!.id,
                title: updated!.title,
                departmentId: updated!.departmentId ?? undefined,
                storeId: undefined,
                userId: updated!.userId,
                assigneeId: updated!.assigneeId ?? undefined,
                additionalAssigneeIds,
                reviewerIds,
            }, 'TASK', 'PC'));
        } else {
            const informHod = input.action === "REJECT" && stage === "PC" && task.hodApprovedBy && task.hodApprovedBy !== user.sub ? [task.hodApprovedBy] : [];
            await notifySafely(() => notificationService.notifyVerificationResult({
                _id: updated!.id,
                title: updated!.title,
                userId: updated!.userId,
                assigneeId: updated!.assigneeId ?? undefined,
                additionalAssigneeIds,
            }, input.action, input.note, 'TASK', informHod));
        }

        emitTaskEvent('task:updated', {
            userId: updated!.userId,
            assigneeId: updated!.assigneeId ?? null,
            departmentId: updated!.departmentId ?? null,
        }, updated);

        await auditService.record({ entityType: "Task", entityId: id, action: "VERIFY", actorId: user.sub, after: updated });
        await dropTaskSummaries();

        return { ...updated!, statusUpdates: await loadStatusUpdates(id) };
    },

    async remove(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");

        const isVerifier = user.role === "ADMIN" || user.role === "PC";
        if (!isVerifier && !(task.userId === user.sub && task.status === "draft")) {
            throw AppError.forbidden("You can only discard your own drafts.");
        }

        const deletedAt = new Date();
        await db.update(tasks).set({ deletedAt, updatedAt: deletedAt }).where(eq(tasks.id, id));

        emitTaskEvent('task:deleted', {
            userId: task.userId,
            assigneeId: task.assigneeId ?? null,
            departmentId: task.departmentId ?? null,
        }, { id: task.id });

        await auditService.record({ entityType: "Task", entityId: id, action: "DELETE", actorId: user.sub, before: task });
        await dropTaskSummaries();

        return task;
    },

    async restore(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility
            ? and(eq(tasks.id, id), visibility, isNotNull(tasks.deletedAt))
            : and(eq(tasks.id, id), isNotNull(tasks.deletedAt));

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Archived delegation not found");

        const updatedAt = new Date();
        await db.update(tasks).set({ deletedAt: null, updatedAt }).where(eq(tasks.id, id));
        const restored = { ...task, deletedAt: null, updatedAt };

        emitTaskEvent('task:updated', {
            userId: task.userId,
            assigneeId: task.assigneeId ?? null,
            departmentId: task.departmentId ?? null,
        }, restored);

        await auditService.record({ entityType: "Task", entityId: id, action: "UPDATE", actorId: user.sub, before: task, after: restored });
        await dropTaskSummaries();

        return restored;
    },

    async complianceReport(groupBy: ReportGroupBy, departmentId?: string, from?: string, to?: string, userId?: string, departmentIds?: string[]) {
        const range = resolveReportRange(groupBy, from, to);
        const conditions: SQL[] = [
            sql`tci.createdAt >= ${utcSql(range.from)}`,
            sql`tci.createdAt <= ${utcSql(range.to)}`,
        ];
        if (departmentId) conditions.push(sql`t.departmentId = ${departmentId}`);
        if (departmentIds !== undefined) {
            conditions.push(departmentIds.length
                ? sql`t.departmentId IN (${sql.join(departmentIds.map((id) => sql`${id}`), sql`, `)})`
                : sql`1 = 0`);
        }
        if (userId) conditions.push(sql`(t.userId = ${userId} OR t.assigneeId = ${userId} OR taa.userId IS NOT NULL)`);
        conditions.push(sql`t.deletedAt IS NULL`, sql`t.status <> 'draft'`, sql`t.category = 'delegation'`, sql`t.parentTaskId IS NULL`);
        conditions.push(sql`(tci.isDone = 1 OR t.status IN ('done', 'pending_approval') OR (t.dueDate IS NOT NULL AND t.dueDate < UTC_TIMESTAMP()))`);

        const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

        const [rows] = await db.execute(sql`
            SELECT
                ${bucketSql(groupBy, sql`tci.createdAt`)} AS bucket,
                COUNT(*) AS totalItems,
                SUM(tci.isDone) AS doneItems,
                SUM(tci.isDone = 1 AND tci.requiredImageCount > 0) AS itemsRequiringPhotos,
                SUM(
                    CASE WHEN tci.isDone = 1 AND tci.requiredImageCount > 0
                        AND (CASE WHEN tci.requiresLivePhoto THEN COALESCE(img.liveCount, 0) ELSE COALESCE(img.totalCount, 0) END) >= tci.requiredImageCount
                    THEN 1 ELSE 0 END
                ) AS photoCompliantItems
            FROM TaskChecklistItem tci
            JOIN TaskChecklist tc ON tc.id = tci.taskChecklistId
            JOIN Task t ON t.id = tc.taskId
            LEFT JOIN (
                SELECT taskChecklistItemId, COUNT(*) AS totalCount, SUM(captureMethod = 'LIVE') AS liveCount
                FROM TaskImage GROUP BY taskChecklistItemId
            ) img ON img.taskChecklistItemId = tci.id
            LEFT JOIN TaskAdditionalAssignee taa ON taa.taskId = t.id AND taa.userId = ${userId ?? null}
            ${whereClause}
            GROUP BY bucket
        `);

        const byBucket = new Map<string, { totalItems: number; doneItems: number; itemsRequiringPhotos: number; photoCompliantItems: number }>(
            (rows as unknown as Record<string, unknown>[]).map((r) => [String(r.bucket), {
                totalItems: Number(r.totalItems),
                doneItems: Number(r.doneItems),
                itemsRequiringPhotos: Number(r.itemsRequiringPhotos),
                photoCompliantItems: Number(r.photoCompliantItems),
            }]),
        );

        return range.buckets.map((bucket) => {
            const r = byBucket.get(bucket);
            const totalItems = r?.totalItems ?? 0;
            const doneItems = r?.doneItems ?? 0;
            const itemsRequiringPhotos = r?.itemsRequiringPhotos ?? 0;
            const photoCompliantItems = r?.photoCompliantItems ?? 0;
            return {
                bucket,
                totalItems,
                doneItems,
                completionRate: totalItems ? Math.round((doneItems / totalItems) * 1000) / 10 : null,
                itemsRequiringPhotos,
                qualityRate: itemsRequiringPhotos ? Math.round((photoCompliantItems / itemsRequiringPhotos) * 1000) / 10 : null,
            };
        });
    },

    async ownerStats(scope: "department" | "user" | "org", from?: string, to?: string, departmentId?: string, departmentIds?: string[]): Promise<TaskOwnerStatsRow[]> {
        const baseConditions: SQL[] = [];
        if (from) baseConditions.push(sql`t.createdAt >= ${utcSql(new Date(from))}`);
        if (to) baseConditions.push(sql`t.createdAt <= ${utcSql(new Date(to))}`);
        if (departmentIds !== undefined) {
            baseConditions.push(departmentIds.length
                ? sql`t.departmentId IN (${sql.join(departmentIds.map((id) => sql`${id}`), sql`, `)})`
                : sql`1 = 0`);
        } else if (departmentId) {
            baseConditions.push(sql`t.departmentId = ${departmentId}`);
        }

        if (scope === "department") return taskOwnerStatsByColumn(sql`t.departmentId`, baseConditions, true);
        if (scope === "org") return taskOwnerStatsByColumn(sql`NULL`, baseConditions, false);
        return taskOwnerStatsByColumn(sql`t.ownerKey`, baseConditions, true, true);
    },

    async summary(user: AccessTokenPayload, scope?: TaskSummaryScope): Promise<TaskSummaryRow> {
        const version = await versionTag(TASK_SUMMARY_VERSION);
        return cached(cacheKey(TASK_SUMMARY_PREFIX, `v${version}`, scope ?? "default", user.sub), SUMMARY_TTL_SECONDS, async () => {
            let where: SQL | undefined;
            if (!scope) {
                const additionalIds = await additionalAssigneeTaskIds(user.sub);
                const mineCondition = additionalIds.length
                    ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
                    : selfAndDepartmentCondition(user);
                where = and(NOT_DELETED, mineCondition);
            } else {
                const scopeCondition = scope === "mine"
                    ? or(
                        eq(tasks.assigneeId, user.sub),
                        sql`EXISTS (SELECT 1 FROM ${taskAdditionalAssignees} ta WHERE ta.taskId = ${tasks.id} AND ta.userId = ${user.sub})`,
                    )
                    : await buildVisibilityCondition(user);
                where = and(
                    NOT_DELETED,
                    eq(tasks.category, "delegation"),
                    isNull(tasks.parentTaskId),
                    ne(tasks.status, "draft"),
                    scopeCondition,
                );
            }

            const [row] = await db.select({
                total: sql<number>`COUNT(*)`,
                draft: sql<number>`SUM(CASE WHEN ${tasks.status} = 'draft' THEN 1 ELSE 0 END)`,
                completed: sql<number>`SUM(CASE WHEN ${tasks.status} IN ('done', 'pending_approval') THEN 1 ELSE 0 END)`,
                overdue: sql<number>`SUM(CASE WHEN ${tasks.status} NOT IN ('done', 'draft', 'pending_approval') AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${utcSql(new Date())} THEN 1 ELSE 0 END)`,
                newToday: sql<number>`SUM(CASE WHEN ${tasks.createdAt} >= ${utcSql(orgDayStartUtc())} THEN 1 ELSE 0 END)`,
            }).from(tasks).where(where);

            const total = Number(row?.total ?? 0);
            const draft = Number(row?.draft ?? 0);
            const completed = Number(row?.completed ?? 0);
            const overdue = Number(row?.overdue ?? 0);
            const active = total - draft - completed;
            return {
                total: total - draft,
                pending: active,
                newToday: Number(row?.newToday ?? 0),
                due: active - overdue,
                overdue,
                completed,
                draft,
            };
        });
    },

    async pendingApproval(user: AccessTokenPayload, limit = 8): Promise<{ data: TaskPendingApprovalRow[]; meta: { total: number } }> {
        const POOL = 40;
        const stageScope = user.role === "ADMIN"
            ? undefined
            : user.role === "PC"
                ? or(isNull(tasks.approvalStage), eq(tasks.approvalStage, "PC"))
                : and(
                    eq(tasks.approvalStage, "HOD"),
                    user.departmentId ? eq(tasks.departmentId, user.departmentId) : sql`1 = 0`,
                    or(isNull(tasks.assigneeId), ne(tasks.assigneeId, user.sub)),
                    ne(tasks.userId, user.sub),
                );
        const pendingWhere = and(eq(tasks.status, "pending_approval"), NOT_DELETED, stageScope);
        const [countRow] = await db.select({ total: sql<number>`COUNT(*)` }).from(tasks).where(pendingWhere);
        const total = Number(countRow?.total ?? 0);
        const rows = await db.select({
            id: tasks.id,
            title: tasks.title,
            createdAt: tasks.createdAt,
            firstName: users.firstName,
            lastName: users.lastName,
        })
            .from(tasks)
            .leftJoin(users, eq(tasks.userId, users.id))
            .where(pendingWhere)
            .orderBy(asc(tasks.createdAt))
            .limit(POOL);

        if (rows.length === 0) return { data: [], meta: { total } };

        const ids = rows.map((r) => r.id);
        const sinceRows = await db.select({
            taskId: taskStatusUpdates.taskId,
            since: sql<string>`MAX(${taskStatusUpdates.createdAt})`,
        })
            .from(taskStatusUpdates)
            .where(and(inArray(taskStatusUpdates.taskId, ids), eq(taskStatusUpdates.toStatus, "pending_approval")))
            .groupBy(taskStatusUpdates.taskId);
        const sinceById = new Map(sinceRows.map((r) => [r.taskId, r.since]));

        const data = rows
            .map((r) => ({
                id: r.id,
                title: r.title,
                submittedBy: r.firstName ? `${r.firstName}${r.lastName ? ` ${r.lastName}` : ""}` : null,
                waitingSince: new Date(sinceById.get(r.id) ?? r.createdAt).toISOString(),
            }))
            .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
            .slice(0, limit);
        return { data, meta: { total } };
    },

};
