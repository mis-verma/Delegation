import { parse as parseCsv } from "csv-parse/sync"
import ExcelJS from "exceljs"
import { PDFParse } from "pdf-parse"
import { AppError } from "./AppError.js"

export type SheetRecord = Record<string, string>

const parseCsvRecords = (buffer: Buffer): SheetRecord[] =>
    parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true }) as SheetRecord[]

const parseXlsxRecords = async (buffer: Buffer): Promise<SheetRecord[]> => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return []

    const headers: string[] = []
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "").trim()
    })

    const records: SheetRecord[] = []
    for (let r = 2; r <= sheet.rowCount; r++) {
        const record: SheetRecord = {}
        sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber]
            if (header) record[header] = String(cell.value ?? "").trim()
        })
        records.push(record)
    }
    return records
}

const splitPdfLine = (line: string): string[] => {
    if (line.includes(",")) return line.split(",").map((s) => s.trim())
    if (line.includes("\t")) return line.split("\t").map((s) => s.trim())
    return line.split(/\s{2,}/).map((s) => s.trim())
}

const recordsFromHeaderedLines = (headerCells: string[], dataRows: string[][]): SheetRecord[] =>
    dataRows.map((cells) => {
        const record: SheetRecord = {}
        headerCells.forEach((h, idx) => { record[h] = cells[idx] ?? "" })
        return record
    })

const parsePdfRecords = async (buffer: Buffer): Promise<{ records: SheetRecord[]; warnings: string[] }> => {
    const warnings = ["PDF parsing is best-effort — double-check the rows below, or re-upload as CSV/Excel for reliable results."]
    const parser = new PDFParse({ data: buffer })
    try {
        const tableResult = await parser.getTable()
        const table = tableResult.pages?.[0]?.tables?.[0]
        if (table && table.length >= 2) {
            const [headerCells = [], ...dataCells] = table as string[][]
            const records = recordsFromHeaderedLines(headerCells.map((c) => String(c ?? "").trim()), dataCells)
            if (records.length) return { records, warnings }
        }

        const textResult = await parser.getText()
        const lines = textResult.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        if (!lines.length) return { records: [], warnings: [...warnings, "No readable text found in this PDF."] }

        const [headerLine = "", ...dataLines] = lines
        const records = recordsFromHeaderedLines(splitPdfLine(headerLine), dataLines.map(splitPdfLine))
        return { records, warnings }
    } finally {
        await parser.destroy()
    }
}

export const parseSheetRecords = async (buffer: Buffer, mimetype: string): Promise<{ records: SheetRecord[]; warnings: string[] }> => {
    if (mimetype === "text/csv" || mimetype === "application/vnd.ms-excel") {
        return { records: parseCsvRecords(buffer), warnings: [] }
    }
    if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        return { records: await parseXlsxRecords(buffer), warnings: [] }
    }
    if (mimetype === "application/pdf") {
        return parsePdfRecords(buffer)
    }
    throw AppError.unprocessable("Unsupported file type — upload a CSV, Excel (.xlsx), or PDF file.")
}
