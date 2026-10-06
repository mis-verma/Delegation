import { type Request, type Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { reportExportQuerySchema, approvalTatQuerySchema } from "./report.validation.js";
import { approvalTatService } from "./approvalTat.service.js";
import { REPORT_ROW_STREAMS, REPORT_COLUMNS, type ReportModule } from "./report.service.js";
import { CsvColumn, streamCsv } from "../../utils/csv.js";
import { streamXlsx } from "../../utils/xlsx.js";


const CONTENT_TYPES: Record<"csv" | "xlsx", string> = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

type ExportHandler = (
    res: Response,
    rows: AsyncIterable<Record<string, unknown>>,
    columns: CsvColumn[],
    sheetName?: string
) => Promise<void>;

const exporters: Record<"csv" | "xlsx", ExportHandler> = {
    xlsx: streamXlsx,
    csv: streamCsv,
};

const exportHandler = (reportModule: ReportModule) =>
    asyncHandler(async (req: Request, res: Response) => {
        const { from, to, format, category, status, priority, departmentId, assigneeIds, storeId } =
            reportExportQuerySchema.parse(req.query);
        const rows = REPORT_ROW_STREAMS[reportModule](from, to, {
            category,
            status,
            priority: priority?.split(",").filter(Boolean),
            departmentId,
            assigneeIds: assigneeIds?.split(",").filter(Boolean),
            storeId,
        });
        const columns = REPORT_COLUMNS[reportModule];
        const datePart = new Date().toISOString().slice(0, 10);
        const filename = `${reportModule}-export-${datePart}.${format}`;
        res.setHeader("Content-Type", CONTENT_TYPES[format]);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        const exporter = exporters[format];
        await exporter(res, rows, columns, reportModule);
    });

export const reportController = {
    approvalTat: asyncHandler(async (req: Request, res: Response) => {
        const { from, to } = approvalTatQuerySchema.parse(req.query);
        const data = await approvalTatService.summary(new Date(from), new Date(to));
        res.json({ success: true, data });
    }),
    exportTickets: exportHandler("tickets"),
    exportTasks: exportHandler("tasks"),
    exportChecklists: exportHandler("checklists"),
};