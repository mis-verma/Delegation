import { type Request, type Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { reportExportQuerySchema, departmentReportQuerySchema, approvalTatQuerySchema, overdueSnapshotQuerySchema } from "./report.validation.js";
import { overdueSnapshotService } from "./overdueSnapshot.service.js";
import { approvalTatService } from "./approvalTat.service.js";
import { REPORT_ROW_STREAMS, REPORT_COLUMNS, type ReportModule } from "./report.service.js";
import { streamCsv, type CsvColumn } from "../../utils/csv.js";
import { streamXlsx, streamWorkbook } from "../../utils/xlsx.js";
import { streamPdf, formatPdfDay, PDF_MAX_ROWS, type PdfSection } from "../../utils/pdf.js";
import { env } from "../../config/env.js";
import { departmentReportService } from "./departmentReport.service.js";
import { summaryColumns, periodColumns } from "./departmentReport.js";


const CONTENT_TYPES = {
    csv: "text/csv; charset=utf-8",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
} as const;

const REPORT_TITLES: Record<ReportModule, string> = {
    tickets: "Tickets",
    tasks: "Delegations",
    checklists: "Checklists",
};

const rangeText = (from?: string, to?: string) => {
    const offset = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES;
    if (from && to) return `${formatPdfDay(from, offset)} to ${formatPdfDay(to, offset)}`;
    if (from) return `From ${formatPdfDay(from, offset)}`;
    if (to) return `Until ${formatPdfDay(to, offset)}`;
    return "All time";
};

const generatedText = () => `Generated ${formatPdfDay(new Date(), env.CHECKLIST_TIMEZONE_OFFSET_MINUTES)}`;

type ExportHandler = (
    res: Response,
    rows: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
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
        if (format === "pdf") {
            await streamPdf(res, {
                title: `${REPORT_TITLES[reportModule]} report`,
                subtitle: `${rangeText(from, to)}  |  ${generatedText()}`,
                offsetMinutes: env.CHECKLIST_TIMEZONE_OFFSET_MINUTES,
                sections: [{ columns, rows, maxRows: PDF_MAX_ROWS }],
            });
            return;
        }
        await exporters[format](res, rows, columns, reportModule);
    });

const DEPARTMENT_REPORT_LABEL: Record<"tickets" | "tasks", string> = { tickets: "tickets", tasks: "delegations" };

const departmentExportHandler = asyncHandler(async (req: Request, res: Response) => {
    const { module, from, to, format, content, granularity, category, status, priority, departmentId, assigneeIds, storeId } =
        departmentReportQuerySchema.parse(req.query);
    const filters = {
        category,
        status,
        priority: priority?.split(",").filter(Boolean),
        departmentId,
        assigneeIds: assigneeIds?.split(",").filter(Boolean),
        storeId,
    };
    const report = await departmentReportService.build(module, { from, to, granularity, filters });
    const label = DEPARTMENT_REPORT_LABEL[module];
    const details = () => REPORT_ROW_STREAMS[module](from, to, filters);
    const datePart = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
        const sections: PdfSection[] =
            content === "details"
                ? [{ heading: "All records", columns: REPORT_COLUMNS[module], rows: details(), maxRows: PDF_MAX_ROWS }]
                : content === "periods"
                    ? [{ heading: "By period", columns: periodColumns, rows: report.periods }]
                    : [
                        { heading: "Summary by department", columns: summaryColumns(module), rows: report.summary },
                        { heading: "By period", columns: periodColumns, rows: report.periods },
                    ];
        const scope = departmentId ? (report.summary[0]?.department ?? "One department") : "All departments";
        res.setHeader("Content-Type", CONTENT_TYPES.pdf);
        res.setHeader("Content-Disposition", `attachment; filename="${label}-by-department-${datePart}.pdf"`);
        await streamPdf(res, {
            title: `${REPORT_TITLES[module]} by department`,
            subtitle: `${scope}  |  ${rangeText(from, to)}  |  Grouped by ${report.granularity}  |  ${generatedText()}`,
            offsetMinutes: env.CHECKLIST_TIMEZONE_OFFSET_MINUTES,
            sections,
        });
        return;
    }

    if (format === "xlsx") {
        res.setHeader("Content-Type", CONTENT_TYPES.xlsx);
        res.setHeader("Content-Disposition", `attachment; filename="${label}-by-department-${datePart}.xlsx"`);
        await streamWorkbook(res, [
            { name: "Summary", columns: summaryColumns(module), rows: report.summary },
            { name: "By period", columns: periodColumns, rows: report.periods },
            { name: "Details", columns: REPORT_COLUMNS[module], rows: details() },
        ]);
        return;
    }

    const part = content === "details" ? "details" : content === "periods" ? "by-period" : "summary";
    res.setHeader("Content-Type", CONTENT_TYPES.csv);
    res.setHeader("Content-Disposition", `attachment; filename="${label}-${part}-${datePart}.csv"`);
    if (content === "details") return streamCsv(res, details(), REPORT_COLUMNS[module]);
    if (content === "periods") return streamCsv(res, report.periods, periodColumns);
    return streamCsv(res, report.summary, summaryColumns(module));
});

export const reportController = {
    approvalTat: asyncHandler(async (req: Request, res: Response) => {
        const { from, to } = approvalTatQuerySchema.parse(req.query);
        const data = await approvalTatService.summary(new Date(from), new Date(to));
        res.json({ success: true, data });
    }),
    overdueSnapshot: asyncHandler(async (req: Request, res: Response) => {
        const { day } = overdueSnapshotQuerySchema.parse(req.query);
        const data = await overdueSnapshotService.before(day);
        res.json({ success: true, data });
    }),
    exportTickets: exportHandler("tickets"),
    exportTasks: exportHandler("tasks"),
    exportChecklists: exportHandler("checklists"),
    exportDepartmentReport: departmentExportHandler,
};