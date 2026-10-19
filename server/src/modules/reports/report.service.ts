import { db } from "../../config/db.js";
import { tickets } from "../../db/schema/ticket.js";
import { tasks, taskAdditionalAssignees } from "../../db/schema/task.js";
import { checklistInstances, checklistInstanceAssignees, checklistInstanceItems } from "../../db/schema/checklistInstance.js";
import { users, departments, stores } from "../../db/schema/core.js";
import { and, gte, lte, eq, or, inArray, isNull, isNotNull, desc, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { CsvColumn } from "../../utils/csv.js";

export type ReportModule = "tickets" | "tasks" | "checklists";

const PAGE_SIZE = 500;

export type TaskExportFilters = {
    category?: "issue" | "delegation" | "task";
    status?: string;
    priority?: string[];
    departmentId?: string;
    assigneeIds?: string[];
    storeId?: string;
};

const fullName = (person: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
    person ? `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() : "";

const isoOrEmpty = (value: unknown) => (value ? new Date(value as string | Date).toISOString() : "");

export const TICKET_COLUMNS: CsvColumn[] = [
    { key: "id", label: "Ticket ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "department", label: "Department" },
    { key: "assignee", label: "Assignee" },
    { key: "raisedBy", label: "Raised By" },
    { key: "createdAt", label: "Created At" },
    { key: "closedAt", label: "Closed At" },
    { key: "tatHours", label: "TAT (hrs)" },
    { key: "isOverdue", label: "Overdue" },
];

export const TASK_COLUMNS: CsvColumn[] = [
    { key: "id", label: "Delegation ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "department", label: "Department" },
    { key: "assignee", label: "Assignee" },
    { key: "raisedBy", label: "Raised By" },
    { key: "dueDate", label: "Due Date" },
    { key: "createdAt", label: "Created At" },
];

export const CHECKLIST_COLUMNS: CsvColumn[] = [
    { key: "id", label: "Instance ID" },
    { key: "title", label: "Checklist" },
    { key: "recurrence", label: "Recurrence" },
    { key: "store", label: "Store" },
    { key: "assignees", label: "Assignees" },
    { key: "periodStart", label: "Period Start" },
    { key: "periodEnd", label: "Period End" },
    { key: "itemsDone", label: "Items Done" },
    { key: "itemsTotal", label: "Items Total" },
    { key: "isCompleted", label: "Completed" },
];

export const REPORT_COLUMNS: Record<ReportModule, CsvColumn[]> = {
    tickets: TICKET_COLUMNS,
    tasks: TASK_COLUMNS,
    checklists: CHECKLIST_COLUMNS,
};

const assigneeUsers = alias(users, "assigneeUsers");
const raisedByUsers = alias(users, "raisedByUsers");

type TicketReportRow = {
    id: string; title: string; status: string; priority: string;
    createdAt: Date; closedAt: Date | null; tatHours: number | null; isOverdue: boolean;
    departmentName: string | null;
    assigneeFirstName: string | null; assigneeLastName: string | null;
    raisedByFirstName: string | null; raisedByLastName: string | null;
};
type TaskReportRow = {
    id: string; title: string; status: string; priority: string;
    dueDate: Date | null; createdAt: Date; departmentName: string | null;
    assigneeFirstName: string | null; assigneeLastName: string | null;
    raisedByFirstName: string | null; raisedByLastName: string | null;
};
type ChecklistReportRow = {
    id: string; title: string; recurrence: string;
    periodStart: Date; periodEnd: Date; storeName: string | null;
};

export const reportService = {
    async *ticketRows(from?: string, to?: string, _extra?: TaskExportFilters): AsyncGenerator<Record<string, unknown>> {
        const where = and(
            isNull(tickets.deletedAt),
            from ? gte(tickets.createdAt, new Date(from)) : undefined,
            to ? lte(tickets.createdAt, new Date(to)) : undefined,
        );

        let cursor: { createdAt: Date; id: string } | null = null;
        for (; ;) {
            const activeCursor = cursor;
            const cursorCondition = activeCursor ? or(
                sql`${tickets.createdAt} < ${activeCursor.createdAt}`,
                and(eq(tickets.createdAt, activeCursor.createdAt), sql`${tickets.id} > ${activeCursor.id}`),
            ) : undefined;
            const page: TicketReportRow[] = await db
                .select({
                    id: tickets.id,
                    title: tickets.title,
                    status: tickets.status,
                    priority: tickets.priority,
                    createdAt: tickets.createdAt,
                    closedAt: tickets.closedAt,
                    tatHours: tickets.tatHours,
                    isOverdue: tickets.isOverdue,
                    departmentName: departments.name,
                    assigneeFirstName: assigneeUsers.firstName,
                    assigneeLastName: assigneeUsers.lastName,
                    raisedByFirstName: raisedByUsers.firstName,
                    raisedByLastName: raisedByUsers.lastName,
                })
                .from(tickets)
                .leftJoin(departments, eq(departments.id, tickets.departmentId))
                .leftJoin(assigneeUsers, eq(assigneeUsers.id, tickets.assigneeId))
                .leftJoin(raisedByUsers, eq(raisedByUsers.id, tickets.userId))
                .where(and(where, cursorCondition))
                .orderBy(desc(tickets.createdAt), asc(tickets.id))
                .limit(PAGE_SIZE);

            if (page.length === 0) break;

            for (const t of page) {
                yield {
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    department: t.departmentName ?? "",
                    assignee: fullName({ firstName: t.assigneeFirstName, lastName: t.assigneeLastName }),
                    raisedBy: fullName({ firstName: t.raisedByFirstName, lastName: t.raisedByLastName }),
                    createdAt: isoOrEmpty(t.createdAt),
                    closedAt: isoOrEmpty(t.closedAt),
                    tatHours: t.tatHours ?? "",
                    isOverdue: t.isOverdue ? "Yes" : "No",
                };
            }

            const last = page[page.length - 1];
            cursor = { createdAt: last.createdAt, id: last.id };
            if (page.length < PAGE_SIZE) break;
        }
    },

    async *taskRows(from?: string, to?: string, extra?: TaskExportFilters): AsyncGenerator<Record<string, unknown>> {
        const conditions = [
            isNull(tasks.deletedAt),
            from ? gte(tasks.createdAt, new Date(from)) : undefined,
            to ? lte(tasks.createdAt, new Date(to)) : undefined,
        ];

        if (extra?.category === "issue") {
            conditions.push(eq(tasks.category, "issue"));
        } else if (extra?.category === "delegation") {
            conditions.push(eq(tasks.category, "delegation"), isNotNull(tasks.aiMeta));
        } else if (extra?.category === "task") {
            conditions.push(eq(tasks.category, "delegation"), isNull(tasks.aiMeta));
        }
        if (extra?.status) conditions.push(eq(tasks.status, extra.status as (typeof tasks.status.enumValues)[number]));
        if (extra?.priority?.length) conditions.push(inArray(tasks.priority, extra.priority as (typeof tasks.priority.enumValues)[number][]));
        if (extra?.departmentId) conditions.push(eq(tasks.departmentId, extra.departmentId));

        if (extra?.assigneeIds?.length) {
            conditions.push(or(
                inArray(tasks.assigneeId, extra.assigneeIds),
                inArray(
                    tasks.id,
                    db.select({ taskId: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees)
                        .where(inArray(taskAdditionalAssignees.userId, extra.assigneeIds)),
                ),
            )!);
        }

        const where = and(...conditions);

        let cursor: { createdAt: Date; id: string } | null = null;
        for (; ;) {
            const page: TaskReportRow[] = await db
                .select({
                    id: tasks.id,
                    title: tasks.title,
                    status: tasks.status,
                    priority: tasks.priority,
                    dueDate: tasks.dueDate,
                    createdAt: tasks.createdAt,
                    departmentName: departments.name,
                    assigneeFirstName: assigneeUsers.firstName,
                    assigneeLastName: assigneeUsers.lastName,
                    raisedByFirstName: raisedByUsers.firstName,
                    raisedByLastName: raisedByUsers.lastName,
                })
                .from(tasks)
                .leftJoin(departments, eq(departments.id, tasks.departmentId))
                .leftJoin(assigneeUsers, eq(assigneeUsers.id, tasks.assigneeId))
                .leftJoin(raisedByUsers, eq(raisedByUsers.id, tasks.userId))
                .where(and(
                    where,
                    cursor ? or(
                        sql`${tasks.createdAt} < ${cursor.createdAt}`,
                        and(eq(tasks.createdAt, cursor.createdAt), sql`${tasks.id} > ${cursor.id}`),
                    ) : undefined,
                ))
                .orderBy(desc(tasks.createdAt), asc(tasks.id))
                .limit(PAGE_SIZE);

            if (page.length === 0) break;

            const pageIds = page.map((t) => t.id);
            const extras = pageIds.length
                ? await db.select({
                    taskId: taskAdditionalAssignees.taskId,
                    firstName: users.firstName,
                    lastName: users.lastName,
                }).from(taskAdditionalAssignees)
                    .innerJoin(users, eq(users.id, taskAdditionalAssignees.userId))
                    .where(inArray(taskAdditionalAssignees.taskId, pageIds))
                : [];
            const extrasByTask = new Map<string, string[]>();
            for (const e of extras) {
                const list = extrasByTask.get(e.taskId) ?? [];
                list.push(fullName(e));
                extrasByTask.set(e.taskId, list);
            }

            for (const t of page) {
                const assigneeNames = [
                    fullName({ firstName: t.assigneeFirstName, lastName: t.assigneeLastName }),
                    ...(extrasByTask.get(t.id) ?? []),
                ].filter(Boolean);

                yield {
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    department: t.departmentName ?? "",
                    assignee: assigneeNames.join(", "),
                    raisedBy: fullName({ firstName: t.raisedByFirstName, lastName: t.raisedByLastName }),
                    dueDate: isoOrEmpty(t.dueDate),
                    createdAt: isoOrEmpty(t.createdAt),
                };
            }

            const last = page[page.length - 1];
            cursor = { createdAt: last.createdAt, id: last.id };
            if (page.length < PAGE_SIZE) break;
        }
    },

    async *checklistRows(from?: string, to?: string, extra?: TaskExportFilters): AsyncGenerator<Record<string, unknown>> {
        const conditions = [
            from ? gte(checklistInstances.periodStart, new Date(from)) : undefined,
            to ? lte(checklistInstances.periodStart, new Date(to)) : undefined,
            extra?.storeId ? eq(checklistInstances.storeId, extra.storeId) : undefined,
        ];

        if (extra?.assigneeIds?.length) {
            conditions.push(inArray(
                checklistInstances.id,
                db.select({ instanceId: checklistInstanceAssignees.instanceId })
                    .from(checklistInstanceAssignees)
                    .where(inArray(checklistInstanceAssignees.userId, extra.assigneeIds)),
            ));
        }

        const where = and(...conditions);

        let cursor: { periodStart: Date; id: string } | null = null;
        for (; ;) {
            const page: ChecklistReportRow[] = await db
                .select({
                    id: checklistInstances.id,
                    title: checklistInstances.title,
                    recurrence: checklistInstances.recurrence,
                    periodStart: checklistInstances.periodStart,
                    periodEnd: checklistInstances.periodEnd,
                    storeName: stores.name,
                })
                .from(checklistInstances)
                .leftJoin(stores, eq(stores.id, checklistInstances.storeId))
                .where(and(
                    where,
                    cursor ? or(
                        sql`${checklistInstances.periodStart} < ${cursor.periodStart}`,
                        and(eq(checklistInstances.periodStart, cursor.periodStart), sql`${checklistInstances.id} > ${cursor.id}`),
                    ) : undefined,
                ))
                .orderBy(desc(checklistInstances.periodStart), asc(checklistInstances.id))
                .limit(PAGE_SIZE);

            if (page.length === 0) break;

            const pageIds = page.map((i) => i.id);

            const assigneeRows = pageIds.length
                ? await db.select({
                    instanceId: checklistInstanceAssignees.instanceId,
                    firstName: users.firstName,
                    lastName: users.lastName,
                }).from(checklistInstanceAssignees)
                    .innerJoin(users, eq(users.id, checklistInstanceAssignees.userId))
                    .where(inArray(checklistInstanceAssignees.instanceId, pageIds))
                : [];
            const assigneesByInstance = new Map<string, string[]>();
            for (const a of assigneeRows) {
                const list = assigneesByInstance.get(a.instanceId) ?? [];
                list.push(fullName(a));
                assigneesByInstance.set(a.instanceId, list);
            }

            const itemStats = pageIds.length
                ? await db.select({
                    instanceId: checklistInstanceItems.instanceId,
                    total: sql<number>`COUNT(*)`,
                    done: sql<number>`SUM(${checklistInstanceItems.isDone})`,
                }).from(checklistInstanceItems)
                    .where(inArray(checklistInstanceItems.instanceId, pageIds))
                    .groupBy(checklistInstanceItems.instanceId)
                : [];
            const statsByInstance = new Map(itemStats.map((s) => [s.instanceId, { total: Number(s.total), done: Number(s.done) }]));

            for (const inst of page) {
                const stats = statsByInstance.get(inst.id) ?? { total: 0, done: 0 };
                yield {
                    id: inst.id,
                    title: inst.title,
                    recurrence: inst.recurrence,
                    store: inst.storeName ?? "",
                    assignees: (assigneesByInstance.get(inst.id) ?? []).join(", "),
                    periodStart: isoOrEmpty(inst.periodStart),
                    periodEnd: isoOrEmpty(inst.periodEnd),
                    itemsDone: stats.done,
                    itemsTotal: stats.total,
                    isCompleted: stats.total > 0 && stats.done === stats.total ? "Yes" : "No",
                };
            }

            const last = page[page.length - 1];
            cursor = { periodStart: last.periodStart, id: last.id };
            if (page.length < PAGE_SIZE) break;
        }
    },

};

export const REPORT_ROW_STREAMS: Record<ReportModule, (from?: string, to?: string, extra?: TaskExportFilters) => AsyncGenerator<Record<string, unknown>>> = {
    tickets: reportService.ticketRows,
    tasks: reportService.taskRows,
    checklists: reportService.checklistRows,

}
