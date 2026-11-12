import { useState, type DragEvent } from 'react';
import { AlertCircle, CalendarDays, Check, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Button, Modal, PriorityChip, StatusBadge } from '../../components';
import { cn } from '@/lib/utils';
import { downloadBlob, xlsxBlob } from '../../lib/exportTable';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { dueLabel } from './todoDate';
import { useImportTodosMutation, useTodoImportPreviewMutation } from './hook';
import type { TodoImportPreview, TodoImportRow } from '../../api/todos';

interface TodoImportModalProps {
  onClose: () => void;
}

type Draft = TodoImportRow & { include: boolean; pastDue: boolean };
type Loaded = Omit<TodoImportPreview, 'rows'> & { rows: Draft[]; fileName: string };

const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLUMNS: { name: string; help: string }[] = [
  { name: 'Task', help: 'Required. One to-do per row.' },
  { name: 'Due date', help: 'Optional. 2026-11-20, 20/11/2026 or 20 Nov.' },
  { name: 'Priority', help: 'Optional. Low, Medium or High.' },
  { name: 'Done', help: 'Optional. Yes adds it as completed.' },
];

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const downloadTemplate = () =>
  downloadBlob(
    xlsxBlob([
      ['Task', 'Due date', 'Priority', 'Done'],
      ['Call the supplier about the late order', isoDay(1), 'High', 'No'],
      ['Update the stock sheet', isoDay(3), 'Medium', 'No'],
    ], 'To-dos'),
    'todo-import-template.xlsx',
  );

const warningsOf = (row: Draft): string[] => [
  ...(row.dueInvalid ? [`Couldn't read the date "${row.dueText}". It will have no due date.`] : []),
  ...(!row.priorityMatched ? [`"${row.priorityText}" isn't a priority. It will be Medium.`] : []),
  ...(row.textTooLong ? ['Shortened to 500 characters.'] : []),
];

export const TodoImportModal = ({ onClose }: TodoImportModalProps) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const previewMut = useTodoImportPreviewMutation();
  const importMut = useImportTodosMutation();

  const readFile = (file: File) => {
    previewMut.mutate(file, {
      onSuccess: (data) => {
        const now = Date.now();
        setLoaded({
          ...data,
          fileName: file.name,
          rows: data.rows.map((r) => ({ ...r, include: true, pastDue: !!r.dueDate && new Date(r.dueDate).getTime() < now })),
        });
      },
    });
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const rows = loaded?.rows ?? [];
  const chosen = rows.filter((r) => r.include);
  const allChosen = rows.length > 0 && chosen.length === rows.length;
  const warned = rows.filter((r) => warningsOf(r).length > 0).length;

  const toggle = (rowIndex: number) =>
    setLoaded((prev) => prev && { ...prev, rows: prev.rows.map((r) => (r.rowIndex === rowIndex ? { ...r, include: !r.include } : r)) });
  const setAll = (include: boolean) =>
    setLoaded((prev) => prev && { ...prev, rows: prev.rows.map((r) => ({ ...r, include })) });

  const submit = () => {
    if (!chosen.length) return;
    importMut.mutate(
      chosen.map((r) => ({ text: r.text, completed: r.completed, dueDate: r.dueDate, priority: r.priority })),
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to-dos from a file"
      description={loaded ? loaded.fileName : 'Upload an Excel (.xlsx) or CSV file. You check every row before anything is added.'}
      icon={<UploadCloud size={18} aria-hidden="true" />}
      size="xl"
      dirty={!!loaded && !importMut.isSuccess}
      footer={loaded ? (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => setLoaded(null)} disabled={importMut.isPending} className="max-sm:h-11">
            Choose another file
          </Button>
          <Button onClick={submit} disabled={!chosen.length} isLoading={importMut.isPending} className="max-sm:h-11">
            {chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'to-do' : 'to-dos'}` : 'Pick at least one'}
          </Button>
        </div>
      ) : undefined}
    >
      {!loaded ? (
        <div className="flex flex-col gap-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            aria-busy={previewMut.isPending}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center outline-none transition-colors duration-200 ease-out focus-within:ring-2 focus-within:ring-primary-500/40 sm:py-10',
              dragOver ? 'border-primary-600 bg-primary-500/5' : 'border-border hover:border-primary-500/60 hover:bg-surface-hover/40',
              previewMut.isPending && 'pointer-events-none opacity-60',
            )}
          >
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }}
            />
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300" aria-hidden="true">
              <FileSpreadsheet className="size-6" />
            </span>
            <span className="flex flex-col gap-1">
              <span className="t-card font-display font-semibold text-text">
                {previewMut.isPending ? 'Reading your file…' : (
                  <>
                    <span className="sm:hidden">Tap to choose a file</span>
                    <span className="hidden sm:inline">Drop your file here, or click to choose it</span>
                  </>
                )}
              </span>
              <span className="t-meta font-medium text-text-muted">Excel (.xlsx) or CSV, up to 500 rows</span>
            </span>
          </label>

          <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-card font-display font-semibold text-text">Columns we read</p>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 max-sm:h-11">
                <Download size={15} aria-hidden="true" />
                Download template
              </Button>
            </div>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {COLUMNS.map((c) => (
                <div key={c.name} className="flex min-w-0 flex-col">
                  <dt className="t-meta font-display font-semibold text-text-secondary">{c.name}</dt>
                  <dd className="t-meta text-text-muted">{c.help}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="t-meta font-medium text-text-muted" aria-live="polite">
              {chosen.length} of {rows.length} picked
              {warned > 0 && <span className="text-warning"> · {warned} need a look</span>}
            </p>
            <button
              type="button"
              onClick={() => setAll(!allChosen)}
              className="inline-flex min-h-9 items-center rounded-lg px-2.5 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 cursor-pointer hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11 dark:text-primary-300"
            >
              {allChosen ? 'Unpick all' : 'Pick all'}
            </button>
          </div>

          {(loaded.truncated || loaded.skippedEmpty > 0) && (
            <p className="flex items-start gap-1.5 rounded-lg bg-surface-hover/60 px-3 py-2 t-meta text-text-secondary">
              <AlertCircle size={14} className="mt-0.5 text-text-muted" aria-hidden="true" />
              <span>
                {loaded.truncated && 'Only the first 500 rows are shown. Split the file to add the rest. '}
                {loaded.skippedEmpty > 0 && `${loaded.skippedEmpty} ${loaded.skippedEmpty === 1 ? 'row has' : 'rows have'} no task and ${loaded.skippedEmpty === 1 ? 'was' : 'were'} skipped.`}
              </span>
            </p>
          )}

          <ul className="flex flex-col gap-2" aria-label="Rows in your file">
            {rows.map((row) => {
              const warnings = warningsOf(row);
              const past = row.pastDue && !row.completed;
              return (
                <li key={row.rowIndex}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-[border-color,background-color,opacity] duration-200 ease-out',
                      row.include ? 'border-border/70 bg-surface hover:border-primary-500/40' : 'border-border/40 bg-surface-hover/30 opacity-60',
                    )}
                  >
                    <input type="checkbox" checked={row.include} onChange={() => toggle(row.rowIndex)} className="peer sr-only" />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40',
                        row.include ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover text-transparent',
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{row.text}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {row.completed
                          ? <StatusBadge variant="success" icon={CheckCircle2} label="Done" />
                          : <PriorityChip meta={PRIORITY_MAP[row.priority]} />}
                        {row.dueDate && (
                          <StatusBadge variant={past ? 'critical' : 'neutral'} icon={CalendarDays} label={past ? `Past, ${dueLabel(row.dueDate)}` : dueLabel(row.dueDate)} />
                        )}
                      </span>
                      {warnings.map((w) => (
                        <span key={w} className="flex items-start gap-1.5 t-meta font-medium text-warning">
                          <AlertCircle size={13} className="mt-0.5" aria-hidden="true" />
                          {w}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
};
