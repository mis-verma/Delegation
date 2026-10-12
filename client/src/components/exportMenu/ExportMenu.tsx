import { Fragment, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '../button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { csvBlob, downloadBlob, stampedFilename, xlsxBlob, type TableRows } from '../../lib/exportTable';

export type ExportFormat = 'xlsx' | 'csv';

/**
 * What `getRows` hands back: the table itself (header row first, then one row per item), or the
 * table with its own row count when it holds more than one table (a section heading row and a
 * second header would otherwise be counted as items).
 */
export type ExportTable = TableRows | { rows: TableRows; count: number };

export interface ExportSource {
  /** Base file name. A date stamp and the extension are added. */
  filename: string;
  /** Built at click time, from exactly what the view is showing. May fetch first (returns a promise). */
  getRows: () => ExportTable | Promise<ExportTable>;
  /** The first rows of the file: what it is, the period, the filters. A blank row follows them. */
  title?: string | readonly string[];
  /** Excel sheet tab. Defaults to the first title line. */
  sheetName?: string;
  /** Group heading in the menu, only shown when the menu offers more than one export. */
  label?: string;
}

export interface ExportMenuProps extends ExportSource {
  disabled?: boolean;
  /** Further exports in the same menu (each its own group), e.g. a whole report beside "This view". */
  more?: readonly ExportSource[];
  onExported?: (format: ExportFormat, rowCount: number) => void;
  /** Screen-reader name of the button. The visible word is always "Export". */
  'aria-label'?: string;
  className?: string;
}

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { format: 'csv', label: 'CSV (.csv)', icon: FileText },
];

const isCounted = (table: ExportTable): table is { rows: TableRows; count: number } => !Array.isArray(table);

/**
 * The one Export button every score and report view uses: an outline "Export" button (just the icon
 * below `sm`, a full 44px square on touch) opening Excel / CSV. The file is built in the browser from
 * what is on screen and downloaded for the signed-in user; nothing is sent anywhere.
 */
export const ExportMenu = ({ disabled, more, onExported, 'aria-label': ariaLabel = 'Export', className, ...main }: ExportMenuProps) => {
  const [busy, setBusy] = useState(false);
  const sources: ExportSource[] = [main, ...(more ?? [])];
  const grouped = sources.length > 1;

  const run = async (source: ExportSource, format: ExportFormat) => {
    setBusy(true);
    try {
      const table = await source.getRows();
      const rows = isCounted(table) ? table.rows : table;
      // The header row is not an item.
      const count = isCounted(table) ? table.count : Math.max(0, rows.length - 1);
      const titleLines = source.title === undefined ? [] : typeof source.title === 'string' ? [source.title] : source.title;
      const file: TableRows = titleLines.length ? [...titleLines.map((line) => [line]), [], ...rows] : rows;
      const sheet = source.sheetName ?? titleLines[0]?.split(',')[0] ?? 'Sheet1';
      downloadBlob(format === 'csv' ? csvBlob(file) : xlsxBlob(file, sheet), stampedFilename(source.filename, format));
      toast.success(`Exported ${count} ${count === 1 ? 'row' : 'rows'}`);
      onExported?.(format, count);
    } catch {
      toast.error("Couldn't build the file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn('shrink-0 pointer-coarse:min-w-11 max-sm:px-2.5', className)}
        >
          <Download size={14} strokeWidth={2.5} aria-hidden="true" />
          <span className="hidden sm:inline">{busy ? 'Exporting' : 'Export'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {sources.map((source, i) => (
          <Fragment key={`${source.filename}-${i}`}>
            {grouped && i > 0 && <DropdownMenuSeparator />}
            {grouped && <DropdownMenuLabel>{source.label ?? (i === 0 ? 'This view' : source.filename)}</DropdownMenuLabel>}
            {FORMATS.map(({ format, label, icon: Icon }) => (
              <DropdownMenuItem key={format} onClick={() => void run(source, format)}>
                <Icon size={14} aria-hidden="true" />
                {label}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
