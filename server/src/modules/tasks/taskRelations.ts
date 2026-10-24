import { db } from "../../config/db.js"
import { taskAdditionalAssignees, taskStatusUpdates, tags, taskTags, taskReviewers } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, inArray, asc, desc } from "drizzle-orm"

export const peopleByIds = async (ids: string[]) => {
    if (!ids.length) return new Map<string, { id: string; email: string; firstName: string; lastName: string | null; role: string }>();
    const rows = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(inArray(users.id, ids));
    return new Map(rows.map((r) => [r.id, r]));
};

export const approverNames = async (task: { hodApprovedBy: string | null; verifiedBy: string | null; assignmentApprovedBy?: string | null; declinedBy?: string | null }) => {
    const ids = [task.hodApprovedBy, task.verifiedBy, task.assignmentApprovedBy, task.declinedBy].filter((id): id is string => !!id);
    const byId = await peopleByIds([...new Set(ids)]);
    return {
        hodApprover: task.hodApprovedBy ? byId.get(task.hodApprovedBy) ?? null : null,
        verifier: task.verifiedBy ? byId.get(task.verifiedBy) ?? null : null,
        assignmentApprover: task.assignmentApprovedBy ? byId.get(task.assignmentApprovedBy) ?? null : null,
        decliner: task.declinedBy ? byId.get(task.declinedBy) ?? null : null,
    };
};

export const tagsByTask = async (taskIds: string[]) => {
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

export const syncTaskTags = async (
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

export const taskTagIds = async (taskId: string): Promise<string[]> =>
    (await db.select({ tagId: taskTags.tagId }).from(taskTags).where(eq(taskTags.taskId, taskId)))
        .map((r) => r.tagId).sort();

export const syncTaskReviewers = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    taskId: string,
    userIds: string[],
) => {
    await tx.delete(taskReviewers).where(eq(taskReviewers.taskId, taskId));
    if (!userIds.length) return;
    const unique = [...new Set(userIds)];
    await tx.insert(taskReviewers).values(unique.map((userId) => ({ taskId, userId })));
};

export const reviewersByTask = async (taskIds: string[]) => {
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

export const replaceAdditionalAssignees = async (
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

export const loadStatusUpdates = async (taskId: string) => {
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
