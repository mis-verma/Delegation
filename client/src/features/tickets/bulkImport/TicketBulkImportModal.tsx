import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, X, PartyPopper, Tag as TagIcon, Download, ClipboardPaste } from 'lucide-react';
import { Modal, Button, Combobox } from '../../../components';
import { notifyError } from '../../../lib/queryHelpers';
import { ticketBulkImportApi } from '../../../api/ticketBulkImport';
import { pastedRowsToCsvFile } from './pasteRows';
import { useTicketBulkImportPreviewMutation, useTicketBulkImportPublishMutation } from '../hook';
import type {
  TicketBulkImportMatchedRow,
  BulkImportMatchConfidence,
  TicketBulkImportSummary,
} from '../../../api/ticketBulkImport';
import type { Priority } from '../../../api/ticket';

interface TicketBulkImportModalProps {
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'done';

type ReviewRow = {
  rowIndex: number;
  raw: TicketBulkImportMatchedRow['raw'];
  title: string;
  description: string;
  assigneeId: string;
  assigneeConfidence: BulkImportMatchConfidence;
  departmentId: string;
  departmentConfidence: BulkImportMatchConfidence;
  storeId: string;
  storeConfidence: BulkImportMatchConfidence;
  categoryId: string;
  categoryConfidence: BulkImportMatchConfidence;
  priority: Priority;
  tatHours: string;
  tatHoursInvalid: boolean;
  tagIds: string[];
  unmatchedLabelNames: string[];
  excluded: boolean;
};

const ACCEPTED_EXTENSIONS = '.csv,.xlsx';

const routeOf = (r: { categoryId: string; departmentId: string; assigneeId: string }): 'auto' | 'manual' | 'none' =>
  r.categoryId ? 'auto' : r.departmentId || r.assigneeId ? 'manual' : 'none';

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const requiredFieldRing = (value: string) => (!value ? 'ring-2 ring-danger/40' : '');
const optionalFieldRing = (value: string, rawText: string | undefined, confidence: BulkImportMatchConfidence) => {
  if (!value) return rawText ? 'ring-2 ring-danger/40' : '';
  if (confidence === 'fuzzy') return 'ring-2 ring-warning/40';
  return '';
};

export const TicketBulkImportModal = ({ onClose }: TicketBulkImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [storeOptions, setStoreOptions] = useState<{ value: string; label: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [tagNameById, setTagNameById] = useState<Map<string, string>>(new Map());
  const [summary, setSummary] = useState<TicketBulkImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [downloading, setDownloading] = useState(false);

  const previewMutation = useTicketBulkImportPreviewMutation();
  const publishMutation = useTicketBulkImportPublishMutation();

  const reset = () => {
    setStep('upload');
    setRows([]);
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    previewMutation.mutate(file, {
      onSuccess: (data) => {
        setAssigneeOptions(data.assignableUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })));
        setDepartmentOptions(data.departments.map((d) => ({ value: d.id, label: d.name })));
        setStoreOptions(data.stores.map((s) => ({ value: s.id, label: s.name })));
        setCategoryOptions(data.categories.map((c) => ({ value: c.id, label: c.name })));
        setTagNameById(new Map(data.tags.map((t) => [t.id, t.name])));
        setRows(data.rows.map((r) => ({
          rowIndex: r.rowIndex,
          raw: r.raw,
          title: r.raw.title,
          description: r.raw.description ?? '',
          assigneeId: r.assigneeId ?? '',
          assigneeConfidence: r.assigneeMatchConfidence,
          departmentId: r.departmentId ?? '',
          departmentConfidence: r.departmentMatchConfidence,
          storeId: r.storeId ?? '',
          storeConfidence: r.storeMatchConfidence,
          categoryId: r.categoryId ?? '',
          categoryConfidence: r.categoryMatchConfidence,
          priority: r.priority,
          tatHours: r.tatHours != null ? String(r.tatHours) : '',
          tatHoursInvalid: r.tatHoursInvalid,
          tagIds: r.tagIds,
          unmatchedLabelNames: r.unmatchedLabelNames,
          excluded: false,
        })));
        setStep('review');
      },
    });
  };

  const handleTemplate = async () => {
    setDownloading(true);
    try {
      await ticketBulkImportApi.downloadTemplate();
    } catch (err) {
      notifyError(err, "Couldn't download the template. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePaste = () => {
    const file = pastedRowsToCsvFile(pasted);
    if (!file) {
      notifyError(new Error('Paste at least one row copied from your sheet.'), 'Paste at least one row copied from your sheet.');
      return;
    }
    handleFile(file);
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const includedRows = rows.filter((r) => !r.excluded);
  const tatBad = (value: string) => !!value.trim() && !(Number(value) > 0 && Number(value) <= 24 * 90);
  const isRowResolved = (r: ReviewRow) =>
    !!r.title.trim()
    && !!r.description.trim()
    && (!r.raw.assigneeName || !!r.assigneeId)
    && (!r.raw.departmentName || !!r.departmentId)
    && (!r.raw.storeName || !!r.storeId)
    && (!r.raw.categoryName || !!r.categoryId)
    && routeOf(r) !== 'none'
    && !r.tatHoursInvalid
    && !tatBad(r.tatHours);
  const unresolvedCount = includedRows.filter((r) => !isRowResolved(r)).length;
  const canPublish = includedRows.length > 0 && unresolvedCount === 0;

  const updateRow = (rowIndex: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)));

  const handlePublish = () => {
    publishMutation.mutate(
      {
        rows: includedRows.map((r) => ({
          rowIndex: r.rowIndex,
          title: r.title.trim(),
          description: r.description.trim(),
          assigneeId: r.assigneeId || undefined,
          priority: r.priority,
          departmentId: r.departmentId || undefined,
          storeId: r.storeId || undefined,
          categoryId: r.categoryId || undefined,
          tatHours: r.tatHours.trim() ? Number(r.tatHours) : undefined,
          tagIds: r.tagIds.length ? r.tagIds : undefined,
        })),
      },
      { onSuccess: (data) => { setSummary(data); setStep('done'); } },
    );
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title="Bulk import tickets"
      description="Download the template, fill one ticket per row, then upload it."
      icon={<UploadCloud size={18} className="text-primary-600" />}
      size="3xl"
      footer={
        step === 'review' ? (
          <>
            <Button variant="outline" onClick={() => setStep('upload')}>Start over</Button>
            <div className="flex flex-col items-end gap-1.5 min-w-0 text-right">
              {!canPublish && (
                <p className="t-meta font-display text-warning flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {includedRows.length === 0
                    ? 'Every row is excluded. Include at least one to continue.'
                    : `Fix ${unresolvedCount} row${unresolvedCount === 1 ? '' : 's'} to continue. Every ticket needs a category or a team.`}
                </p>
              )}
              <Button onClick={handlePublish} disabled={!canPublish} isLoading={publishMutation.isPending}>
                Create {includedRows.length || ''} ticket{includedRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        ) : step === 'done' ? (
          <Button onClick={handleClose}>Close</Button>
        ) : undefined
      }
    >
      {step === 'upload' && (
        <div className="flex flex-col gap-5">
          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 1</span>
              <p className="t-card font-display font-bold text-text">Get the template</p>
              <p className="t-meta text-text-secondary">An Excel sheet with dropdown lists for category, team, person and priority.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleTemplate()} isLoading={downloading} className="mt-auto max-sm:h-11">
                <Download size={15} aria-hidden />
                Download template
              </Button>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 2</span>
              <p className="t-card font-display font-bold text-text">Fill one ticket per row</p>
              <p className="t-meta text-text-secondary">Title, Description and a Category or Department are needed. Everything else is optional.</p>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 3</span>
              <p className="t-card font-display font-bold text-text">Upload and check</p>
              <p className="t-meta text-text-secondary">You see every ticket and can fix anything before it is created.</p>
            </li>
          </ol>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-3 py-8 sm:py-10 px-4 sm:px-6 rounded-lg border-2 border-dashed cursor-pointer text-center transition-colors ${
              dragOver ? 'border-primary-600 bg-primary-500/5' : 'border-border hover:border-primary-600'
            } ${previewMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <span className="flex items-center justify-center size-12 rounded-lg bg-surface-hover text-text-muted border border-border">
              <FileSpreadsheet className="size-6" />
            </span>
            <div>
              <p className="text-sm font-display font-semibold text-text">
                {previewMutation.isPending ? 'Reading file…' : 'Drop your file here, or tap to choose it'}
              </p>
              <p className="t-meta font-display text-text-muted mt-1">Excel (.xlsx) or CSV</p>
            </div>
          </label>

          <details className="rounded-lg border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 t-card font-display font-semibold text-text">
              <ClipboardPaste size={15} aria-hidden />
              Or paste rows copied from Excel or Google Sheets
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="t-meta text-text-secondary">Copy the rows in your sheet, then paste them here. The columns can be in the template order, with or without the heading row.</p>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder="Paste here"
                className="w-full rounded-md border border-border bg-surface p-3 t-meta text-text outline-none focus:border-primary-600"
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={handlePaste} disabled={!pasted.trim() || previewMutation.isPending} className="max-sm:h-11">
                  Read pasted rows
                </Button>
              </div>
            </div>
          </details>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          <p className="t-meta font-display text-text-muted">
            {includedRows.length} of {rows.length} row{rows.length === 1 ? '' : 's'} included. Rows outlined in amber need a second look, red ones need fixing.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full t-meta">
              <thead>
                <tr className="border-b border-border bg-surface-hover/30">
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Title</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Description</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Assignee</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Department</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Store</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Category</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Priority</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">TAT (hrs)</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">How it goes</th>
                  <th className="text-left font-display font-semibold text-text-muted t-meta tracking-wide px-3 py-2">Labels</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className={`border-b border-border/60 last:border-b-0 align-top ${row.excluded ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        value={row.title}
                        onChange={(e) => updateRow(row.rowIndex, { title: e.target.value })}
                        disabled={row.excluded}
                        placeholder="Title"
                        className={`w-36 px-2.5 py-1.5 pointer-coarse:h-11 t-meta bg-surface border border-border rounded-lg outline-none focus:border-primary-500 disabled:opacity-60 ${requiredFieldRing(row.title.trim())}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.description}
                        onChange={(e) => updateRow(row.rowIndex, { description: e.target.value })}
                        disabled={row.excluded}
                        placeholder="Description"
                        className={`w-40 px-2.5 py-1.5 pointer-coarse:h-11 t-meta bg-surface border border-border rounded-lg outline-none focus:border-primary-500 disabled:opacity-60 ${requiredFieldRing(row.description.trim())}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.assigneeId}
                        onChange={(v) => updateRow(row.rowIndex, { assigneeId: v, assigneeConfidence: 'exact' })}
                        options={assigneeOptions}
                        emptyOptionLabel="Unassigned"
                        placeholder={row.raw.assigneeName || 'Unassigned'}
                        disabled={row.excluded}
                        className={`t-meta ${optionalFieldRing(row.assigneeId, row.raw.assigneeName, row.assigneeConfidence)}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.departmentId}
                        onChange={(v) => updateRow(row.rowIndex, { departmentId: v, departmentConfidence: 'exact' })}
                        options={departmentOptions}
                        emptyOptionLabel="No department"
                        placeholder={row.raw.departmentName || 'No department'}
                        disabled={row.excluded}
                        className={`t-meta ${optionalFieldRing(row.departmentId, row.raw.departmentName, row.departmentConfidence)}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.storeId}
                        onChange={(v) => updateRow(row.rowIndex, { storeId: v, storeConfidence: 'exact' })}
                        options={storeOptions}
                        emptyOptionLabel="No store"
                        placeholder={row.raw.storeName || 'No store'}
                        disabled={row.excluded}
                        className={`t-meta ${optionalFieldRing(row.storeId, row.raw.storeName, row.storeConfidence)}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.categoryId}
                        onChange={(v) => updateRow(row.rowIndex, { categoryId: v, categoryConfidence: 'exact' })}
                        options={categoryOptions}
                        emptyOptionLabel="No category"
                        placeholder={row.raw.categoryName || 'No category'}
                        disabled={row.excluded}
                        className={`t-meta ${optionalFieldRing(row.categoryId, row.raw.categoryName, row.categoryConfidence)}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.priority}
                        onChange={(v) => updateRow(row.rowIndex, { priority: v as Priority })}
                        options={PRIORITY_OPTIONS}
                        className="t-meta"
                        disabled={row.excluded}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.tatHours}
                        onChange={(e) => updateRow(row.rowIndex, { tatHours: e.target.value, tatHoursInvalid: false })}
                        disabled={row.excluded}
                        placeholder={row.raw.dueDate ? `Due ${row.raw.dueDate}` : 'Default'}
                        className={`w-20 px-2.5 py-1.5 pointer-coarse:h-11 t-meta bg-surface border border-border rounded-lg outline-none focus:border-primary-500 disabled:opacity-60 ${row.tatHoursInvalid || tatBad(row.tatHours) ? 'ring-2 ring-danger/40' : ''}`}
                      />
                    </td>
                    <td className="px-3 py-2 t-meta min-w-36">
                      {routeOf(row) === 'auto' && (
                        <span className="font-display font-semibold text-text">Auto <span className="font-medium text-text-muted">· {categoryOptions.find((c) => c.value === row.categoryId)?.label ?? 'category'}</span></span>
                      )}
                      {routeOf(row) === 'manual' && (
                        <span className="font-display font-semibold text-text">Manual <span className="font-medium text-text-muted">· {departmentOptions.find((d) => d.value === row.departmentId)?.label ?? 'person chosen'}</span></span>
                      )}
                      {routeOf(row) === 'none' && !row.excluded && (
                        <span className="flex items-center gap-1 font-display font-semibold text-danger"><AlertCircle size={12} className="shrink-0" /> Pick a category or team</span>
                      )}
                    </td>
                    <td className="px-3 py-2 t-meta max-w-40">
                      {row.tagIds.length > 0 && (
                        <span className="text-text-secondary">{row.tagIds.map((id) => tagNameById.get(id)).filter(Boolean).join(', ')}</span>
                      )}
                      {row.unmatchedLabelNames.length > 0 && (
                        <span className="flex items-center gap-1 text-warning font-medium mt-0.5" title={row.unmatchedLabelNames.join(', ')}>
                          <TagIcon size={11} /> {row.unmatchedLabelNames.length} unmatched
                        </span>
                      )}
                      {!row.tagIds.length && !row.unmatchedLabelNames.length && <span className="text-text-light">None</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => updateRow(row.rowIndex, { excluded: !row.excluded })}
                        title={row.excluded ? 'Include row' : 'Exclude row'}
                        aria-label={row.excluded ? 'Include row' : 'Exclude row'}
                        className="flex items-center justify-center size-8 pointer-coarse:size-11 rounded-md text-text-light hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="flex items-center justify-center size-12 rounded-2xl bg-success/10 text-success border border-success/20">
            <PartyPopper className="size-6" />
          </span>
          <p className="text-sm font-display font-semibold text-text">
            {summary.created} ticket{summary.created === 1 ? '' : 's'} created
          </p>

          {summary.failed.length > 0 && (
            <div className="w-full max-w-sm text-left mt-2">
              <p className="t-meta font-display font-semibold text-danger flex items-center gap-1.5 mb-1.5">
                <AlertCircle size={13} /> {summary.failed.length} row{summary.failed.length === 1 ? '' : 's'} failed
              </p>
              <ul className="flex flex-col gap-1 t-meta font-display text-text-muted max-h-32 overflow-y-auto">
                {summary.failed.map((f) => (
                  <li key={f.rowIndex}>Row {f.rowIndex}: {f.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
