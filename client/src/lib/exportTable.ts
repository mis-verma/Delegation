import { roundPct } from './percent';

export type CellValue = string | number | null | undefined;
export type TableRows = readonly (readonly CellValue[])[];

const csvCell = (value: CellValue): string => {
  if (value == null) return '';
  const text = String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows: TableRows): string => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

export const csvBlob = (rows: TableRows): Blob =>
  new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const escapeXml = (text: string) => {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    out += XML_ESCAPES[char] ?? char;
  }
  return out;
};

const columnName = (index: number): string => {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
};

const isFiniteNumber = (value: CellValue): value is number => typeof value === 'number' && Number.isFinite(value);

export interface SheetOptions {
  titleRows?: number;
}

type RowKind = 'title' | 'subtitle' | 'blank' | 'section' | 'header' | 'data' | 'note';

const STYLE = {
  plain: 0,
  title: 1,
  subtitle: 2,
  header: 3,
  headerLeft: 4,
  section: 5,
  label: 6,
  text: 7,
  number: 8,
  pctGood: 9,
  pctFair: 10,
  pctLow: 11,
  note: 12,
  empty: 13,
} as const;

const filled = (value: CellValue): boolean => value != null && value !== '';

const classifyRows = (rows: TableRows, titleRows: number): RowKind[] => {
  const kinds: RowKind[] = [];
  const count = (row: readonly CellValue[]) => row.filter(filled).length;
  for (let r = 0; r < rows.length; r++) {
    const n = count(rows[r]);
    const prev = kinds[r - 1];
    if (r < titleRows && n > 0) kinds.push(r === 0 ? 'title' : 'subtitle');
    else if (n === 0) kinds.push('blank');
    else if (n === 1 && (prev === 'blank' || prev === undefined) && r + 1 < rows.length && count(rows[r + 1]) > 0) kinds.push('section');
    else if (n === 1) kinds.push('note');
    else if (prev === undefined || prev === 'blank' || prev === 'section' || prev === 'title' || prev === 'subtitle') kinds.push('header');
    else kinds.push('data');
  }
  return kinds;
};

const percentStyle = (value: number): number => (value >= 80 ? STYLE.pctGood : value >= 50 ? STYLE.pctFair : STYLE.pctLow);

const displayLength = (value: CellValue, kind: RowKind): number => {
  if (!filled(value)) return 0;
  if (typeof value === 'number') return 8;
  const text = String(value);
  return kind === 'header' ? Math.min(text.length, 20) : text.length;
};

const columnWidths = (rows: TableRows, kinds: RowKind[]): number[] => {
  const widths: number[] = [];
  rows.forEach((row, r) => {
    const kind = kinds[r];
    if (kind !== 'header' && kind !== 'data') return;
    row.forEach((value, c) => {
      widths[c] = Math.max(widths[c] ?? 0, displayLength(value, kind));
    });
  });
  return widths.map((w) => Math.min(46, Math.max(10, Math.round(w * 1.15 + 3))));
};

const sheetXml = (rows: TableRows, options: SheetOptions): string => {
  const kinds = classifyRows(rows, options.titleRows ?? 0);
  const headerRows = kinds.flatMap((kind, r) => (kind === 'header' ? [r] : []));
  const widths = columnWidths(rows, kinds);
  let pctColumns = new Set<number>();

  const body = rows
    .map((row, r) => {
      const kind = kinds[r];
      if (kind === 'blank') pctColumns = new Set();
      if (kind === 'header') pctColumns = new Set(row.flatMap((value, c) => (typeof value === 'string' && value.includes('%') ? [c] : [])));

      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          const empty = !filled(value);
          if (empty) return kind === 'data' ? `<c r="${ref}" s="${STYLE.empty}"/>` : '';
          if (isFiniteNumber(value)) {
            const style = kind === 'data' ? (pctColumns.has(c) ? percentStyle(value) : STYLE.number) : STYLE.plain;
            return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
          }
          const style =
            kind === 'title' ? STYLE.title
            : kind === 'subtitle' ? STYLE.subtitle
            : kind === 'section' ? STYLE.section
            : kind === 'header' ? (c === 0 ? STYLE.headerLeft : STYLE.header)
            : kind === 'note' ? STYLE.note
            : c === 0 ? STYLE.label
            : STYLE.text;
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join('');
      const height = kind === 'title' ? ' ht="26" customHeight="1"' : kind === 'header' ? ' ht="34" customHeight="1"' : kind === 'section' ? ' ht="24" customHeight="1"' : '';
      return `<row r="${r + 1}"${height}>${cells}</row>`;
    })
    .join('');

  const frozen = headerRows.length === 1 ? headerRows[0] + 1 : 0;
  const pane = frozen > 0
    ? `<pane ySplit="${frozen}" topLeftCell="A${frozen + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : '';
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${body}</sheetData></worksheet>`
  );
};

const safeSheetName = (name: string) => (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet1').slice(0, 31);

const BORDER = 'borderId="1" applyBorder="1"';
const CENTER = '<alignment horizontal="center" vertical="center" wrapText="1"/>';

const stylesXml = (): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/></numFmts>' +
  '<fonts count="9">' +
  '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="15"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="12"/><color rgb="FF2F4FB8"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF15803D"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFB45309"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="6">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF2F4FB8"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE6F6EC"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3DC"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7E7"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="14">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  `<xf numFmtId="0" fontId="3" fillId="2" ${BORDER} xfId="0" applyFont="1" applyFill="1" applyAlignment="1">${CENTER}</xf>` +
  `<xf numFmtId="0" fontId="3" fillId="2" ${BORDER} xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>` +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>' +
  `<xf numFmtId="0" fontId="5" fillId="0" ${BORDER} xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" ${BORDER} xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" ${BORDER} xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `<xf numFmtId="165" fontId="6" fillId="3" ${BORDER} xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `<xf numFmtId="165" fontId="7" fillId="4" ${BORDER} xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  `<xf numFmtId="165" fontId="8" fillId="5" ${BORDER} xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  `<xf numFmtId="0" fontId="0" fillId="0" ${BORDER} xfId="0"/>` +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const workbookParts = (rows: TableRows, sheetName: string, options: SheetOptions): Record<string, string> => ({
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
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
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>',
  'xl/styles.xml': stylesXml(),
  'xl/worksheets/sheet1.xml': sheetXml(rows, options),
});

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

    body.u32(0x04034b50);
    body.u16(20);
    body.u16(0x0800);
    body.u16(0);
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(data.length);
    body.u32(data.length);
    body.u16(name.length);
    body.u16(0);
    body.push(name);
    body.push(data);

    central.u32(0x02014b50);
    central.u16(20);
    central.u16(20);
    central.u16(0x0800);
    central.u16(0);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(name.length);
    central.u16(0);
    central.u16(0);
    central.u16(0);
    central.u16(0);
    central.u32(0);
    central.u32(offset);
    central.push(name);

    entries++;
  }

  const out = new ByteWriter();
  out.push(body.toUint8Array());
  const centralBytes = central.toUint8Array();
  out.push(centralBytes);
  out.u32(0x06054b50);
  out.u16(0);
  out.u16(0);
  out.u16(entries);
  out.u16(entries);
  out.u32(centralBytes.length);
  out.u32(body.length);
  out.u16(0);
  return out.toUint8Array();
};

export const xlsxBlob = (rows: TableRows, sheetName = 'Sheet1', options: SheetOptions = {}): Blob =>
  new Blob([zipStored(workbookParts(rows, sheetName, options)) as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

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

export const stampedFilename = (base: string, extension: 'csv' | 'xlsx', now = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`;
};

const EXPORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatExportDate = (value: string | Date): string => {
  const day = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${EXPORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const formatExportRange = (from: string | Date, to: string | Date): string => {
  const a = formatExportDate(from);
  const b = formatExportDate(to);
  return a === b ? a : `${a} to ${b}`;
};

export const exportTitle = ({ what, from, to, period, filters }: {
  what: string;
  from?: string | Date;
  to?: string | Date;
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

export const exportPct = (value: number | null | undefined): number | null =>
  roundPct(value);
