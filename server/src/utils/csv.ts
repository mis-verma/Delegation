import type { Response } from "express";
export type CsvColumn = { key: string; label: string };

// Minimal RFC-4180-ish CSV encoder — no external dependency needed for something this small.
// Quotes any value containing a comma, quote, or newline, doubling embedded quotes.
const escapeCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let str = String(value);
    // CSV/formula injection: a value starting with =, +, -, or @ is interpreted as a live formula
    // the moment Excel/Sheets opens the file — task/ticket titles are fully user-typed, so this
    // isn't hypothetical. Prefixing with an apostrophe forces it to be read as plain text instead.
    if (/^[=+\-@]/.test(str)) str = `'${str}`;
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// export const toCsv = (rows: Record<string, unknown>[], columns: CsvColumn[]): string => {
//     const header = columns.map((c) => escapeCsvValue(c.label)).join(",");
//     const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(","));
//     return [header, ...lines].join("\r\n");
// };


export const streamCsv = async (
    res: Response,
    rows: AsyncIterable<Record<string, unknown>>,
    columns: CsvColumn[],
): Promise<void> => {
    // UTF-8 byte-order mark first: without it Excel reads the file as ANSI and mangles Hindi (and any
    // other non-ASCII) names. Spreadsheet apps and parsers treat the BOM as invisible.
    res.write("﻿");
    res.write(columns.map((c) => escapeCsvValue(c.label)).join(",") + "\r\n");
    for await (const row of rows) {
        res.write(columns.map((c) => escapeCsvValue(row[c.key])).join(",") + "\r\n")
    }
    res.end()

}