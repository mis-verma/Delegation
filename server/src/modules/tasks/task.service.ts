import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskComments, taskCommentAttachments, taskStatusUpdates, smartTaskConversations, tags, taskTags, TASK_STATUSES } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, or, inArray, asc, desc, sql } from "drizzle-orm"
import { DATE_FORMATS } from "../../utils/dateBucket.js"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { ConfirmSmartTaskInput, CreateTaskInput, UpdateTaskInput, VerifyTaskInput } from "./task.validation.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { auditService } from "../audit/audit.service.js"
import { emitTaskEvent } from "../../sockets/taskEvent.js"
import type { DateBucket } from "../../utils/index.js"
import { unlinkUploadUrls } from "../../utils/uploadCleanup.js"

// NOTE on populate-heavy reads: the conventions doc recommends Drizzle's relational query API
// (`db.query.tasks.findFirst({ with: {...} })`) for these, but that API compiles every "many"
// relation into a `LEFT JOIN LATERAL (...)` subquery regardless of nesting depth — and the actual
// database this app runs against (MariaDB 10.11) does not support the LATERAL join syntax at all
// (confirmed against the real local instance; even a single-level `with` fails with a SQL syntax
// error). So every populate below is done as plain `db.select()` calls (regular, non-lateral
// joins/`inArray` batch queries) with the nesting assembled by hand in JS instead.

// A drizzle `or(...)` clause that matches the "self and department" visibility rule: task
// creator, primary assignee, or additional assignee (the latter requires a join against the
// junction table, so this returns the plain condition and the caller decides whether the
// additional-assignee join is actually needed for a given query).
const selfAndDepartmentCondition = (user: AccessTokenPayload) =>
    or(eq(tasks.userId, user.sub), eq(tasks.assigneeId, user.sub));

// Fetches the set of task ids where `userId` appears as an additional assignee — used to widen
// a visibility/mutation filter the same way the old Mongoose `additionalAssigneeIds: user.sub`
// array-contains filter did.
// Labels for a set of tasks, as one query instead of one per task. Returns the full tag rows
// (name + colour), not just ids — every consumer renders the name, so handing back ids would make
// each of them fetch the tag list and join it themselves.
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

// Replaces a task's labels with exactly `tagIds`. Delete-then-insert rather than diffing: the set
// is at most 12 rows (capped in validation), so a diff would be more code for no saved work, and
// doing it inside the caller's transaction keeps a half-applied label set impossible.
//
// `undefined` means "not mentioned in this request" and is handled by the callers, which skip
// calling this entirely. An empty array means "remove them all", which is a real instruction.
const syncTaskTags = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    taskId: string,
    tagIds: string[],
) => {
    await tx.delete(taskTags).where(eq(taskTags.taskId, taskId));
    if (!tagIds.length) return;

    // Deduped because the unique index on (taskId, tagId) would otherwise reject the whole insert
    // if a caller sent the same id twice.
    const unique = [...new Set(tagIds)];
    // Only ids that actually exist — a stale id from a client whose tag list predates a deletion
    // would otherwise fail the foreign key and take the entire task update down with it.
    const existing = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique));
    if (!existing.length) return;

    await tx.insert(taskTags).values(existing.map((tag) => ({ taskId, tagId: tag.id })));
};

const additionalAssigneeTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskAdditionalAssignees.taskId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.userId, userId));
    return rows.map((r) => r.taskId);
};

// ADMIN and PC both get full org-wide visibility — PC's whole job is verification, so capping
// them to their own department made most of the org invisible to them and left the "filter by
// department/person" view (AdminTaskList) unusable for anyone but an admin. Safe to broaden here:
// PC is still blocked from create/delete at the route level (task.routes.ts) and from raw status
// updates in update() below, so this only actually widens list/getById/verify.
// Same-department/creator/assignee visibility everyone below ADMIN/PC gets by default.
const buildVisibilityCondition = async (user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    const selfCondition = additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);

    // MANAGER is this app's "department head" role — they get everything within their own
    // department (not just tasks they created or were assigned), on top of the same
    // creator/assignee visibility everyone else gets for tasks outside their department. This is
    // read-only reach: update() below deliberately does NOT use this function for that reason —
    // see buildMutationCondition.
    if (user.role === "MANAGER" && user.departmentId) {
        return or(eq(tasks.departmentId, user.departmentId), selfCondition);
    }

    return selfCondition;
};

// update()'s authorization check — deliberately narrower than buildVisibilityCondition. ADMIN/PC
// still get unrestricted edit rights (PC is separately blocked from calling update() at all, just
// below), but MANAGER's department-wide *visibility* must not silently double as department-wide
// *edit* rights — being able to see a colleague's delegation is not the same as being allowed to
// retitle it, reassign it, or move its due date. Everyone else keeps the same creator/assignee
// scope they always had.
const buildMutationCondition = async (user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    return additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);
};

// Replaces the whole additionalAssigneeIds set for a task with `userIds` inside a transaction —
// same delete-all-and-reinsert pattern as the rest of this migration (no other table's foreign
// key points at these junction rows, so it's safe).
const replaceAdditionalAssignees = async (taskId: string, userIds: string[] | undefined) => {
    if (userIds === undefined) return;
    // wrapped in a transaction (source had none)
    await db.transaction(async (tx) => {
        await tx.delete(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, taskId));
        if (userIds.length) {
            await tx.insert(taskAdditionalAssignees).values(userIds.map((userId) => ({ taskId, userId })));
        }
    });
};

/**
 * A task's status history, newest first — the same ordering convention TicketStatusUpdate uses
 * (the detail view treats index 0 as the current state).
 *
 * Shared by getById and update so both return the same shape. update() has to include it because
 * the client writes the PATCH response straight into its detail cache; returning the bare task row
 * there would blank the Activity feed's status entries until the follow-up refetch landed.
 */
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
};

// One grouped SQL aggregate behind ownerStats below — `column` is what to GROUP BY (a department/
// assignee/raiser id column, or NULL for one ungrouped org-wide row when `grouped` is false).
// Mirrors ticket.service.ts#ownerStatsByColumn.
const taskOwnerStatsByColumn = async (
    column: ReturnType<typeof sql>,
    conditions: ReturnType<typeof sql>[],
    grouped: boolean,
): Promise<TaskOwnerStatsRow[]> => {
    const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const groupBy = grouped ? sql`GROUP BY ownerId` : sql``;

    // db.execute() on the mysql2 driver resolves to the raw mysql2 result tuple [rows, fields],
    // NOT a plain row array — must destructure element 0 (see complianceReport above).
    const [rows] = await db.execute(sql`
        SELECT
            ${column} AS ownerId,
            COUNT(*) AS total,
            SUM(t.status = 'done') AS done,
            SUM(t.status != 'done' AND t.dueDate IS NOT NULL AND t.dueDate < NOW()) AS overdueCount
        FROM Task t
        ${where}
        ${groupBy}
    `);

    return (rows as unknown as any[]).map((r) => ({
        ownerId: r.ownerId != null ? String(r.ownerId) : null,
        total: Number(r.total),
        done: Number(r.done),
        overdueCount: Number(r.overdueCount),
    }));
};

export const taskService = {
    async list(user: AccessTokenPayload, filterUserId?: string, status?: string, page = 1, limit = 200, tagIds?: string[]) {
        let condition;
        if ((user.role === "ADMIN" || user.role === "PC") && filterUserId) {
            const additionalIds = await additionalAssigneeTaskIds(filterUserId);
            condition = additionalIds.length
                ? or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId), inArray(tasks.id, additionalIds))
                : or(eq(tasks.userId, filterUserId), eq(tasks.assigneeId, filterUserId));
        } else {
            condition = await buildVisibilityCondition(user);
        }

        const filters = [condition, status ? eq(tasks.status, status as any) : undefined];

        // EXISTS rather than a join: joining TaskTag would multiply a task's row by its matching
        // label count, breaking both the page size and the count query. Same reason
        // checklistInstance.service.ts expresses its item predicates as EXISTS subqueries.
        if (tagIds?.length) {
            const idList = sql.join(tagIds.map((id) => sql`${id}`), sql`, `);
            filters.push(sql`EXISTS (SELECT 1 FROM ${taskTags} tt WHERE tt.taskId = ${tasks.id} AND tt.tagId IN (${idList}))`);
        }

        const active = filters.filter(Boolean);
        const where = active.length ? and(...active) : undefined;

        // The count runs against the same `where` as the page itself. Without it the response was
        // indistinguishable from "these are all your tasks" once the row count passed `limit`, and
        // the client's stat tiles — which count client-side over whatever array they receive —
        // reported the truncated figure as the real one. Same shape as ticketService.list's meta.
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

        // Old code only needed `url`/`mimeType` for the attachment thumbnails.
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

        return {
            data: rows.map((task) => ({
                ...task,
                attachments: attachmentsByTask.get(task.id) ?? [],
                tags: tagMap.get(task.id) ?? [],
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

        return task!;
    },

    async getById(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility) : eq(tasks.id, id);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found")

        // checklists -> items -> images (see the NOTE above imports for why this is assembled by
        // hand instead of via db.query's relational API).
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

        // attachments -> uploadedByUser (a regular join is fine here — only "many" relations
        // needed the LATERAL join drizzle's relational API insists on).
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
            statusUpdates: await loadStatusUpdates(task.id),
        };
    },

    async create(input: CreateTaskInput, user: AccessTokenPayload) {
        const { additionalAssigneeIds, tagIds, startDate, dueDate, ...rest } = input;
        const id = createId();

        // wrapped in a transaction (source had none)
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

            // Inside the transaction: a label set that half-applied would leave the delegation
            // filtered under labels it doesn't really carry.
            if (tagIds) await syncTaskTags(tx, id, tagIds);

            const [created] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
            return created!;
        });

        if (task.assigneeId) {
            await notifySafely(() => notificationService.notifyTaskAssigned({
                _id: task.id,
                title: task.title,
                userId: task.userId,
                assigneeId: task.assigneeId,
                additionalAssigneeIds,
            }));
        }

        await auditService.record({ entityType: "Task", entityId: task.id, action: "CREATE", actorId: user.sub, after: task });

        return task;
    },

    async update(id: string, input: UpdateTaskInput, user: AccessTokenPayload) {
        if (user.role === "PC") {
            throw AppError.forbidden("PC can only act on a delegation through the verification queue.")
        }

        const mutationCondition = await buildMutationCondition(user);
        const where = mutationCondition ? and(eq(tasks.id, id), mutationCondition) : eq(tasks.id, id);

        const [existing] = await db.select().from(tasks).where(where).limit(1);
        if (!existing) throw AppError.notFound("Delegation not found");

        // Reassigning who owns/handles a delegation is a routing decision, not ordinary
        // field-editing — even a caller who can mutate this task at all (e.g. an AGENT/USER who
        // merely created or was assigned it) shouldn't be able to redirect it to an arbitrary
        // assignee or department on their own; only someone with actual authority over routing
        // should (mirrors the equivalent guard in ticket.service.ts's update()).
        if ((input.assigneeId !== undefined || input.departmentId !== undefined) && (user.role === "AGENT" || user.role === "USER")) {
            throw AppError.forbidden("Only a manager or above can reassign a delegation's assignee or department.")
        }

        const beforeStatus = existing.status;

        if (input.status === "done" && beforeStatus !== "done") {
            if (user.role !== "ADMIN") {
                throw AppError.forbidden("Only a verifier can mark a delegation done — send it for review instead.")
            }
        } else if (beforeStatus === "done" && input.status !== undefined && input.status !== "done") {
            // Symmetric with the guard above: only a verifier can move a task OUT of "done" too —
            // otherwise the creator/assignee (who already has ordinary mutate rights) could reopen
            // an already-verified task themselves, silently discarding PC's decision with no
            // re-verification gate.
            if (user.role !== "ADMIN") {
                throw AppError.forbidden("Only a verifier can reopen a delegation that's already been verified.")
            }
        } else if (input.status === "pending_verification" && beforeStatus !== "pending_verification") {
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

        const { additionalAssigneeIds, tagIds, startDate, dueDate, statusRemark, ...rest } = input;

        // Every status move must say why. Tickets have always worked this way; delegations moved
        // between columns with nothing recorded, so a board that changed under you gave no way to
        // find out who moved what, when, or on what grounds. Checked here rather than in the Zod
        // schema because only this layer can see whether `status` actually differs from what's
        // stored — a PATCH that merely re-sends the current status isn't a status change and
        // shouldn't demand a remark.
        const isStatusChange = input.status !== undefined && input.status !== beforeStatus;
        const remark = statusRemark?.trim();
        if (isStatusChange && !remark) {
            throw AppError.badRequest("A remark is required to change a delegation's status.")
        }

        // Moving the deadline (or changing/clearing the reminder lead time) invalidates whatever
        // reminder was already scheduled for the old dueDate — re-arm it so the sweep can send a
        // fresh one instead of treating this task as already handled.
        const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (startDate !== undefined) update.startDate = startDate ? new Date(startDate) : null;
        if (dueDate !== undefined) update.dueDate = dueDate ? new Date(dueDate) : null;
        if ("dueDate" in input || "reminderMinutesBefore" in input) {
            update.reminderSentAt = null;
        }
        // Reopening an already-verified task (ADMIN-only, per the guard above) makes the old
        // verification fields stale/misleading — clear them so the record doesn't keep showing a
        // verifiedBy/verifiedAt/verificationNote for a decision that no longer describes the
        // task's current state.
        if (beforeStatus === "done" && input.status !== undefined && input.status !== "done") {
            update.verifiedBy = null;
            update.verifiedAt = null;
            update.verificationNote = null;
        }

        // wrapped in a transaction (source had none)
        const task = await db.transaction(async (tx) => {
            await tx.update(tasks).set(update).where(and(eq(tasks.id, id), mutationCondition ?? eq(tasks.id, id)));
            await replaceAdditionalAssignees(id, additionalAssigneeIds);
            // `undefined` means the request didn't mention labels, so leave them alone; an empty
            // array is an explicit "clear them". A PATCH that only moves a status must not wipe
            // the delegation's labels as a side effect.
            if (tagIds !== undefined) await syncTaskTags(tx, id, tagIds);
            // Inside the transaction so the move and its justification land together — a status
            // change that committed without its audit row would be exactly the silent change this
            // feature exists to stop.
            if (isStatusChange) {
                await tx.insert(taskStatusUpdates).values({
                    taskId: id,
                    changedBy: user.sub,
                    fromStatus: beforeStatus,
                    toStatus: input.status!,
                    remark: remark!,
                });
            }
            const [updated] = await tx.select().from(tasks).where(eq(tasks.id, id)).limit(1);
            return updated;
        });
        if (!task) throw AppError.notFound("Delegation not found")

        // Only 'task:created' was ever emitted, so every other client's board went stale the
        // moment someone moved a card or edited a field — the "live" board only actually showed
        // new delegations appearing. Emitted to the post-update routing, plus the pre-update
        // routing when an edit reassigned the task, since whoever could see it under the old
        // assignee/department also needs to hear that it left them.
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

        if (input.status === "pending_verification" && beforeStatus !== "pending_verification") {
            await notifySafely(() => notificationService.notifyPendingVerification({
                _id: task.id,
                title: task.title,
                departmentId: task.departmentId ?? undefined,
            }, 'TASK'));
        }

        await auditService.record({ entityType: "Task", entityId: id, action: "UPDATE", actorId: user.sub, before: existing, after: task });

        // Includes the history: the client writes this response straight into its detail cache,
        // so returning the bare row would momentarily blank the Activity feed's status entries.
        return { ...task, statusUpdates: await loadStatusUpdates(id) };
    },


    async verify(id: string, input: VerifyTaskInput, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility) : eq(tasks.id, id);
        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found")

        if (task.status !== "pending_verification") {
            throw AppError.badRequest("This delegation isn't pending verification.")
        }

        const update: Record<string, unknown> = { updatedAt: new Date() };
        if (input.action === "APPROVE") {
            update.status = "done";
            update.verifiedBy = user.sub;
            update.verifiedAt = new Date();
            update.verificationNote = input.note ?? null;
        } else {
            update.status = "in_progress";
            update.verificationNote = input.note ?? null;
        }
        // Optimistic-concurrency guard: the WHERE clause re-checks status === "pending_verification"
        // atomically inside the UPDATE itself (mirrors advanceConversation's pattern), so two
        // concurrent verify calls can't both "win" — only the first write matches and the second
        // gets affectedRows === 0 instead of silently re-applying its own status/verifiedBy on top.
        const [result] = await db.update(tasks).set(update).where(and(eq(tasks.id, id), eq(tasks.status, "pending_verification")));
        if (result.affectedRows === 0) {
            throw AppError.badRequest("This delegation isn't pending verification.")
        }

        // Approve/reject is a status move too, so it belongs on the same timeline — otherwise the
        // history would show a delegation reaching "Pending Verification" and then simply being
        // done, with the actual decision (and the verifier's reason for it) missing. The note is
        // optional on APPROVE, so fall back to stating the decision plainly.
        await db.insert(taskStatusUpdates).values({
            taskId: id,
            changedBy: user.sub,
            fromStatus: "pending_verification",
            toStatus: update.status as typeof TASK_STATUSES[number],
            remark: input.note?.trim() || (input.action === "APPROVE" ? "Approved." : "Sent back for rework."),
        });

        const [updated] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
        const additionalAssigneeIds = (await db.select({ userId: taskAdditionalAssignees.userId })
            .from(taskAdditionalAssignees)
            .where(eq(taskAdditionalAssignees.taskId, id))).map((r) => r.userId);

        await notifySafely(() => notificationService.notifyVerificationResult({
            _id: updated!.id,
            title: updated!.title,
            userId: updated!.userId,
            assigneeId: updated!.assigneeId ?? undefined,
            additionalAssigneeIds,
        }, input.action, input.note, 'TASK'))

        // Approve/reject is how a delegation reaches "done", so it moves between board columns
        // exactly like a drag does and needs the same event.
        emitTaskEvent('task:updated', {
            userId: updated!.userId,
            assigneeId: updated!.assigneeId ?? null,
            departmentId: updated!.departmentId ?? null,
        }, updated);

        // Recorded as VERIFY rather than UPDATE — approving or rejecting a delegation is the
        // decision an audit is most likely to be asked about, and folding it into the generic
        // UPDATE stream would make it indistinguishable from an ordinary field edit.
        await auditService.record({ entityType: "Task", entityId: id, action: "VERIFY", actorId: user.sub, after: updated });

        return { ...updated!, statusUpdates: await loadStatusUpdates(id) };
    },


    async remove(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility) : eq(tasks.id, id);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");

        // wrapped in a transaction — clears every child/junction row that has no cascading FK
        // before deleting the task itself (mirrors ticketService.remove's approach). The DB rows
        // are the only thing this used to clean up — the actual evidence photos/attachments they
        // pointed at stayed on disk forever, an unbounded leak with no retention sweep to catch it
        // (unlike audit logs/notifications/inbound messages). File urls are collected here, before
        // each table is deleted, and unlinked (best-effort) only after the transaction commits.
        const orphanedUrls: string[] = [];
        await db.transaction(async (tx) => {
            const childChecklists = await tx.select({ id: taskChecklists.id }).from(taskChecklists).where(eq(taskChecklists.taskId, id));
            const checklistIds = childChecklists.map((c) => c.id);
            if (checklistIds.length) {
                const childItems = await tx.select({ id: taskChecklistItems.id }).from(taskChecklistItems).where(inArray(taskChecklistItems.taskChecklistId, checklistIds));
                const itemIds = childItems.map((i) => i.id);
                if (itemIds.length) {
                    const images = await tx.select({ url: taskImages.url }).from(taskImages).where(inArray(taskImages.taskChecklistItemId, itemIds));
                    orphanedUrls.push(...images.map((i) => i.url));
                    await tx.delete(taskImages).where(inArray(taskImages.taskChecklistItemId, itemIds));
                }
                await tx.delete(taskChecklistItems).where(inArray(taskChecklistItems.taskChecklistId, checklistIds));
                await tx.delete(taskChecklists).where(eq(taskChecklists.taskId, id));
            }
            const attachments = await tx.select({ url: taskAttachments.url }).from(taskAttachments).where(eq(taskAttachments.taskId, id));
            orphanedUrls.push(...attachments.map((a) => a.url));
            await tx.delete(taskAttachments).where(eq(taskAttachments.taskId, id));

            // TaskCommentAttachment cascades on TaskComment delete (ON DELETE CASCADE) — the rows
            // vanish on their own, but only a SELECT taken before that delete can still see their
            // urls to unlink the underlying files.
            const commentAttachments = await tx.select({ url: taskCommentAttachments.url })
                .from(taskCommentAttachments)
                .innerJoin(taskComments, eq(taskCommentAttachments.commentId, taskComments.id))
                .where(eq(taskComments.taskId, id));
            orphanedUrls.push(...commentAttachments.map((a) => a.url));
            await tx.delete(taskComments).where(eq(taskComments.taskId, id));

            // TaskStatusUpdate's FK to Task has no ON DELETE CASCADE (matching every other child
            // table here), so leaving these behind would make deleting any delegation that ever
            // changed status fail on a constraint violation.
            await tx.delete(taskStatusUpdates).where(eq(taskStatusUpdates.taskId, id));
            await tx.delete(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, id));
            await tx.update(smartTaskConversations).set({ resultingTaskId: null }).where(eq(smartTaskConversations.resultingTaskId, id));
            await tx.delete(tasks).where(eq(tasks.id, id));
        });
        unlinkUploadUrls(orphanedUrls);

        // Carries only the id — the row is gone, so there's nothing else meaningful to send, and
        // clients only need to know which card to drop.
        emitTaskEvent('task:deleted', {
            userId: task.userId,
            assigneeId: task.assigneeId ?? null,
            departmentId: task.departmentId ?? null,
        }, { id: task.id });

        // `before` is the whole row — after a hard delete this snapshot is the only record that
        // the delegation ever existed.
        await auditService.record({ entityType: "Task", entityId: id, action: "DELETE", actorId: user.sub, before: task });

        return task;
    },

    // Ported from a MongoDB aggregation pipeline (TaskChecklistItem -> TaskChecklist -> Task,
    // joined to TaskImage) to raw SQL, since the pipeline's conditional "qualifying photo count"
    // logic ($cond/$filter/$size) doesn't map onto Prisma-/Drizzle-style query builders cleanly.
    // Shape/semantics preserved exactly: per time bucket, how many checklist items were done, and
    // of those requiring a photo, how many met their photo-evidence requirement (LIVE-only if
    // requiresLivePhoto, otherwise any capture method).
    async complianceReport(groupBy: DateBucket, departmentId?: string, from?: string, to?: string, userId?: string, departmentIds?: string[]) {
        const conditions: ReturnType<typeof sql>[] = [];
        if (from) conditions.push(sql`tci.createdAt >= ${new Date(from)}`);
        if (to) conditions.push(sql`tci.createdAt <= ${new Date(to)}`);
        if (departmentId) conditions.push(sql`t.departmentId = ${departmentId}`);
        // A SENIOR has no department of their own — this matches every department that belongs
        // to their store instead (see reportScope.ts's resolveDepartmentIdsForStore). Checked
        // explicitly against `undefined` so an empty array (a store with zero departments
        // assigned yet) still matches nothing, rather than silently matching everything.
        if (departmentIds !== undefined) {
            conditions.push(departmentIds.length
                ? sql`t.departmentId IN (${sql.join(departmentIds.map((id) => sql`${id}`), sql`, `)})`
                : sql`1 = 0`);
        }
        if (userId) conditions.push(sql`(t.userId = ${userId} OR t.assigneeId = ${userId} OR taa.userId IS NOT NULL)`);

        const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        // db.execute() on the mysql2 driver resolves to the raw mysql2 result tuple
        // [rows, fields], NOT a plain row array — must destructure element 0.
        const [rows] = await db.execute(sql`
            SELECT
                DATE_FORMAT(tci.createdAt, ${DATE_FORMATS[groupBy]}) AS bucket,
                COUNT(*) AS totalItems,
                SUM(tci.isDone) AS doneItems,
                SUM(tci.requiredImageCount > 0) AS itemsRequiringPhotos,
                SUM(
                    CASE WHEN tci.requiredImageCount > 0
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
            ORDER BY bucket ASC
        `);

        return (rows as unknown as any[]).map((r) => ({
            bucket: r.bucket as string,
            totalItems: Number(r.totalItems),
            doneItems: Number(r.doneItems),
            completionRate: Number(r.totalItems) ? Math.round((Number(r.doneItems) / Number(r.totalItems)) * 1000) / 10 : null,
            itemsRequiringPhotos: Number(r.itemsRequiringPhotos),
            qualityRate: Number(r.itemsRequiringPhotos) ? Math.round((Number(r.photoCompliantItems) / Number(r.itemsRequiringPhotos)) * 1000) / 10 : null,
        }));
    },

    // Real GROUP BY aggregate for the admin "Delegations" rankings/leaderboard — replaces a
    // client-side reduce over `useTasksQuery()`'s newest-200-tasks-org-wide page, which silently
    // mis-scored (or zeroed out) any department/user whose tasks weren't among those 200, and
    // ignored the page's own date-range filter entirely. Mirrors ticket.service.ts#ownerStats.
    async ownerStats(scope: "department" | "user" | "org", from?: string, to?: string, departmentId?: string, departmentIds?: string[]): Promise<TaskOwnerStatsRow[]> {
        const baseConditions: ReturnType<typeof sql>[] = [];
        if (from) baseConditions.push(sql`t.createdAt >= ${new Date(from)}`);
        if (to) baseConditions.push(sql`t.createdAt <= ${new Date(to)}`);
        // Same store->department resolution as complianceReport above: Task has no storeId, so a
        // SENIOR's scope arrives as a resolved department id list instead.
        if (departmentIds !== undefined) {
            baseConditions.push(departmentIds.length
                ? sql`t.departmentId IN (${sql.join(departmentIds.map((id) => sql`${id}`), sql`, `)})`
                : sql`1 = 0`);
        } else if (departmentId) {
            baseConditions.push(sql`t.departmentId = ${departmentId}`);
        }

        if (scope === "department") return taskOwnerStatsByColumn(sql`t.departmentId`, baseConditions, true);
        if (scope === "org") return taskOwnerStatsByColumn(sql`NULL`, baseConditions, false);

        // user: credit both the primary assignee and the raiser, same dual-credit merge (and same
        // accepted self-assigned-double-count edge case) as ticketService.ownerStats('user', ...).
        // Deliberately excludes TaskAdditionalAssignee — matches the simpler "assignee or raiser"
        // rule the leaderboard used before this fix, not an expansion of scope.
        const [assigneeRows, raiserRows] = await Promise.all([
            taskOwnerStatsByColumn(sql`t.assigneeId`, [...baseConditions, sql`t.assigneeId IS NOT NULL`], true),
            taskOwnerStatsByColumn(sql`t.userId`, baseConditions, true),
        ]);
        const merged = new Map<string, TaskOwnerStatsRow>();
        for (const row of [...assigneeRows, ...raiserRows]) {
            if (row.ownerId == null) continue;
            const existing = merged.get(row.ownerId);
            merged.set(row.ownerId, existing ? {
                ownerId: row.ownerId,
                total: existing.total + row.total,
                done: existing.done + row.done,
                overdueCount: existing.overdueCount + row.overdueCount,
            } : row);
        }
        return [...merged.values()];
    },

};
