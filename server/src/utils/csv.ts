import type { Response } from "express";
export type CsvColumn = { key: string; label: string };

const escapeCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    let str = String(value);
    if (typeof value !== "number" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const streamCsv = async (
    res: Response,
    rows: AsyncIterable<Record<string, unknown>>,
    columns: CsvColumn[],
): Promise<void> => {
    res.write("﻿");
    res.write(columns.map((c) => escapeCsvValue(c.label)).join(",") + "\r\n");
    for await (const row of rows) {
        res.write(columns.map((c) => escapeCsvValue(row[c.key])).join(",") + "\r\n")
    }
    res.end()

}