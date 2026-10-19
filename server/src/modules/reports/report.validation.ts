import { z } from "zod";

export const reportExportQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    format: z.enum(["csv", "xlsx"]).default("csv"),
    category: z.enum(["issue", "delegation", "task"]).optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    departmentId: z.string().optional(),
    assigneeIds: z.string().optional(),
    storeId: z.string().optional(),
});

export const approvalTatQuerySchema = z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
});

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
