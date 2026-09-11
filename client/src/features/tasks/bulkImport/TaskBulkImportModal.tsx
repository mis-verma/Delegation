import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, X, PartyPopper, Tag as TagIcon } from 'lucide-react';
import { Modal, Button, Combobox } from '../../../components';
import { useTaskBulkImportPreviewMutation, useTaskBulkImportPublishMutation } from '../hook';
import type {
  TaskBulkImportMatchedRow,
  BulkImportMatchConfidence,
  TaskBulkImportDateField,
  TaskBulkImportSummary,
} from '../../../api/taskBulkImport';

interface TaskBulkImportModalProps {
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'done';

type ReviewRow = {
  rowIndex: number;
  raw: TaskBulkImportMatchedRow['raw'];
  title: string;
  assigneeId: string;
  assigneeConfidence: BulkImportMatchConfidence;
  departmentId: string;
  departmentConfidence: BulkImportMatchConfidence;
  priority: 'low' | 'medium' | 'high';
  startDate: TaskBulkImportDateField;
  dueDate: TaskBulkImportDateField;
  tagIds: string[];
  unmatchedLabelNames: string[];
  excluded: boolean;
};

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Title is the one field the server actually requires — empty is always an error. Assignee and
// Department are optional on a delegation, so an empty match is only an error when text was
// actually typed in the source file and didn't resolve to a real record; leaving the cell blank
// is the same as leaving the field blank in the create-delegation form.
const requiredFieldRing = (value: string) => (!value ? 'ring-2 ring-danger/40' : '');
const optionalFieldRing = (value: string, rawText: string | undefined, confidence: BulkImportMatchConfidence) => {
  if (!value) return rawText ? 'ring-2 ring-danger/40' : '';
  if (confidence === 'fuzzy') return 'ring-2 ring-warning/40';
  return '';
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const TaskBulkImportModal = ({ onClose }: TaskBulkImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ value: string; label: string }[]>([]);
  const [tagNameById, setTagNameById] = useState<Map<string, string>>(new Map());
  const [summary, setSummary] = useState<TaskBulkImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useTaskBulkImportPreviewMutation();
  const publishMutation = useTaskBulkImportPublishMutation();

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
        setTagNameById(new Map(data.tags.map((t) => [t.id, t.name])));
        setRows(data.rows.map((r) => ({
          rowIndex: r.rowIndex,
          raw: r.raw,
          title: r.raw.title,
          assigneeId: r.assigneeId ?? '',
          assigneeConfidence: r.assigneeMatchConfidence,
          departmentId: r.departmentId ?? '',
          departmentConfidence: r.departmentMatchConfidence,
          priority: r.priority,
          startDate: r.startDate,
          dueDate: r.dueDate,
          tagIds: r.tagIds,
          unmatchedLabelNames: r.unmatchedLabelNames,
          excluded: false,
        })));
        setStep('review');
      },
    });
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const includedRows = rows.filter((r) => !r.excluded);
  const isRowResolved = (r: ReviewRow) =>
    !!r.title.trim()
    && (!r.raw.assigneeName || !!r.assigneeId)
    && (!r.raw.departmentName || !!r.departmentId)
    && r.startDate.valid
    && r.dueDate.valid;
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
          assigneeId: r.assigneeId || undefined,
          priority: r.priority,
          startDate: r.startDate.iso ?? undefined,
          dueDate: r.dueDate.iso ?? undefined,
          departmentId: r.departmentId || undefined,
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
      title="Bulk import delegations"
      description="Upload a file to create many delegations at once."
      icon={<UploadCloud size={18} className="text-primary-600" />}
      size="3xl"
      footer={
        step === 'review' ? (
          <>
            <Button variant="outline" onClick={() => setStep('upload')}>Start over</Button>
            <div className="flex flex-col items-end gap-1.5">
              {!canPublish && (
                <p className="text-[11px] font-display text-warning flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {includedRows.length === 0
                    ? 'Every row is excluded — include at least one to continue.'
                    : `Resolve ${unresolvedCount} row${unresolvedCount === 1 ? '' : 's'} to continue.`}
                </p>
              )}
              <Button onClick={handlePublish} disabled={!canPublish} isLoading={publishMutation.isPending}>
                Create {includedRows.length || ''} delegation{includedRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        ) : step === 'done' ? (
          <Button onClick={handleClose}>Close</Button>
        ) : undefined
      }
    >
      {step === 'upload' && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 py-14 px-6 rounded-xl border-2 border-dashed cursor-pointer text-center transition-colors ${
            dragOver ? 'border-primary-500 bg-primary-500/5' : 'border-border/80 hover:border-primary-400'
          } ${previewMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <span className="flex items-center justify-center size-12 rounded-2xl bg-surface-hover text-text-muted border border-border/60">
            <FileSpreadsheet className="size-6" />
          </span>
          <div>
            <p className="text-sm font-display font-semibold text-text">
              {previewMutation.isPending ? 'Reading file…' : 'Drop a file here, or click to browse'}
            </p>
            <p className="text-xs font-display text-text-muted mt-1">CSV or Excel (.xlsx)</p>
            <p className="text-[11px] font-display text-text-light mt-2">
              Columns: Title, Description, Assignee (email or name), Priority, Start Date, Due Date, Department, Labels — only Title is required.
            </p>
          </div>
        </label>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-display text-text-muted">
            {includedRows.length} of {rows.length} row{rows.length === 1 ? '' : 's'} included · rows outlined in amber need a second look, red need fixing.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover/30">
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Title</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Assignee</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Department</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Priority</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Start</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Due</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] uppercase tracking-wider px-3 py-2">Labels</th>
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
                        className={`w-40 px-2.5 py-1.5 text-sm bg-surface border border-border rounded-lg outline-none focus:border-primary-500 disabled:opacity-60 ${requiredFieldRing(row.title.trim())}`}
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
                        className={optionalFieldRing(row.assigneeId, row.raw.assigneeName, row.assigneeConfidence)}
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
                        className={optionalFieldRing(row.departmentId, row.raw.departmentName, row.departmentConfidence)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        value={row.priority}
                        onChange={(v) => updateRow(row.rowIndex, { priority: v as ReviewRow['priority'] })}
                        options={PRIORITY_OPTIONS}
                        disabled={row.excluded}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.startDate.iso ? (
                        <span className="text-text-secondary">{formatDate(row.startDate.iso)}</span>
                      ) : row.startDate.raw ? (
                        <span className="text-danger font-medium" title={`Couldn't parse "${row.startDate.raw}"`}>Invalid date</span>
                      ) : (
                        <span className="text-text-light">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.dueDate.iso ? (
                        <span className="text-text-secondary">{formatDate(row.dueDate.iso)}</span>
                      ) : row.dueDate.raw ? (
                        <span className="text-danger font-medium" title={`Couldn't parse "${row.dueDate.raw}"`}>Invalid date</span>
                      ) : (
                        <span className="text-text-light">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-40">
                      {row.tagIds.length > 0 && (
                        <span className="text-text-secondary">{row.tagIds.map((id) => tagNameById.get(id)).filter(Boolean).join(', ')}</span>
                      )}
                      {row.unmatchedLabelNames.length > 0 && (
                        <span className="flex items-center gap-1 text-warning font-medium mt-0.5" title={row.unmatchedLabelNames.join(', ')}>
                          <TagIcon size={11} /> {row.unmatchedLabelNames.length} unmatched
                        </span>
                      )}
                      {!row.tagIds.length && !row.unmatchedLabelNames.length && <span className="text-text-light">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => updateRow(row.rowIndex, { excluded: !row.excluded })}
                        title={row.excluded ? 'Include row' : 'Exclude row'}
                        aria-label={row.excluded ? 'Include row' : 'Exclude row'}
                        className="p-1.5 rounded-md text-text-light hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
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
            {summary.created} delegation{summary.created === 1 ? '' : 's'} created
          </p>

          {summary.failed.length > 0 && (
            <div className="w-full max-w-sm text-left mt-2">
              <p className="text-xs font-display font-semibold text-danger flex items-center gap-1.5 mb-1.5">
                <AlertCircle size={13} /> {summary.failed.length} row{summary.failed.length === 1 ? '' : 's'} failed
              </p>
              <ul className="flex flex-col gap-1 text-[11px] font-display text-text-muted max-h-32 overflow-y-auto">
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
