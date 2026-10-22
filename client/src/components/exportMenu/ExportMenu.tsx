import { Fragment, useState } from 'react';
import { Download, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
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

const FORMATS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText; tile: string }[] = [
  { format: 'xlsx', label: 'Excel', hint: 'Coloured, ready to share', icon: FileSpreadsheet, tile: 'bg-linear-to-br from-success to-success/70' },
  { format: 'csv', label: 'CSV', hint: 'Plain data for other tools', icon: FileText, tile: 'bg-linear-to-br from-primary-500 to-primary-600' },
];

const isCounted = (table: ExportTable): table is { rows: TableRows; count: number } => !Array.isArray(table);

export const ExportMenu = ({ disabled, more, onExported, 'aria-label': ariaLabel = 'Export', className, iconOnly = false, ...main }: ExportMenuProps) => {
  const [busy, setBusy] = useState(false);
  const sources: ExportSource[] = [main, ...(more ?? [])];
  const grouped = sources.length > 1;

  const run = async (source: ExportSource, format: ExportFormat) => {
    if (busy) return;
    setBusy(true);
    try {
      const table = await source.getRows();
      const rows = isCounted(table) ? table.rows : table;
      const count = isCounted(table) ? table.count : Math.max(0, rows.length - 1);
      const titleLines = source.title === undefined ? [] : typeof source.title === 'string' ? [source.title] : source.title;
      const file: TableRows = titleLines.length ? [...titleLines.map((line) => [line]), [], ...rows] : rows;
      const sheet = source.sheetName ?? titleLines[0]?.split(',')[0] ?? 'Sheet1';
      const filename = stampedFilename(source.filename, format);
      downloadBlob(format === 'csv' ? csvBlob(file) : xlsxBlob(file, sheet, { titleRows: titleLines.length }), filename);
      toast.success(`Exported ${count} ${count === 1 ? 'row' : 'rows'}`, { description: filename });
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
          aria-busy={busy}
          title={ariaLabel}
          className={cn('shrink-0 gap-1.5 pointer-coarse:min-w-11 max-sm:px-2.5', iconOnly && 'size-9 px-0 pointer-coarse:size-11', className)}
        >
          {busy ? <LoaderCircle size={14} strokeWidth={2.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download size={14} strokeWidth={2.5} aria-hidden="true" />}
          <span className={iconOnly ? 'sr-only' : 'hidden sm:inline'}>{busy ? 'Preparing' : 'Export'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 p-1.5">
        {sources.map((source, i) => (
          <Fragment key={`${source.filename}-${i}`}>
            {grouped && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="pb-1">
              {grouped ? (source.label ?? (i === 0 ? 'This view' : source.filename)) : 'Download as'}
            </DropdownMenuLabel>
            {FORMATS.map(({ format, label, hint, icon: Icon, tile }) => (
              <DropdownMenuItem key={format} onClick={() => void run(source, format)} className="gap-3 py-2">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tile)} aria-hidden="true">
                  <Icon size={17} strokeWidth={2.25} className="text-white!" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="t-card font-display font-semibold text-text">{label}</span>
                  <span className="t-meta font-medium text-text-muted">{hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
