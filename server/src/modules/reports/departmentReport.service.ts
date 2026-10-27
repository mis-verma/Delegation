import { and, desc, eq, sql, or, max, min, type SQL } from "drizzle-orm";
import { db } from "../../config/db.js";
import { env } from "../../config/env.js";
import { departments } from "../../db/schema/core.js";
import { tickets } from "../../db/schema/ticket.js";
import { tasks } from "../../db/schema/task.js";
import { taskWhere, ticketWhere, type TaskExportFilters } from "./report.service.js";
import {
    createAggregator,
    resolveGranularity,
    type DepartmentReport,
    type DepartmentReportModule,
    type ReportGranularity,
    type ReportItem,
    type StatusKey,
} from "./departmentReport.js";

const PAGE_SIZE = 2000;
const DAY_MS = 86_400_000;

const TICKET_STATUS: Record<string, StatusKey> = {
    OPEN: "open",
    IN_PROGRESS: "in_progress",
    PENDING_APPROVAL: "pending_approval",
    ON_HOLD: "on_hold",
    CLOSED: "done",
};

const TASK_STATUS: Record<string, StatusKey> = {
    todo: "open",
    in_progress: "in_progress",
    pending_approval: "pending_approval",
    on_hold: "on_hold",
    done: "done",
};

type CursorBounds = { createdAt: Date; id: string };

async function* ticketItems(where: SQL | undefined, now: Date): AsyncGenerator<ReportItem> {
    let cursor = null as CursorBounds | null;
    for (; ;) {
        const active = cursor;
        const page = await db
            .select({
                id: tickets.id,
                departmentId: tickets.departmentId,
                status: tickets.status,
                createdAt: tickets.createdAt,
                updatedAt: tickets.updatedAt,
                closedAt: tickets.closedAt,
                submittedAt: tickets.submittedAt,
                tatDueAt: tickets.tatDueAt,
                isOverdue: tickets.isOverdue,
            })
            .from(tickets)
            .where(and(
                where,
                active ? or(
                    sql`${tickets.createdAt} < ${active.createdAt}`,
                    and(eq(tickets.createdAt, active.createdAt), sql`${tickets.id} < ${active.id}`),
                ) : undefined,
            ))
            .orderBy(desc(tickets.createdAt), desc(tickets.id))
            .limit(PAGE_SIZE);

        for (const t of page) {
            const done = t.status === "CLOSED";
            yield {
                departmentId: t.departmentId,
                status: TICKET_STATUS[t.status] ?? "open",
                createdAt: t.createdAt,
                dueAt: t.tatDueAt,
                handedInAt: t.submittedAt,
                completedAt: done ? (t.closedAt ?? t.updatedAt) : null,
                overdue: t.isOverdue || (!done && !!t.tatDueAt && t.tatDueAt.getTime() < now.getTime()),
            };
        }

        const last = page.at(-1);
        if (!last || page.length < PAGE_SIZE) return;
        cursor = { createdAt: last.createdAt, id: last.id };
    }
}

async function* taskItems(where: SQL | undefined, now: Date): AsyncGenerator<ReportItem> {
    let cursor = null as CursorBounds | null;
    for (; ;) {
        const active = cursor;
        const page = await db
            .select({
                id: tasks.id,
                departmentId: tasks.departmentId,
                status: tasks.status,
                createdAt: tasks.createdAt,
                updatedAt: tasks.updatedAt,
                dueDate: tasks.dueDate,
                submittedAt: tasks.submittedAt,
                verifiedAt: tasks.verifiedAt,
            })
            .from(tasks)
            .where(and(
                where,
                active ? or(
                    sql`${tasks.createdAt} < ${active.createdAt}`,
                    and(eq(tasks.createdAt, active.createdAt), sql`${tasks.id} < ${active.id}`),
                ) : undefined,
            ))
            .orderBy(desc(tasks.createdAt), desc(tasks.id))
            .limit(PAGE_SIZE);

        for (const t of page) {
            const done = t.status === "done";
            yield {
                departmentId: t.departmentId,
                status: TASK_STATUS[t.status] ?? "open",
                createdAt: t.createdAt,
                dueAt: t.dueDate,
                handedInAt: t.submittedAt,
                completedAt: done ? (t.verifiedAt ?? t.submittedAt ?? t.updatedAt) : null,
                overdue: !done && !!t.dueDate && t.dueDate.getTime() < now.getTime(),
            };
        }

        const last = page.at(-1);
        if (!last || page.length < PAGE_SIZE) return;
        cursor = { createdAt: last.createdAt, id: last.id };
    }
}

const spanDays = async (module: DepartmentReportModule, where: SQL | undefined, from?: string, to?: string): Promise<number> => {
    if (from && to) return Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
    const table = module === "tickets" ? tickets : tasks;
    const [bounds] = await db
        .select({ first: min(table.createdAt), last: max(table.createdAt) })
        .from(table)
        .where(where);
    const first = from ? new Date(from) : bounds?.first ? new Date(bounds.first) : null;
    const last = to ? new Date(to) : bounds?.last ? new Date(bounds.last) : null;
    if (!first || !last) return 1;
    return Math.max(1, (last.getTime() - first.getTime()) / DAY_MS);
};

export type DepartmentReportOptions = {
    from?: string;
    to?: string;
    granularity: ReportGranularity | "auto";
    filters: TaskExportFilters;
};

export const departmentReportService = {
    async build(module: DepartmentReportModule, { from, to, granularity, filters }: DepartmentReportOptions): Promise<DepartmentReport> {
        const where = module === "tickets" ? ticketWhere(from, to, filters) : taskWhere(from, to, filters);
        const resolved = resolveGranularity(granularity, await spanDays(module, where, from, to));
        const aggregator = createAggregator(resolved, env.CHECKLIST_TIMEZONE_OFFSET_MINUTES);

        const now = new Date();
        const items = module === "tickets" ? ticketItems(where, now) : taskItems(where, now);
        for await (const item of items) aggregator.add(item);

        const departmentRows = await db
            .select({ id: departments.id, name: departments.name, isActive: departments.isActive })
            .from(departments);

        return aggregator.finish(departmentRows, filters.departmentId);
    },
};
