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

export type ExportTable = TableRows | { rows: TableRows; count: number };

export interface ExportSource {
  filename: string;
  getRows: () => ExportTable | Promise<ExportTable>;
  title?: string | readonly string[];
  sheetName?: string;
  label?: string;
}

export interface ExportMenuProps extends ExportSource {
  disabled?: boolean;
  more?: readonly ExportSource[];
  onExported?: (format: ExportFormat, rowCount: number) => void;
  'aria-label'?: string;
  className?: string;
  iconOnly?: boolean;
}

const FORMATS: { format: ExportFormat; label: string; icon: typeof FileText }[] = [
  { format: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { format: 'csv', label: 'CSV (.csv)', icon: FileText },
];

const isCounted = (table: ExportTable): table is { rows: TableRows; count: number } => !Array.isArray(table);

export const ExportMenu = ({ disabled, more, onExported, 'aria-label': ariaLabel = 'Export', className, iconOnly = false, ...main }: ExportMenuProps) => {
  const [busy, setBusy] = useState(false);
  const sources: ExportSource[] = [main, ...(more ?? [])];
  const grouped = sources.length > 1;

  const run = async (source: ExportSource, format: ExportFormat) => {
    setBusy(true);
    try {
      const table = await source.getRows();
      const rows = isCounted(table) ? table.rows : table;
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
          className={cn('shrink-0 pointer-coarse:min-w-11 max-sm:px-2.5', iconOnly && 'size-9 px-0 pointer-coarse:size-11', className)}
        >
          <Download size={14} strokeWidth={2.5} aria-hidden="true" />
          <span className={iconOnly ? 'sr-only' : 'hidden sm:inline'}>{busy ? 'Exporting' : 'Export'}</span>
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
