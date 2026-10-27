import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { CsvColumn } from "./csv.js";

type Rows = AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>;

export type PdfSection = {
    heading?: string;
    columns: CsvColumn[];
    rows: Rows;
    maxRows?: number;
};

export type PdfDocumentOptions = {
    title: string;
    subtitle: string;
    offsetMinutes: number;
    sections: PdfSection[];
};

const require = createRequire(import.meta.url);

const FONT_FILES = {
    body: "@fontsource/inter/files/inter-latin-400-normal.woff",
    bold: "@fontsource/inter/files/inter-latin-700-normal.woff",
    indic: "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    indicBold: "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff",
} as const;

const COLOR = {
    ink: "#0f172a",
    muted: "#64748b",
    header: "#1a4fc4",
    headerText: "#ffffff",
    stripe: "#f1f5f9",
    rule: "#cbd5e1",
} as const;

const MARGIN = 36;
const FOOTER_HEIGHT = 22;
const HEADER_HEIGHT = 24;
const ROW_HEIGHT = 20;
const CELL_PAD = 5;
const FONT_SIZE = 8.5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const INDIC_RUN = /([ऀ-ॿ‌‍]+)/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export const PDF_MAX_ROWS = 5000;

const pad = (value: number) => String(value).padStart(2, "0");

export const formatPdfDay = (value: Date | string, offsetMinutes: number): string => {
    const local = new Date(new Date(value).getTime() + offsetMinutes * 60_000);
    return `${pad(local.getUTCDate())} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
};

const formatPdfDateTime = (value: string, offsetMinutes: number): string => {
    const local = new Date(new Date(value).getTime() + offsetMinutes * 60_000);
    return `${formatPdfDay(value, offsetMinutes)}, ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
};

export const formatPdfCell = (value: unknown, offsetMinutes: number): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" && ISO_DATE.test(value)) return formatPdfDateTime(value, offsetMinutes);
    return String(value);
};

const splitRuns = (text: string): { text: string; indic: boolean }[] =>
    text.split(INDIC_RUN).filter(Boolean).map((part) => ({ text: part, indic: INDIC_RUN.test(part) }));

export const streamPdf = async (res: Response, options: PdfDocumentOptions): Promise<void> => {
    const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: MARGIN,
        bufferPages: true,
        info: { Title: options.title, Author: "Karya OS" },
    });

    doc.registerFont("body", require.resolve(FONT_FILES.body));
    doc.registerFont("bold", require.resolve(FONT_FILES.bold));
    doc.registerFont("indic", require.resolve(FONT_FILES.indic));
    doc.registerFont("indicBold", require.resolve(FONT_FILES.indicBold));

    const finished = new Promise<void>((resolve, reject) => {
        res.on("finish", resolve);
        res.on("error", reject);
    });
    doc.pipe(res);

    const contentWidth = doc.page.width - MARGIN * 2;
    const bottomLimit = () => doc.page.height - MARGIN - FOOTER_HEIGHT;

    const fontFor = (bold: boolean, indic: boolean) => (indic ? (bold ? "indicBold" : "indic") : bold ? "bold" : "body");

    const measure = (text: string, bold: boolean) =>
        splitRuns(text).reduce((sum, run) => sum + doc.font(fontFor(bold, run.indic)).fontSize(FONT_SIZE).widthOfString(run.text), 0);

    const fit = (text: string, maxWidth: number, bold: boolean): string => {
        if (measure(text, bold) <= maxWidth) return text;
        const chars = Array.from(text);
        while (chars.length > 1 && measure(`${chars.join("")}…`, bold) > maxWidth) chars.pop();
        return `${chars.join("")}…`;
    };

    const columnWidths = (columns: CsvColumn[], total: number): number[] => {
        const raw = columns.map((c) => c.width ?? Math.max(c.label.length + 4, 12));
        const rawSum = raw.reduce((a, b) => a + b, 0);
        const mins = columns.map((c) => measure(c.label, true) + CELL_PAD * 2 + 2);
        const widths = raw.map((w, i) => Math.max((w / rawSum) * total, mins[i] ?? 0));
        const excess = widths.reduce((a, b) => a + b, 0) - total;
        if (excess <= 0) return widths;
        const flexible = widths.reduce((sum, w, i) => sum + (w - (mins[i] ?? 0)), 0);
        if (flexible <= 0) return widths.map((w) => (w / (total + excess)) * total);
        return widths.map((w, i) => w - (excess * (w - (mins[i] ?? 0))) / flexible);
    };

    const drawCell = (text: string, x: number, y: number, width: number, align: "left" | "right", bold: boolean, color: string) => {
        const inner = width - CELL_PAD * 2;
        const shown = fit(text, inner, bold);
        let cursor = align === "right" ? x + CELL_PAD + Math.max(0, inner - measure(shown, bold)) : x + CELL_PAD;
        doc.fillColor(color);
        for (const run of splitRuns(shown)) {
            doc.font(fontFor(bold, run.indic)).fontSize(FONT_SIZE);
            doc.text(run.text, cursor, y, { lineBreak: false });
            cursor += doc.widthOfString(run.text);
        }
    };

    const drawHeader = (columns: CsvColumn[], widths: number[], y: number) => {
        doc.save().rect(MARGIN, y, contentWidth, HEADER_HEIGHT).fill(COLOR.header).restore();
        let x = MARGIN;
        columns.forEach((column, index) => {
            const width = widths[index] ?? 0;
            drawCell(column.label, x, y + 8, width, column.align ?? "left", true, COLOR.headerText);
            x += width;
        });
        return y + HEADER_HEIGHT;
    };

    doc.font("bold").fontSize(18).fillColor(COLOR.ink).text(options.title, MARGIN, MARGIN, { lineBreak: false });
    doc.font("body").fontSize(9).fillColor(COLOR.muted).text(options.subtitle, MARGIN, MARGIN + 26, { width: contentWidth, lineBreak: false, ellipsis: true });
    let y = MARGIN + 52;

    for (const section of options.sections) {
        const columns = section.columns.filter((c) => c.key !== "id");
        const widths = columnWidths(columns, contentWidth);

        if (y + 20 + HEADER_HEIGHT + ROW_HEIGHT * 2 > bottomLimit()) {
            doc.addPage();
            y = MARGIN;
        }
        if (section.heading) {
            doc.font("bold").fontSize(11).fillColor(COLOR.ink).text(section.heading, MARGIN, y, { lineBreak: false });
            y += 20;
        }
        y = drawHeader(columns, widths, y);

        let count = 0;
        let truncated = false;
        for await (const row of section.rows) {
            if (section.maxRows !== undefined && count >= section.maxRows) {
                truncated = true;
                break;
            }
            if (y + ROW_HEIGHT > bottomLimit()) {
                doc.addPage();
                y = drawHeader(columns, widths, MARGIN);
            }
            if (count % 2 === 1) doc.save().rect(MARGIN, y, contentWidth, ROW_HEIGHT).fill(COLOR.stripe).restore();
            let x = MARGIN;
            columns.forEach((column, index) => {
                const width = widths[index] ?? 0;
                drawCell(formatPdfCell(row[column.key], options.offsetMinutes), x, y + 6, width, column.align ?? "left", false, COLOR.ink);
                x += width;
            });
            y += ROW_HEIGHT;
            count += 1;
        }

        doc.save().moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).lineWidth(0.5).strokeColor(COLOR.rule).stroke().restore();
        y += 8;
        if (count === 0) {
            doc.font("body").fontSize(9).fillColor(COLOR.muted).text("No records in this period.", MARGIN, y, { lineBreak: false });
            y += 16;
        }
        if (truncated) {
            doc.font("body").fontSize(9).fillColor(COLOR.muted).text(
                `Showing the first ${section.maxRows?.toLocaleString("en-IN")} records. Download Excel or CSV for the full list.`,
                MARGIN, y, { lineBreak: false },
            );
            y += 16;
        }
        y += 14;
    }

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
        doc.switchToPage(range.start + index);
        doc.page.margins.bottom = 0;
        const footerY = doc.page.height - MARGIN;
        doc.font("body").fontSize(8).fillColor(COLOR.muted);
        doc.text(`${options.title}`, MARGIN, footerY, { lineBreak: false });
        const label = `Page ${index + 1} of ${range.count}`;
        doc.text(label, doc.page.width - MARGIN - doc.widthOfString(label), footerY, { lineBreak: false });
    }

    doc.end();
    await finished;
};
