import ExcelJS from "exceljs";
import type { CsvColumn } from "./csv.js";
import type { Response } from "express";

type SheetRows = AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>;

export type WorkbookSheet = { name: string; columns: CsvColumn[]; rows: SheetRows };

export const streamWorkbook = async (res: Response, sheets: WorkbookSheet[]): Promise<void> => {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });

    for (const { name, columns, rows } of sheets) {
        const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
        sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? Math.max(c.label.length + 4, 14) }));
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).commit();

        for await (const row of rows) {
            sheet.addRow(row).commit();
        }

        sheet.commit();
    }

    await workbook.commit();
};

export const streamXlsx = (
    res: Response,
    rows: SheetRows,
    columns: CsvColumn[],
    sheetName = "Report",
): Promise<void> => streamWorkbook(res, [{ name: sheetName, columns, rows }]);
