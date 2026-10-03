import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskStatusUpdates, tags, taskTags, taskReviewers, TASK_STATUSES } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, or, inArray, asc, desc, sql, isNull, isNotNull, ne, type SQL } from "drizzle-orm"
import { cached, cacheKey, invalidateQuick } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import { createId } from "@paralleldrive/cuid2"
import { AppError } from "../../utils/AppError.js"
import { assertChecklistsResolved } from "../../utils/checklistGate.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { ConfirmSmartTaskInput, CreateTaskInput, UpdateTaskInput, VerifyTaskInput } from "./task.validation.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { auditService } from "../audit/audit.service.js"
import { emitTaskEvent } from "../../sockets/taskEvent.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"

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

// Soft-deleted rows (see remove() below) must stay invisible everywhere a live task is looked
// up — every read path below ANDs this in alongside its own visibility/mutation condition rather
// than relying on buildVisibilityCondition/buildMutationCondition, since both of those return
// `undefined` (i.e. "no restriction at all") for ADMIN/PC.
const NOT_DELETED = isNull(tasks.deletedAt);

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

// Labels live in a join table, not on the row, so the audit snapshot has to carry them itself —
// otherwise adding or removing a label leaves an UPDATE row with no visible change in Activity.
// Same shape as ticket.service's ticketTagIds.
const taskTagIds = async (taskId: string): Promise<string[]> =>
    (await db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, taskId)))
        .map((r) => r.tagId).sort();

const additionalAssigneeTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskAdditionalAssignees.taskId })
        .from(taskAdditionalAssignees)
        .where(eq(taskAdditionalAssignees.userId, userId));
    return rows.map((r) => r.taskId);
};

// Task ids where `userId` was explicitly named a reviewer — mirrors additionalAssigneeTaskIds
// above. Used both to widen buildVisibilityCondition (a reviewer needs to be able to find the
// task before they can verify it) and by assertCanVerify below.
const reviewerTaskIds = async (userId: string): Promise<string[]> => {
    const rows = await db.select({ taskId: taskReviewers.taskId })
        .from(taskReviewers)
        .where(eq(taskReviewers.userId, userId));
    return rows.map((r) => r.taskId);
};

// Replaces a task's reviewer list with exactly `userIds` — same delete-then-insert convention as
// syncTaskTags (the set is capped small in validation, so a diff buys nothing).
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

// Reviewer rows for a set of tasks, as one query — same batching convention as tagsByTask, used
// by getById/list to hand the client back who's named on a task instead of just how many.
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

// ADMIN and PC both get full org-wide visibility — PC's whole job is verification, so capping
// them to their own department made most of the org invisible to them and left the "filter by
// department/person" view (AdminTaskList) unusable for anyone but an admin. Safe to broaden here:
// PC is still blocked from create/delete at the route level (task.routes.ts) and from raw status
// updates in update() below, so this only actually widens list/getById/verify.
// Same-department/creator/assignee visibility everyone below ADMIN/PC gets by default.
const buildVisibilityCondition = async (user: AccessTokenPayload) => {
    // APPROVAL_MANAGER has the same org-wide reach as ADMIN/PC — the final-approval stage needs
    // to see every pending_approval delegation across the org, not just one department.
    if (user.role === "ADMIN" || user.role === "PC" || user.role === "APPROVAL_MANAGER") return undefined;

    const additionalIds = await additionalAssigneeTaskIds(user.sub);
    const selfCondition = additionalIds.length
        ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
        : selfAndDepartmentCondition(user);

    // An explicitly named reviewer (taskReviewers, additive on top of the role-based rule — see
    // assertCanVerify) needs to be able to find the task at all before they can verify it,
    // regardless of role or department — the same reach ChecklistInstance's reviewer scoping
    // already grants.
    const reviewedIds = await reviewerTaskIds(user.sub);
    const withReviewer = reviewedIds.length
        ? or(selfCondition, inArray(tasks.id, reviewedIds))
        : selfCondition;

    // MANAGER is this app's "department head" role — they get everything within their own
    // department (not just tasks they created or were assigned), on top of the same
    // creator/assignee visibility everyone else gets for tasks outside their department. This is
    // read-only reach: update() below deliberately does NOT use this function for that reason —
    // see buildMutationCondition.
    if (user.role === "MANAGER" && user.departmentId) {
        return or(eq(tasks.departmentId, user.departmentId), withReviewer);
    }

    return withReviewer;
};

// verify()'s authorization — deliberately separate from (and narrower than) the visibility a
// caller needs merely to find the task. A task's own creator/assignee has visibility via
// selfAndDepartmentCondition above but must NOT be able to self-approve their own work, so
// role-based verify rights are their own table rather than falling out of buildVisibilityCondition.
const CAN_VERIFY_BY_ROLE: Partial<Record<AccessTokenPayload["role"], (task: { departmentId: string | null }, user: AccessTokenPayload) => boolean>> = {
    ADMIN: () => true,
    PC: () => true,
    // MANAGER (HOD) may verify a delegation within their own department only — additive on top
    // of whatever else could already verify it, never a replacement.
    MANAGER: (task, user) => !!user.departmentId && task.departmentId === user.departmentId,
};

// An explicitly named reviewer (taskReviewers) can always verify, on top of whatever
// CAN_VERIFY_BY_ROLE already grants — additive, never a replacement. This is also why
// PATCH /tasks/:id/verify no longer role-gates at the router: a reviewer can be any role at all,
// so the check has to happen here, against this specific task.
const assertCanVerify = async (task: { id: string; departmentId: string | null }, user: AccessTokenPayload) => {
    if (CAN_VERIFY_BY_ROLE[user.role]?.(task, user)) return;
    const [reviewer] = await db.select({ id: taskReviewers.id })
        .from(taskReviewers)
        .where(and(eq(taskReviewers.taskId, task.id), eq(taskReviewers.userId, user.sub)))
        .limit(1);
    if (!reviewer) throw AppError.forbidden();
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

// Replaces the whole additionalAssigneeIds set for a task with `userIds` — same delete-all-and-
// reinsert pattern as syncTaskTags/syncTaskReviewers above (no other table's foreign key points at
// these junction rows, so it's safe). Takes the caller's `tx` rather than opening its own
// transaction: its one call site (update(), below) already runs inside an outer transaction
// alongside the tags/reviewers sync and the task row update itself — a separate transaction here
// would commit independently of that one, so a later step failing and rolling back the outer
// transaction would silently leave this change applied instead of rolled back with everything else.
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
    /** The server never invents a default window: no from/to means all time. Clients send explicit dates. */
    windowDefaulted: false;
};

// Dashboard's "Needs your approval" card — ticket.service.ts's TicketPendingApprovalRow has the
// identical shape; the client combines both alongside checklistInstance's differently-shaped row.
export type TaskPendingApprovalRow = {
    id: string;
    title: string;
    submittedBy: string | null;
    waitingSince: string;
};

// Shared shape for the sidebar's per-entity count badge — Ticket/Todo mirror this same field set
// (minus `draft`, which only Tasks genuinely have) in their own summary() methods.
export type TaskSummaryRow = {
    total: number;
    /** Open work: due + overdue. Drafts and finished tasks are not pending. */
    pending: number;
    newToday: number;
    due: number;
    overdue: number;
    completed: number;
    draft: number;
};

export type TaskSummaryScope = "mine" | "visible";

const TASK_SUMMARY_PREFIX = "task-summary";
// Short on purpose: the numbers also move with the clock (a due date passing) and with writers that
// don't go through this service (bulk import), neither of which can invalidate anything.
const SUMMARY_TTL_SECONDS = 10;

// Called by every mutation that can change a count. Wipes every user's cached summary, since one
// task moves numbers for its creator, assignees and every manager/admin who can see it.
const dropTaskSummaries = () => invalidateQuick(`${TASK_SUMMARY_PREFIX}:`);

// One grouped SQL aggregate behind ownerStats below — `column` is what to GROUP BY (a department/
// assignee id column, or NULL for one ungrouped org-wide row when `grouped` is false).
// Mirrors ticket.service.ts#ownerStatsByColumn.
//
// What counts as a delegation here: not soft-deleted, not a draft (private scratch), category
// 'delegation' (issues are reported elsewhere) and not a subtask (its parent already counts).
// Overdue = still open and past due: not done, not draft, and not pending_approval (the work is
// finished and waiting on a reviewer, so the assignee's clock has stopped). "Now" is a bound UTC
// string, not NOW(), so Node and the DB session timezone can never disagree.
const taskOwnerStatsByColumn = async (
    column: SQL,
    conditions: SQL[],
    grouped: boolean,
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

    // db.execute() on the mysql2 driver resolves to the raw mysql2 result tuple [rows, fields],
    // NOT a plain row array — must destructure element 0 (see complianceReport above).
    const [rows] = await db.execute(sql`
        SELECT
            ${column} AS ownerId,
            COUNT(*) AS total,
            COALESCE(SUM(t.status = 'done'), 0) AS done,
            COALESCE(SUM(t.status NOT IN ('done', 'draft', 'pending_approval') AND t.dueDate IS NOT NULL AND t.dueDate < ${now}), 0) AS overdueCount
        FROM Task t
        ${where}
        ${groupBy}
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        ownerId: r.ownerId != null ? String(r.ownerId) : null,
        total: Number(r.total),
        done: Number(r.done),
        overdueCount: Number(r.overdueCount),
        windowDefaulted: false as const,
    }));
};

export const taskService = {
    async list(user: AccessTokenPayload, filterUserId?: string, status?: string, page = 1, limit = 200, tagIds?: string[], archived = false, includeChecklistSummary = false) {
        let condition;
        // Drafts are private scratch space — visible only to the person who created them, full
        // stop, overriding the normal creator/assignee/department/org-wide reach every other
        // status gets (even ADMIN/PC's usual org-wide visibility doesn't apply here). This only
        // engages when a caller explicitly asks for status === 'draft'; the branches below (which
        // decide who else's tasks a filterUserId/role can reach) are skipped entirely.
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

        // Archived Delegations flips which side of deletedAt IS NULL this query looks at — same
        // visibility scope, just the soft-deleted set instead of the live one.
        const deletedFilter = archived ? isNotNull(tasks.deletedAt) : NOT_DELETED;
        // A caller who didn't ask for a specific status (the ordinary "all statuses" list/board/
        // table view) must never have drafts silently mixed in — they're pre-publication scratch
        // items, not part of the normal workflow view. Only reachable by explicitly filtering to
        // status === 'draft' (handled by the visibility override above). The archived view is the
        // one exception: a soft-deleted draft should still show up there under "archived",
        // regardless of status, the same as a soft-deleted task at any other status would.
        const statusFilter = status
            ? eq(tasks.status, status as any)
            : (archived ? undefined : ne(tasks.status, "draft"));

        const filters = [deletedFilter, condition, statusFilter];

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

        // Verification Queue's collapsed-row summary — done/total items and how many are still
        // missing a required photo, batched in one aggregate query over this page's taskIds rather
        // than a full checklist fetch per row (which is what the lazy per-row detail fetch on
        // expand exists to avoid triggering for every row up front).
        const checklistSummaryByTask = new Map<string, { total: number; done: number; missingPhotos: number }>();
        if (includeChecklistSummary) {
            // db.execute() on the mysql2 driver resolves to the raw mysql2 result tuple [rows, fields].
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
            // mysql2 rows carry no static shape — same cast complianceReport above uses.
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

        return task!;
    },

    async getById(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

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
            reviewers: (await reviewersByTask([task.id])).get(task.id) ?? [],
            statusUpdates: await loadStatusUpdates(task.id),
        };
    },

    async create(input: CreateTaskInput, user: AccessTokenPayload) {
        const { additionalAssigneeIds, tagIds, reviewerIds, startDate, dueDate, ...rest } = input;
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
            if (reviewerIds?.length) await syncTaskReviewers(tx, id, reviewerIds);

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
            // Same call as Ticket's own CLOSED guard (ticket.service.ts's update()): this used to
            // just role-gate (ADMIN) and let the status through, which meant an admin could mark a
            // delegation done straight from todo/in_progress — skipping both the checklist gate
            // that's supposed to clear on the way into pending_approval and the verification record
            // itself (verifiedBy/verifiedAt were never set through this path). verify() (PATCH
            // /tasks/:id/verify, action=APPROVE) is the one place that does all of that atomically
            // under its own optimistic-concurrency guard, and is now the only way to reach "done".
            throw AppError.badRequest("A delegation can only be marked done by approving it — send it for review first, then approve it from there.")
        } else if (beforeStatus === "done" && input.status !== undefined && input.status !== "done") {
            // Symmetric with the guard above: only a verifier can move a task OUT of "done" too —
            // otherwise the creator/assignee (who already has ordinary mutate rights) could reopen
            // an already-verified task themselves, silently discarding PC's decision with no
            // re-verification gate.
            if (user.role !== "ADMIN") {
                throw AppError.forbidden("Only a verifier can reopen a delegation that's already been verified.")
            }
        } else if (input.status === "pending_approval" && beforeStatus !== "pending_approval") {
            // Must arrive from in_progress — a delegation used to be able to jump straight from
            // todo (or even draft) to pending_approval, "arriving" for review despite never
            // actually being marked as started. The stepper on the detail sheet already presents
            // this as a strict four-stage pipeline; the board's drag and card "Move to" menu (both
            // funnelled through this same update()) just weren't enforcing what it shows.
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
            await replaceAdditionalAssignees(tx, id, additionalAssigneeIds);
            // `undefined` means the request didn't mention labels, so leave them alone; an empty
            // array is an explicit "clear them". A PATCH that only moves a status must not wipe
            // the delegation's labels as a side effect.
            if (tagIds !== undefined) await syncTaskTags(tx, id, tagIds);
            // Same "undefined = untouched, [] = clear them" convention as tagIds.
            if (reviewerIds !== undefined) await syncTaskReviewers(tx, id, reviewerIds);
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

        if (input.status === "pending_approval" && beforeStatus !== "pending_approval") {
            await notifySafely(() => notificationService.notifyPendingVerification({
                _id: task.id,
                title: task.title,
                departmentId: task.departmentId ?? undefined,
            }, 'TASK'));
        }

        const afterTagIds = tagIds !== undefined ? await taskTagIds(id) : beforeTagIds;
        await auditService.record({
            entityType: "Task", entityId: id, action: "UPDATE", actorId: user.sub,
            before: { ...existing, tagIds: beforeTagIds },
            after: { ...task, tagIds: afterTagIds },
        });

        await dropTaskSummaries();

        // Includes the history: the client writes this response straight into its detail cache,
        // so returning the bare row would momentarily blank the Activity feed's status entries.
        // Labels too: without them the detail cache lost its chips after every field edit.
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

        // Single-stage verify: one PC/ADMIN/MANAGER-in-department/named-reviewer check decides the
        // whole thing (the old two-stage QC-then-approval split — a separate APPROVAL_MANAGER-only
        // sign-off after QC passed — is gone; approving here is final).
        await assertCanVerify(task, user);

        const fromStatus = task.status;
        const update: Record<string, unknown> = { updatedAt: new Date(), verificationNote: input.note ?? null };
        if (input.action === "APPROVE") {
            update.status = "done";
            update.verifiedBy = user.sub;
            update.verifiedAt = new Date();
        } else {
            update.status = "in_progress";
        }
        // Optimistic-concurrency guard: the WHERE clause re-checks the status this row was read at
        // atomically inside the UPDATE itself (mirrors advanceConversation's pattern), so two
        // concurrent verify calls can't both "win" — only the first write matches and the second
        // gets affectedRows === 0 instead of silently re-applying its own status/verifiedBy on top.
        const [result] = await db.update(tasks).set(update).where(and(eq(tasks.id, id), eq(tasks.status, fromStatus)));
        if (result.affectedRows === 0) {
            throw AppError.badRequest("This delegation isn't pending approval.")
        }

        // Approve/reject is a status move too, so it belongs on the same timeline — otherwise the
        // history would show a delegation reaching "Pending Approval" and then simply being done,
        // with the actual decision (and the reviewer's reason for it) missing. The note is optional
        // on APPROVE, so fall back to stating the decision plainly.
        await db.insert(taskStatusUpdates).values({
            taskId: id,
            changedBy: user.sub,
            fromStatus,
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
        await dropTaskSummaries();

        return { ...updated!, statusUpdates: await loadStatusUpdates(id) };
    },


    // Soft delete: sets deletedAt instead of removing the row (and used to also hard-delete every
    // child/junction row + unlink evidence photos/attachments from disk — see git history for that
    // cascade if it's ever needed again). Nothing else is touched: children stay exactly as they
    // were so the delegation is fully recoverable, not just its own row. Every read path in this
    // file (list/getById/update/verify, all via NOT_DELETED above) hides it from here on.
    async remove(id: string, user: AccessTokenPayload) {
        const visibility = await buildVisibilityCondition(user);
        const where = visibility ? and(eq(tasks.id, id), visibility, NOT_DELETED) : and(eq(tasks.id, id), NOT_DELETED);

        const [task] = await db.select().from(tasks).where(where).limit(1);
        if (!task) throw AppError.notFound("Delegation not found");

        const deletedAt = new Date();
        await db.update(tasks).set({ deletedAt, updatedAt: deletedAt }).where(eq(tasks.id, id));

        // Carries only the id — clients only need to know which card to drop from the board.
        emitTaskEvent('task:deleted', {
            userId: task.userId,
            assigneeId: task.assigneeId ?? null,
            departmentId: task.departmentId ?? null,
        }, { id: task.id });

        // `before` is the pre-delete row — same DELETE audit shape as when this was a hard delete,
        // even though the row itself now lives on with deletedAt set.
        await auditService.record({ entityType: "Task", entityId: id, action: "DELETE", actorId: user.sub, before: task });
        await dropTaskSummaries();

        return task;
    },

    // Symmetric with remove() above — clears deletedAt instead of setting it. Same visibility
    // condition and NOT_DELETED-flipped lookup remove() uses, so "can restore it" always matches
    // "could see it in the Archived list" in the first place.
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

    // Ported from a MongoDB aggregation pipeline (TaskChecklistItem -> TaskChecklist -> Task,
    // joined to TaskImage) to raw SQL, since the pipeline's conditional "qualifying photo count"
    // logic ($cond/$filter/$size) doesn't map onto Prisma-/Drizzle-style query builders cleanly.
    // Per time bucket: how many checklist items were done, and of those requiring a photo, how many
    // met their photo-evidence requirement (LIVE-only if requiresLivePhoto, otherwise any capture
    // method). Items of draft delegations and of soft-deleted ones never count. Buckets are the
    // org's local calendar (same offset the checklist engine uses), every bucket of the requested
    // window is present (zero-filled), groupBy 'none' = one bucket 'range', and no from/to means
    // the last 12 buckets (30 days for day) rather than all of history.
    async complianceReport(groupBy: ReportGroupBy, departmentId?: string, from?: string, to?: string, userId?: string, departmentIds?: string[]) {
        const range = resolveReportRange(groupBy, from, to);
        const conditions: SQL[] = [
            sql`tci.createdAt >= ${utcSql(range.from)}`,
            sql`tci.createdAt <= ${utcSql(range.to)}`,
        ];
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
        // Same population as ownerStats (taskOwnerStatsByColumn): top-level delegations only, never
        // issues or subtasks. A soft-deleted or draft delegation's checklist items must not count.
        conditions.push(sql`t.deletedAt IS NULL`, sql`t.status <> 'draft'`, sql`t.category = 'delegation'`, sql`t.parentTaskId IS NULL`);

        const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

        // db.execute() on the mysql2 driver resolves to the raw mysql2 result tuple
        // [rows, fields], NOT a plain row array — must destructure element 0.
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

    // Real GROUP BY aggregate for the admin "Delegations" rankings/leaderboard — replaces a
    // client-side reduce over `useTasksQuery()`'s newest-200-tasks-org-wide page, which silently
    // mis-scored (or zeroed out) any department/user whose tasks weren't among those 200, and
    // ignored the page's own date-range filter entirely. Mirrors ticket.service.ts#ownerStats.
    //
    // Totals are delegations created in the window (see taskOwnerStatsByColumn for what counts).
    // scope 'user' credits the ASSIGNEE only, in a single grouped query: a person is judged on work
    // handed to them, not on delegations they merely raised, and the old assignee + raiser +
    // self-assigned merge (three queries) is gone. `total` is the volume the client's
    // minimum-volume rule reads.
    async ownerStats(scope: "department" | "user" | "org", from?: string, to?: string, departmentId?: string, departmentIds?: string[]): Promise<TaskOwnerStatsRow[]> {
        const baseConditions: SQL[] = [];
        if (from) baseConditions.push(sql`t.createdAt >= ${utcSql(new Date(from))}`);
        if (to) baseConditions.push(sql`t.createdAt <= ${utcSql(new Date(to))}`);
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
        return taskOwnerStatsByColumn(sql`t.assigneeId`, [...baseConditions, sql`t.assigneeId IS NOT NULL`], true);
    },

    // Backs the sidebar's "Delegation" count badge and its hover breakdown — deliberately "mine"
    // (creator, assignee, or additional assignee, same reach as selfAndDepartmentCondition), not
    // buildVisibilityCondition's full reach, even for ADMIN/PC/MANAGER. Those roles already get an
    // org-wide view from the dashboard/admin pages; a personal nav badge that suddenly ballooned to
    // the whole org's count the moment someone had elevated access would stop meaning "what's on my
    // plate" and would also be a much heavier query running on literally every page load (the
    // sidebar renders on every route).
    //
    // Without `scope` this is exactly that badge (every category, subtasks included, so the sidebar
    // never changes). The dashboard passes a scope instead and gets numbers over real delegations
    // only (category 'delegation', no subtasks, no drafts), computed here rather than from a capped
    // list in the browser:
    //   mine    - assigned to me, as the assignee or an additional assignee
    //   visible - everything the caller's role can see (buildVisibilityCondition: ADMIN/PC the org,
    //             MANAGER their department, everyone else their own work)
    // `pending` is every open delegation (due + overdue); `overdue` is open work past its due date,
    // so a task waiting on a reviewer (pending_approval) is never overdue.
    async summary(user: AccessTokenPayload, scope?: TaskSummaryScope): Promise<TaskSummaryRow> {
        // Short TTL plus explicit invalidation from every mutation below (dropTaskSummaries). The TTL
        // covers what has no hook: bulk import, the clock passing a due date.
        return cached(cacheKey(TASK_SUMMARY_PREFIX, scope ?? "default", user.sub), SUMMARY_TTL_SECONDS, async () => {
            let where: SQL | undefined;
            if (!scope) {
                const additionalIds = await additionalAssigneeTaskIds(user.sub);
                const mineCondition = additionalIds.length
                    ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
                    : selfAndDepartmentCondition(user);
                where = and(NOT_DELETED, mineCondition);
            } else {
                // EXISTS, not an id list: the additional-assignee table only grows.
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
                completed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'done' THEN 1 ELSE 0 END)`,
                overdue: sql<number>`SUM(CASE WHEN ${tasks.status} NOT IN ('done', 'draft', 'pending_approval') AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < ${utcSql(new Date())} THEN 1 ELSE 0 END)`,
                newToday: sql<number>`SUM(CASE WHEN ${tasks.createdAt} >= ${utcSql(orgDayStartUtc())} THEN 1 ELSE 0 END)`,
            }).from(tasks).where(where);

            const total = Number(row?.total ?? 0);
            const draft = Number(row?.draft ?? 0);
            const completed = Number(row?.completed ?? 0);
            const overdue = Number(row?.overdue ?? 0);
            // Drafts are excluded from the badge's headline total — a private scratch item isn't
            // "on my plate" the way a published delegation is, same reasoning list() already
            // applies by hiding drafts from the default view.
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

    // "Needs your approval" dashboard card (ADMIN/PC only — gated at the route; both roles
    // already resolve to org-wide in buildVisibilityCondition, and any ADMIN/PC can verify any
    // pending_approval task per CAN_VERIFY_BY_ROLE above, so no per-task assignment to filter by).
    // Oldest-waiting-first — Task has no "entered pending_approval at" column (submittedAt exists
    // on the schema but nothing ever writes it), so this over-fetches a small pool by createdAt,
    // looks up each row's real transition time from TaskStatusUpdate, and re-sorts by that. Same
    // batch-fetch-then-map shape ticket.service.ts#pendingApproval uses, not a derived-table join.
    //
    // `meta.total` is the real number awaiting approval (COUNT over the same filter), because the
    // card shows at most `limit` rows and its badge used to count those rows instead.
    async pendingApproval(limit = 8): Promise<{ data: TaskPendingApprovalRow[]; meta: { total: number } }> {
        const POOL = 40;
        const pendingWhere = and(eq(tasks.status, "pending_approval"), NOT_DELETED);
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
            // Actually returned as a string by mysql2 for a raw aggregate like this (unlike a
            // plain schema column select, which goes through Drizzle's date-mode conversion) —
            // typed honestly here, matching ticket.service.ts#pendingApproval's own fix.
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
