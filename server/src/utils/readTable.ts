import ExcelJS from "exceljs"
import { parse as parseCsv } from "csv-parse/sync"
import { AppError } from "./AppError.js"

const cellText = (value: ExcelJS.CellValue): string => {
    if (value === null || value === undefined) return ""
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (typeof value === "object") {
        const v = value as { text?: unknown; richText?: { text: string }[]; result?: unknown }
        if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("")
        if (v.result !== undefined) return cellText(v.result as ExcelJS.CellValue)
        if (typeof v.text === "string") return v.text
        return ""
    }
    return String(value)
}

const readXlsx = async (buffer: Buffer): Promise<Record<string, string>[]> => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return []
    const headers: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = cellText(cell.value).trim() })
    const rows: Record<string, string>[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
        const record: Record<string, string> = {}
        sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
            const header = headers[col]
            if (header) record[header] = cellText(cell.value).trim()
        })
        if (Object.values(record).some((v) => v)) rows.push(record)
    }
    return rows
}

export const readTable = async (buffer: Buffer, mimetype: string): Promise<Record<string, string>[]> => {
    const startsWith = (a: number, b: number) => buffer.length > 3 && buffer[0] === a && buffer[1] === b
    if (startsWith(0xd0, 0xcf)) {
        throw AppError.unprocessable("That is an old Excel (.xls) file. Open it, choose Save As, and pick Excel Workbook (.xlsx) or CSV.")
    }
    if (startsWith(0x50, 0x4b)) return readXlsx(buffer)
    if (["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"].includes(mimetype)) {
        return parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }) as Record<string, string>[]
    }
    throw AppError.unprocessable("That file type isn't supported. Upload a CSV or Excel (.xlsx) file.")
}
