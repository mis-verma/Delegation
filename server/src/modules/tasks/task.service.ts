import { asRows } from "../../utils/dbErrors.js"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskStatusUpdates, taskTags, TASK_STATUSES } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, or, inArray, sql, isNull, isNotNull, ne } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { ConfirmSmartTaskInput, CreateTaskInput, ListTasksQuery, UpdateTaskInput, VerifyTaskInput } from "./task.validation.js"
import { bucketCondition, optionConditions, scopeConditions, taskListCounts, taskListOrder } from "./taskListQuery.js"
import { resolveDepartmentIdsForStore } from "../../utils/reportScope.js"
import { activeDepartmentHeadIds, assignmentNeedsHeadApproval, canApproveAssignment, isDepartmentHead, type ApprovalStage } from "../tickets/ticketApproval.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { auditService } from "../audit/audit.service.js"
import { emitTaskEvent } from "../../sockets/taskEvent.js"
import { isAdminOrPc, isDepartmentHeadRole, isOwnScopeRole } from "../../utils/roles.js"
import { NOT_DELETED, additionalAssigneeTaskIds, buildVisibilityCondition, assertCanVerify, buildMutationCondition, assertCanSetReviewers, assertFrontLineCanEdit } from "./taskAccess.js"
import { peopleByIds, approverNames, tagsByTask, syncTaskTags, taskTagIds, syncTaskReviewers, reviewersByTask, replaceAdditionalAssignees, loadStatusUpdates } from "./taskRelations.js"
import { dropTaskSummaries, complianceReport, ownerStats, summary, pendingApproval } from "./taskReports.js"
export type { TaskOwnerStatsRow, TaskPendingApprovalRow, TaskSummaryRow, TaskSummaryScope } from "./taskReports.js"

const DAY_MS = 86_400_000;

const departmentOfUser = async (userId: string | null | undefined): Promise<string | null> => {
    if (!userId) return null;
    const [row] = await db.select({ departmentId: users.departmentId }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.departmentId ?? null;
};

const ASSIGNMENT_ONLY_FIELDS = new Set(["assigneeId", "additionalAssigneeIds", "statusRemark"]);
const isAssignmentOnly = (input: Record<string, unknown>) =>
    Object.entries(input).every(([field, value]) => value === undefined || ASSIGNMENT_ONLY_FIELDS.has(field));

const assertDatesInOrder = (start: Date | string | null | undefined, due: Date | string | null | undefined) => {
    if (start && due && new Date(due).getTime() < new Date(start).getTime()) {
        throw AppError.badRequest("The due date can't be before the start date.");
    }
};

const lateApprovalDueDate = (dueDate: Date | null, now: Date): Date | undefined =>
    dueDate && dueDate.getTime() < now.getTime() ? new Date(now.getTime() + DAY_MS) : undefined;

const finishHeadDecision = async (id: string, before: typeof tasks.$inferSelect, action: string, user: AccessTokenPayload) => {
    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const additionalAssigneeIds = (await db.select({ userId: taskAdditionalAssignees.userId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);
    emitTaskEvent('task:updated', {
        userId: updated!.userId,
        assigneeId: updated!.assigneeId ?? null,
        departmentId: updated!.departmentId ?? null,
    }, updated);
    await auditService.record({ entityType: "Task", entityId: id, action, actorId: user.sub, before, after: updated });
    await dropTaskSummaries();
    return { updated: updated!, additionalAssigneeIds };
};

export const taskService = {
    async list(user: AccessTokenPayload, query: ListTasksQuery) {
        const { userId: filterUserId, status, page, limit, tagIds, archived = false, checklistSummary: includeChecklistSummary = false, sort = "createdAt", bucket } = query;
        let condition;
        if (status === "draft") {
            condition = eq(tasks.userId, user.sub);
        } else if ((isAdminOrPc(user.role)) && filterUserId) {
            const additionalIds = await additionalAssigneeTaskIds(filterUserId);
            condition = additionalIds.length
                ? or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId), inArray(tasks.id, additionalIds))
                : or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId));
        } else {
            condition = await buildVisibilityCondition(user);
        }

        const deletedFilter = archived ? isNotNull(tasks.deletedAt) : NOT_DELETED;
        const statusFilter = status
            ? eq(tasks.status, status as (typeof TASK_STATUSES)[number])
            : (archived ? undefined : ne(tasks.status, "draft"));

        const base = [deletedFilter, condition, statusFilter];

        if (tagIds?.length) {
            const idList = sql.join(tagIds.map((id) => sql`${id}`), sql`, `);
            base.push(sql`EXISTS (SELECT 1 FROM ${taskTags} tt WHERE tt.taskId = ${tasks.id} AND tt.tagId IN (${idList}))`);
        }

        const now = new Date();
        const storeDepartmentIds = query.storeId ? await resolveDepartmentIdsForStore(query.storeId) : undefined;
        const baseWhere = and(...base.filter(Boolean));
        const scopeWhere = and(...scopeConditions({
            mine: query.mine,
            viewerId: user.sub,
            handledBy: query.handledBy,
            storeDepartmentIds,
            createdFrom: query.createdFrom,
            createdTo: query.createdTo,
            dueFrom: query.dueFrom,
            dueTo: query.dueTo,
            sla: query.sla,
        }).filter(Boolean));
        const optionList = optionConditions({
            category: query.category,
            priority: query.priority,
            departmentId: query.departmentId,
            assigneeIds: query.assigneeIds,
            raisedByIds: query.raisedByIds,
            status: query.filterStatus,
        }).filter(Boolean);
        const optionWhere = optionList.length ? and(...optionList) : undefined;
        const bucketWhere = bucket ? bucketCondition(bucket, now) : undefined;
        const where = and(baseWhere, scopeWhere, optionWhere, bucketWhere);

        const [rows, counts] = await Promise.all([
            db.select().from(tasks)
                .where(where)
                .orderBy(...taskListOrder(sort))
                .offset((page - 1) * limit)
                .limit(limit),
            taskListCounts(baseWhere, scopeWhere, optionWhere, bucket, now),
        ]);
        const total = counts.matched;
        const meta = {
            page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total,
            counts: { scope: counts.scopeTotal, options: counts.optionTotal, pending: counts.pending, completed: counts.completed, due: counts.due, delayed: counts.delayed },
        };
        if (!rows.length) return { data: [], meta };

        const taskIds = rows.map((t) => t.id);
        const decisionPeople = await peopleByIds([...new Set(rows.flatMap((t) => [t.assignmentApprovedBy, t.declinedBy]).filter((v): v is string => !!v))]);
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
            for (const r of asRows(summaryRows)) {
                checklistSummaryByTask.set(String(r.taskId), { total: Number(r.totalItems), done: Number(r.doneItems), missingPhotos: Number(r.missingPhotoItems) });
            }
        }

        return {
            data: rows.map((task) => ({
                ...task,
                attachments: attachmentsByTask.get(task.id) ?? [],
                tags: tagMap.get(task.id) ?? [],
                assignmentApprover: task.assignmentApprovedBy ? decisionPeople.get(task.assignmentApprovedBy) ?? null : null,
                decliner: task.declinedBy ? decisionPeople.get(task.declinedBy) ?? null : null,
                ...(includeChecklistSummary
                    ? { checklistSummary: checklistSummaryByTask.get(task.id) ?? { total: 0, done: 0, missingPhotos: 0 } }
                    : {}),
            })),
            meta,
        };
    },

    async createFromSmartInput(input: ConfirmSmartTaskInput, user: AccessTokenPayload) {
        const id = createId();
        const departmentId = input.departmentId ?? (await departmentOfUser(input.assigneeId));
        const needsHead = input.category === "delegated_task" && await assignmentNeedsHeadApproval({ departmentId }, user);
        await db.insert(tasks).values({
            id,
            title: input.title,
            description: input.context || null,
            category: input.category === "delegated_task" ? "delegation" : "issue",
            priority: input.priority,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            userId: user.sub,
            assigneeId: input.assigneeId ?? null,
            departmentId,
            awaitingHeadApproval: needsHead,
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

        if (needsHead) {
            await notifySafely(() => notificationService.notifyTaskAwaitingHead({ _id: task!.id, title: task!.title, departmentId: task!.departmentId, userId: task!.userId }));
        } else if (task!.assigneeId) {
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
            ...(await approverNames(task)),
            statusUpdates: await loadStatusUpdates(task.id),
        };
    },

    async create(input: CreateTaskInput, user: AccessTokenPayload) {
        const { additionalAssigneeIds, tagIds, reviewerIds, startDate, dueDate, ...rest } = input;
        assertCanSetReviewers(reviewerIds, user);
        assertDatesInOrder(startDate, dueDate);
        const id = createId();
        const departmentId = rest.departmentId ?? (await departmentOfUser(rest.assigneeId)) ?? undefined;
        const needsHead = rest.status !== "draft" && await assignmentNeedsHeadApproval({ departmentId: departmentId ?? null }, user);

        const task = await db.transaction(async (tx) => {
            await tx.insert(tasks).values({
                id,
                ...rest,
                departmentId,
                awaitingHeadApproval: needsHead,
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

        if (needsHead) {
            await notifySafely(() => notificationService.notifyTaskAwaitingHead({ _id: task.id, title: task.title, departmentId: task.departmentId, userId: task.userId }));
        } else if (task.assigneeId && task.status !== "draft") {
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

        let mutationCondition = await buildMutationCondition(user);
        const where = mutationCondition ? and(eq(tasks.id, id), mutationCondition, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        let [existing] = await db.select().from(tasks).where(where).limit(1);
        if (!existing && (isDepartmentHeadRole(user.role)) && user.departmentId && isAssignmentOnly(input)) {
            const [inDepartment] = await db.select().from(tasks)
                .where(and(eq(tasks.id, id), eq(tasks.departmentId, user.departmentId), ne(tasks.status, "draft"), NOT_DELETED)).limit(1);
            if (inDepartment) {
                existing = inDepartment;
                mutationCondition = undefined;
            }
        }
        if (!existing) throw AppError.notFound("Delegation not found");

        if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (isOwnScopeRole(user.role))) {
            throw AppError.forbidden("Only a manager or above can reassign a delegation's assignee or department.")
        }
        assertCanSetReviewers(input.reviewerIds, user);
        if (isOwnScopeRole(user.role)) {
            const additionalIds = await additionalAssigneeTaskIds(user.sub);
            assertFrontLineCanEdit(existing, additionalIds.includes(existing.id), input, user);
        }

        const beforeStatus = existing.status;

        const statusMoves = input.status !== undefined && input.status !== beforeStatus;
        if (existing.declinedAt && statusMoves) {
            throw AppError.badRequest("This delegation was declined. Use Reopen to bring it back.")
        }
        if (existing.awaitingHeadApproval && statusMoves && user.role !== "ADMIN" && !isDepartmentHead(user, existing)) {
            throw AppError.forbidden("The department head has to approve this delegation before work can start.")
        }

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
        if (startDate !== undefined || dueDate !== undefined) {
            assertDatesInOrder(startDate !== undefined ? startDate : existing.startDate, dueDate !== undefined ? dueDate : existing.dueDate);
        }
        if (rest.assigneeId && rest.departmentId === undefined && !existing.departmentId) {
            rest.departmentId = await departmentOfUser(rest.assigneeId);
        }
        const beforeTagIds = await taskTagIds(id);
        const beforeReviewerIds = reviewerIds !== undefined ? ((await reviewersByTask([id])).get(id) ?? []).map((r) => r.id) : [];
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
            update.overdueNotifiedAt = null;
            update.overdueEscalatedAt = null;
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
            update.approvalReminderSentAt = null;
            update.approvalEscalatedAt = null;
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

        const nextDepartmentId = rest.departmentId !== undefined ? rest.departmentId : existing.departmentId;
        const reassigned = beforeStatus === "todo"
            && ((rest.assigneeId !== undefined && rest.assigneeId !== existing.assigneeId) || (rest.departmentId !== undefined && rest.departmentId !== existing.departmentId));
        const publishing = beforeStatus === "draft" && input.status !== undefined && input.status !== "draft";
        let headNeedsToDecide = false;
        let headAutoApproved = false;
        if ((reassigned || publishing) && existing.category === "delegation") {
            headNeedsToDecide = await assignmentNeedsHeadApproval({ departmentId: nextDepartmentId ?? null }, user);
            update.awaitingHeadApproval = headNeedsToDecide;
            update.headReminderSentAt = null;
            update.headEscalatedAt = null;
            update.assignmentApprovedBy = null;
            update.assignmentApprovedAt = null;
        } else if (existing.awaitingHeadApproval && isStatusChange) {
            headAutoApproved = true;
            const shifted = dueDate === undefined ? lateApprovalDueDate(existing.dueDate, new Date()) : undefined;
            if (shifted) update.dueDate = shifted;
            update.awaitingHeadApproval = false;
            update.assignmentApprovedBy = user.sub;
            update.assignmentApprovedAt = new Date();
        }

        const task = await db.transaction(async (tx) => {
            const [written] = await tx.update(tasks).set(update).where(and(eq(tasks.id, id), eq(tasks.status, beforeStatus), mutationCondition ?? eq(tasks.id, id)));
            if (written.affectedRows === 0) throw AppError.conflict("Someone changed this delegation a moment ago. Open it again and retry.");
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

        if (reviewerIds !== undefined) {
            const added = reviewerIds.filter((r) => !beforeReviewerIds.includes(r));
            if (added.length) await notifySafely(() => notificationService.notifyReviewerAdded({ _id: task.id, title: task.title }, 'TASK', added, user.sub));
        }
        if (isStatusChange && (input.status === "in_progress" || input.status === "todo")) {
            await notifySafely(() => notificationService.notifyStatusMoved({ _id: task.id, title: task.title, raiserId: task.userId }, 'TASK', input.status === "todo" ? 'to do again' : 'in progress', user.sub));
        }

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

        if (headNeedsToDecide) {
            await notifySafely(() => notificationService.notifyTaskAwaitingHead({ _id: task.id, title: task.title, departmentId: task.departmentId, userId: task.userId }));
        } else if (headAutoApproved) {
            await notifySafely(() => notificationService.notifyTaskHeadApproved({
                _id: task.id,
                title: task.title,
                userId: task.userId,
                assigneeId: task.assigneeId,
                additionalAssigneeIds: currentAdditionalIds,
            }, user.sub));
        } else if (beforeStatus === "draft" && task.status !== "draft") {
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
            ...(await approverNames(task)),
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
            update.approvalReminderSentAt = null;
            update.approvalEscalatedAt = null;
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
        await db.transaction(async (tx) => {
            const [result] = await tx.update(tasks).set(update).where(and(eq(tasks.id, id), eq(tasks.status, fromStatus)));
            if (result.affectedRows === 0) {
                throw AppError.badRequest("This delegation isn't pending approval.")
            }

            await tx.insert(taskStatusUpdates).values({
                taskId: id,
                changedBy: user.sub,
                fromStatus,
                toStatus: (update.status ?? fromStatus) as typeof TASK_STATUSES[number],
                remark: input.note?.trim() || (stageHandOff ? "Approved by the department head, sent to PC." : input.action === "APPROVE" ? "Approved." : "Sent back for rework."),
            });
        });

        const [updated] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
        const additionalAssigneeIds = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);

        if (stageHandOff) {
            await notifySafely(() => notificationService.notifyStageHandOff({
                _id: updated!.id,
                title: updated!.title,
                userId: updated!.userId,
                assigneeId: updated!.assigneeId ?? undefined,
                additionalAssigneeIds,
            }, 'TASK', user.sub));
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

        return { ...updated!, ...(await approverNames(updated!)), statusUpdates: await loadStatusUpdates(id) };
    },

    async approveAssignment(id: string, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), NOT_DELETED)).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        if (!canApproveAssignment(task, user)) throw AppError.forbidden("Only the department head, PC or an admin can approve this delegation.");
        if (task.declinedAt) throw AppError.badRequest("This delegation was declined. Reopen it instead.");
        if (!task.awaitingHeadApproval) throw AppError.conflict("This delegation has already been approved.");

        const now = new Date();
        const [result] = await db.update(tasks)
            .set({
                awaitingHeadApproval: false,
                assignmentApprovedBy: user.sub,
                assignmentApprovedAt: now,
                updatedAt: now,
                ...(lateApprovalDueDate(task.dueDate, now) ? { dueDate: lateApprovalDueDate(task.dueDate, now), reminderSentAt: null, overdueNotifiedAt: null, overdueEscalatedAt: null } : {}),
            })
            .where(and(eq(tasks.id, id), eq(tasks.awaitingHeadApproval, true), isNull(tasks.declinedAt), NOT_DELETED));
        if (result.affectedRows === 0) throw AppError.conflict("Someone approved this delegation a moment ago.");

        const { updated, additionalAssigneeIds } = await finishHeadDecision(id, task, "UPDATE", user);
        await notifySafely(() => notificationService.notifyTaskHeadApproved({
            _id: updated.id,
            title: updated.title,
            userId: updated.userId,
            assigneeId: updated.assigneeId,
            additionalAssigneeIds,
        }, user.sub));
        return { ...updated, ...(await approverNames(updated)) };
    },

    async decline(id: string, reason: string, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), NOT_DELETED)).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        const isVerifier = isAdminOrPc(user.role);
        if (!isVerifier && !isDepartmentHead(user, task)) throw AppError.forbidden("Only the department head, PC or an admin can decline this delegation.");
        if (task.userId === user.sub && !isVerifier) throw AppError.badRequest("You gave out this delegation. Ask a manager to remove it instead of declining it.");
        if (task.declinedAt) throw AppError.conflict("This delegation was already declined.");
        if (!(["todo", "in_progress", "on_hold"] as string[]).includes(task.status)) {
            throw AppError.badRequest(
                task.status === "pending_approval" ? "This delegation is waiting for approval. Approve it or send it back instead."
                    : task.status === "draft" ? "This delegation is still a draft."
                        : "This delegation is already closed.",
            );
        }

        const now = new Date();
        const note = reason.trim();
        const [result] = await db.update(tasks)
            .set({ status: "done", declinedAt: now, declinedBy: user.sub, declineReason: note, awaitingHeadApproval: false, updatedAt: now })
            .where(and(eq(tasks.id, id), eq(tasks.status, task.status), isNull(tasks.declinedAt), NOT_DELETED));
        if (result.affectedRows === 0) throw AppError.conflict("Someone changed this delegation a moment ago. Open it again and retry.");

        const { updated, additionalAssigneeIds } = await finishHeadDecision(id, task, "DECLINE", user);
        await notifySafely(() => notificationService.notifyTaskDeclined({
            _id: updated.id,
            title: updated.title,
            userId: updated.userId,
            assigneeId: updated.assigneeId,
            additionalAssigneeIds,
        }, note, user.sub));
        return { ...updated, ...(await approverNames(updated)) };
    },

    async reopenDeclined(id: string, user: AccessTokenPayload) {
        const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), NOT_DELETED)).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");
        if (!task.declinedAt) throw AppError.badRequest("This delegation was not declined.");
        if (!canApproveAssignment(task, user)) throw AppError.forbidden("Only the department head, PC or an admin can reopen a declined delegation.");

        const now = new Date();
        const [result] = await db.update(tasks).set({
            status: "todo",
            declinedAt: null,
            declinedBy: null,
            declineReason: null,
            awaitingHeadApproval: false,
            assignmentApprovedBy: user.sub,
            assignmentApprovedAt: now,
            verifiedBy: null,
            verifiedAt: null,
            verificationNote: null,
            reminderSentAt: null,
            overdueNotifiedAt: null,
            overdueEscalatedAt: null,
            updatedAt: now,
        }).where(and(eq(tasks.id, id), isNotNull(tasks.declinedAt), NOT_DELETED));
        if (result.affectedRows === 0) throw AppError.conflict("Someone reopened this delegation a moment ago.");

        const { updated, additionalAssigneeIds } = await finishHeadDecision(id, task, "REOPEN", user);
        await notifySafely(() => notificationService.notifyTaskHeadApproved({
            _id: updated.id,
            title: updated.title,
            userId: updated.userId,
            assigneeId: updated.assigneeId,
            additionalAssigneeIds,
        }, user.sub));
        return { ...updated, ...(await approverNames(updated)) };
    },

    async remove(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");

        const isVerifier = isAdminOrPc(user.role);
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

    complianceReport,
    ownerStats,
    summary,
    pendingApproval,

};
