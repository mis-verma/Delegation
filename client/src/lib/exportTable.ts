/**
 * Client-side CSV / XLSX export for tables that are computed in the browser.
 *
 * The server already exports tickets/tasks/checklists via `api/reports.ts` (exceljs, server-side)
 * — use that for anything the server can recompute. This module exists for the opposite case: a
 * table whose numbers only exist on the client (the Compliance card scopes, filters and buckets
 * its items entirely in the browser), where re-deriving them server-side would risk an export
 * that disagrees with what the user is looking at.
 *
 * XLSX is written by hand rather than with a spreadsheet library: an .xlsx is a ZIP of XML parts,
 * and ZIP entries may be *stored* uncompressed, so no compression dependency is needed either.
 * That keeps a six-row export from costing a megabyte of JS. Everything below writes the minimum
 * set of parts Excel/Sheets/Numbers need to open a single-sheet workbook.
 */
import { roundPct } from './percent';

export type CellValue = string | number | null | undefined;
export type TableRows = readonly (readonly CellValue[])[];

/* -------------------------------------------------------------------------- */
/* CSV                                                                        */
/* -------------------------------------------------------------------------- */

const csvCell = (value: CellValue): string => {
  if (value == null) return '';
  const text = String(value);
  // Quote if the value contains a delimiter, a quote, a newline, or has padding that would
  // otherwise be eaten; double up any embedded quotes.
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: TableRows): string => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

export const csvBlob = (rows: TableRows): Blob =>
  // The BOM is what makes Excel read the file as UTF-8 instead of the local ANSI codepage —
  // without it, any non-ASCII name in a department/store/person column arrives mojibaked.
  new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });

/* -------------------------------------------------------------------------- */
/* XLSX — minimal OOXML package                                               */
/* -------------------------------------------------------------------------- */

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * XML 1.0 forbids the C0 control characters outright except tab, LF and CR — a single stray one
 * makes the part unparseable, which Excel reports to the user as a corrupt file. Dropped and
 * escaped in one pass here (rather than two chained regex replaces) because a character class
 * spanning control codepoints is exactly what `no-control-regex` exists to flag.
 */
const escapeXml = (text: string) => {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    out += XML_ESCAPES[char] ?? char;
  }
  return out;
};

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
const columnName = (index: number): string => {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
};

const isFiniteNumber = (value: CellValue): value is number => typeof value === 'number' && Number.isFinite(value);

const sheetXml = (rows: TableRows): string => {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value == null || value === '') return '';
          const ref = `${columnName(c)}${r + 1}`;
          // No `t` attribute means "number" to Excel; inlineStr keeps text in the sheet part so
          // there's no sharedStrings.xml to write and keep in sync.
          return isFiniteNumber(value)
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
};

// Excel rejects a sheet name over 31 characters or containing any of : \ / ? * [ ]
const safeSheetName = (name: string) => (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet1').slice(0, 31);

const workbookParts = (rows: TableRows, sheetName: string): Record<string, string> => ({
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>',
  'xl/workbook.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>',
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>',
  'xl/worksheets/sheet1.xml': sheetXml(rows),
});

/* ---- ZIP (store method, no compression) ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** MS-DOS packed date/time, the only timestamp format a ZIP local header carries. */
const dosDateTime = (date: Date) => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  date: ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  /** Little-endian, which is the only byte order the ZIP format uses. */
  u16(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]));
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

const zipStored = (parts: Record<string, string>, now = new Date()): Uint8Array => {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const body = new ByteWriter();
  const central = new ByteWriter();
  let entries = 0;

  for (const [path, text] of Object.entries(parts)) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const offset = body.length;

    body.u32(0x04034b50); // local file header
    body.u16(20); // version needed
    body.u16(0x0800); // UTF-8 filename flag
    body.u16(0); // stored, not deflated
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(data.length); // compressed size == uncompressed size when stored
    body.u32(data.length);
    body.u16(name.length);
    body.u16(0); // no extra field
    body.push(name);
    body.push(data);

    central.u32(0x02014b50); // central directory header
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0x0800);
    central.u16(0);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(name.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(offset);
    central.push(name);

    entries++;
  }

  const out = new ByteWriter();
  out.push(body.toUint8Array());
  const centralBytes = central.toUint8Array();
  out.push(centralBytes);
  out.u32(0x06054b50); // end of central directory
  out.u16(0); // this disk
  out.u16(0); // disk with central directory
  out.u16(entries);
  out.u16(entries);
  out.u32(centralBytes.length);
  out.u32(body.length);
  out.u16(0); // comment length
  return out.toUint8Array();
};

export const xlsxBlob = (rows: TableRows, sheetName = 'Sheet1'): Blob =>
  new Blob([zipStored(workbookParts(rows, sheetName)) as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

/* -------------------------------------------------------------------------- */
/* Download                                                                   */
/* -------------------------------------------------------------------------- */

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** `compliance-2026-09-03.csv` — a date-stamped name so repeat exports don't overwrite. */
export const stampedFilename = (base: string, extension: 'csv' | 'xlsx', now = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
};

/* -------------------------------------------------------------------------- */
/* Words for the title rows of an export                                      */
/* -------------------------------------------------------------------------- */

const EXPORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "10 Oct 2026". A bare 'YYYY-MM-DD' day is read as that calendar day (not UTC midnight, which a
 * browser west of UTC would show as the day before); anything else goes through `Date`.
 */
export const formatExportDate = (value: string | Date): string => {
  const day = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${EXPORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** "1 Oct 2026 to 31 Oct 2026", or a single date when both ends are the same day. */
export const formatExportRange = (from: string | Date, to: string | Date): string => {
  const a = formatExportDate(from);
  const b = formatExportDate(to);
  return a === b ? a : `${a} to ${b}`;
};

/**
 * The title rows of an export: what it is, then the period, then the filters that narrowed it, one
 * line each. Empty filters are dropped, so "All stores" is never written as a filter.
 */
export const exportTitle = ({ what, from, to, period, filters }: {
  what: string;
  from?: string | Date;
  to?: string | Date;
  /** Words for the period when there is no from/to, or a name for it beside them ("Oct 2026"). */
  period?: string;
  filters?: Record<string, string | null | undefined | false>;
}): string[] => {
  const range = from && to ? formatExportRange(from, to) : '';
  const periodLine = range && period && period !== range ? `Period: ${range} (${period})` : range || period ? `Period: ${range || period}` : '';
  const filterParts = Object.entries(filters ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
    .map(([key, value]) => `${key}: ${value}`);
  return [what, periodLine, filterParts.join(', ')].filter(Boolean);
};

/** A percentage as a plain number for a spreadsheet cell (85 or 99.6, not "85%"), one decimal at most, or empty. Same rounding as the screen (lib/percent.ts). */
export const exportPct = (value: number | null | undefined): number | null =>
  roundPct(value);
