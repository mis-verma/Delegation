import { z } from "zod";

// Same from/to convention as ticket.validation.ts's tatReportQuerySchema — plain optional ISO-ish
// date strings, parsed with `new Date(...)` in the service. The client computes the actual
// daily/weekly/monthly/quarterly/yearly range and sends it as from/to; the server just filters.
// category/status/priority/assigneeIds only apply to the "tasks" module report (they mirror
// TaskList's own filter bar) — tickets/checklists exports just ignore them if ever sent.
export const reportExportQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    format: z.enum(["csv", "xlsx"]).default("csv"),
    category: z.enum(["issue", "delegation", "task"]).optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    departmentId: z.string().optional(),
    assigneeIds: z.string().optional(),
    // Checklists-only: scope the export to one store and/or one or more assignees, same
    // convention as the compliance board's own store/person filters.
    storeId: z.string().optional(),
});

// Window on the hand-in time. Required: the dashboard always asks for its own period.
export const approvalTatQuerySchema = z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
});

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
