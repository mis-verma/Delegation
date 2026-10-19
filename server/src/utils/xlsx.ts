import ExcelJS from "exceljs";
import type { CsvColumn } from "./csv.js";
import type { Response } from "express";

export const streamXlsx = async (
    res : Response,
    rows : AsyncIterable<Record<string,unknown>>,
    columns : CsvColumn[],
    sheetName = "Report",
) : Promise<void> => {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream : res})
    const sheet = workbook.addWorksheet(sheetName)

    sheet.columns = columns.map((c) => ({ header : c.label , key : c.key , width : Math.max(c.label.length + 4, 14)}))
    sheet.getRow(1).font = { bold : true};
    sheet.getRow(1).commit();

    for await (const row of rows ) {
        sheet.addRow(row).commit()
    }

    sheet.commit();
    await workbook.commit();
}