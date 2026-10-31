import { dropScoreCache } from "../scores/scoreCache.js"
import { db } from "../../config/db.js"
import { tasks, taskAdditionalAssignees, taskStatusUpdates } from "../../db/schema/index.js"
import { users } from "../../db/schema/core.js"
import { eq, and, or, inArray, asc, sql, isNull, ne, type SQL } from "drizzle-orm"
import { cached, cacheKey, bumpVersions, versionTag } from "../../config/queryCache.js"
import { orgDayStartUtc } from "../../utils/orgDay.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { resolveReportRange, bucketSql, utcSql, type ReportGroupBy } from "../checklistInstances/checklistReportRange.js"
import { selfAndDepartmentCondition, NOT_DELETED, additionalAssigneeTaskIds, buildVisibilityCondition, departmentApprovalInvolves, NOT_GATED } from "./taskAccess.js"
import { isDepartmentHeadRole } from "../../utils/roles.js"

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
    submittedById: string | null;
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

export const TASK_SUMMARY_PREFIX = "task-summary";
export const SUMMARY_TTL_SECONDS = 10;

export const TASK_SUMMARY_VERSION = `${TASK_SUMMARY_PREFIX}:all`;
export const dropTaskSummaries = async () => {
    await Promise.all([bumpVersions(TASK_SUMMARY_VERSION), dropScoreCache()]);
};

export const taskOwnerStatsByColumn = async (
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
        sql`t.awaitingHeadApproval = 0`,
        sql`t.declinedAt IS NULL`,
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

export const complianceReport = async (groupBy: ReportGroupBy, departmentId?: string, from?: string, to?: string, userId?: string, departmentIds?: string[]) => {
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
    conditions.push(sql`t.deletedAt IS NULL`, sql`t.status <> 'draft'`, sql`t.category = 'delegation'`, sql`t.parentTaskId IS NULL`, sql`t.awaitingHeadApproval = 0`, sql`t.declinedAt IS NULL`);
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
}

export const ownerStats = async (scope: "department" | "user" | "org", from?: string, to?: string, departmentId?: string, departmentIds?: string[]): Promise<TaskOwnerStatsRow[]> => {
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
}

export const summary = async (user: AccessTokenPayload, scope?: TaskSummaryScope): Promise<TaskSummaryRow> => {
    const version = await versionTag(TASK_SUMMARY_VERSION);
    return cached(cacheKey(TASK_SUMMARY_PREFIX, `v${version}`, scope ?? "default", user.sub), SUMMARY_TTL_SECONDS, async () => {
        let where: SQL | undefined;
        if (!scope) {
            const additionalIds = await additionalAssigneeTaskIds(user.sub);
            const mineCondition = additionalIds.length
                ? or(selfAndDepartmentCondition(user), inArray(tasks.id, additionalIds))
                : selfAndDepartmentCondition(user);
            where = and(NOT_DELETED, NOT_GATED, mineCondition);
        } else {
            const scopeCondition = scope === "mine"
                ? or(
                    eq(tasks.assigneeId, user.sub),
                    sql`EXISTS (SELECT 1 FROM ${taskAdditionalAssignees} ta WHERE ta.taskId = ${tasks.id} AND ta.userId = ${user.sub})`,
                )
                : isDepartmentHeadRole(user.role)
                    ? user.departmentId ? or(eq(tasks.departmentId, user.departmentId), departmentApprovalInvolves(user.departmentId)) : sql`1 = 0`
                    : await buildVisibilityCondition(user);
            where = and(
                NOT_DELETED,
                NOT_GATED,
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
}

export const pendingApproval = async (user: AccessTokenPayload, limit = 8): Promise<{ data: TaskPendingApprovalRow[]; meta: { total: number } }> => {
    const POOL = 200;
    const stageScope = user.role === "ADMIN"
        ? undefined
        : user.role === "PC"
            ? and(
                or(isNull(tasks.approvalStage), eq(tasks.approvalStage, "PC")),
                or(isNull(tasks.assigneeId), ne(tasks.assigneeId, user.sub)),
            )
            : and(
                eq(tasks.approvalStage, "HOD"),
                user.departmentId
                    ? or(
                        sql`EXISTS (SELECT 1 FROM TaskDepartmentApproval a WHERE a.taskId = ${tasks.id} AND a.departmentId = ${user.departmentId} AND a.completionStatus = 'pending')`,
                        and(
                            eq(tasks.departmentId, user.departmentId),
                            sql`NOT EXISTS (SELECT 1 FROM TaskDepartmentApproval a WHERE a.taskId = ${tasks.id} AND a.completionStatus <> 'none')`,
                        ),
                    )
                    : sql`1 = 0`,
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
        userId: tasks.userId,
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
            submittedById: r.userId,
            submittedBy: r.firstName ? `${r.firstName}${r.lastName ? ` ${r.lastName}` : ""}` : null,
            waitingSince: new Date(sinceById.get(r.id) ?? r.createdAt).toISOString(),
        }))
        .sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime())
        .slice(0, limit);
    return { data, meta: { total } };
}
