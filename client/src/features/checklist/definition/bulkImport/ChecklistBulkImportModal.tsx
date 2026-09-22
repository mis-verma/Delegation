import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertCircle, X, ChevronLeft, PartyPopper } from 'lucide-react';
import { Modal, Button, DatePicker, TimePicker, Combobox } from '../../../../components';
import {
  useChecklistBulkImportPreviewMutation,
  useChecklistBulkImportPublishMutation,
} from '../../hook';
import type { BulkImportMatchedRow, BulkImportMatchConfidence, BulkImportSummary } from '../../../../api/checklistBulkImport';

interface ChecklistBulkImportModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'schedule' | 'done';

type ReviewRow = {
  rowIndex: number;
  raw: BulkImportMatchedRow['raw'];
  checklistDefinitionId: string;
  checklistConfidence: BulkImportMatchConfidence;
  storeId: string;
  storeConfidence: BulkImportMatchConfidence;
  userId: string;
  userConfidence: BulkImportMatchConfidence;
  excluded: boolean;
};

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls,.pdf';

// Empty = must fix before continuing (danger ring). Fuzzy = auto-matched, worth a second look
// (warning ring) until the admin confirms or changes it. Exact/manually-picked = no ring at all.
const fieldRing = (value: string, confidence: BulkImportMatchConfidence) => {
  if (!value) return 'ring-2 ring-danger/40';
  if (confidence === 'fuzzy') return 'ring-2 ring-warning/40';
  return '';
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDateStr = (v: string) => (v ? new Date(`${v}T00:00:00`) : null);

export const ChecklistBulkImportModal = ({ open, onClose }: ChecklistBulkImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [checklistOptions, setChecklistOptions] = useState<{ value: string; label: string }[]>([]);
  const [storeOptions, setStoreOptions] = useState<{ value: string; label: string }[]>([]);
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [opensTime, setOpensTime] = useState('');
  const [cutoffTime, setCutoffTime] = useState('');
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useChecklistBulkImportPreviewMutation();
  const publishMutation = useChecklistBulkImportPublishMutation();

  const reset = () => {
    setStep('upload');
    setRows([]);
    setWarnings([]);
    setStartDate('');
    setOpensTime('');
    setCutoffTime('');
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    previewMutation.mutate(file, {
      onSuccess: (data) => {
        setChecklistOptions(data.checklists.map((c) => ({ value: c.id, label: c.name })));
        setStoreOptions(data.stores.map((s) => ({ value: s.id, label: s.name })));
        setUserOptions(data.users.map((u) => ({ value: u.id, label: u.name ? `${u.name} (${u.email})` : u.email })));
        setRows(data.rows.map((r) => ({
          rowIndex: r.rowIndex,
          raw: r.raw,
          checklistDefinitionId: r.checklistDefinitionId ?? '',
          checklistConfidence: r.checklistMatchConfidence,
          storeId: r.storeId ?? '',
          storeConfidence: r.storeMatchConfidence,
          userId: r.userId ?? '',
          userConfidence: r.userMatchConfidence,
          excluded: false,
        })));
        setWarnings(data.warnings);
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
  const unresolvedCount = includedRows.filter((r) => !r.checklistDefinitionId || !r.storeId || !r.userId).length;
  const canContinueFromReview = includedRows.length > 0 && unresolvedCount === 0;

  const updateRow = (rowIndex: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)));

  const handlePublish = () => {
    publishMutation.mutate(
      {
        rows: includedRows.map((r) => ({ checklistDefinitionId: r.checklistDefinitionId, storeId: r.storeId, userId: r.userId })),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        opensTime: opensTime || undefined,
        cutoffTime: cutoffTime || undefined,
      },
      { onSuccess: (data) => { setSummary(data); setStep('done'); } },
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk import checklist assignments"
      description="Upload a spreadsheet to assign a checklist to a bunch of stores or people in one go."
      icon={<UploadCloud size={18} className="text-primary-600" />}
      size="3xl"
      footer={
        step === 'review' ? (
          <>
            <Button variant="outline" onClick={() => setStep('upload')}>
              <ChevronLeft size={14} /> Start over
            </Button>
            <div className="flex flex-col items-end gap-1.5">
              {!canContinueFromReview && (
                <p className="text-[11px] font-display text-warning flex items-center gap-1">
                  <AlertCircle size={12} className="shrink-0" />
                  {includedRows.length === 0
                    ? "You've excluded every row — include at least one to continue."
                    : `Match a checklist, store, and person for ${unresolvedCount} more row${unresolvedCount === 1 ? '' : 's'} to continue.`}
                </p>
              )}
              <Button onClick={() => setStep('schedule')} disabled={!canContinueFromReview}>
                Continue
              </Button>
            </div>
          </>
        ) : step === 'schedule' ? (
          <>
            <Button variant="outline" onClick={() => setStep('review')}>
              <ChevronLeft size={14} /> Back
            </Button>
            <Button onClick={handlePublish} isLoading={publishMutation.isPending}>
              Publish
            </Button>
          </>
        ) : step === 'done' ? (
          <Button onClick={handleClose}>Close</Button>
        ) : undefined
      }
    >
      {step === 'upload' && (
        <div className="flex flex-col gap-3">
        {previewMutation.isError && (
          <div role="alert" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 text-danger text-xs font-display">
            <AlertCircle size={14} className="shrink-0" />
            {previewMutation.error instanceof Error ? previewMutation.error.message : "We couldn't read that file — make sure it has the right columns and try again."}
          </div>
        )}
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
          <span className="flex items-center justify-center size-12 rounded-2xl bg-muted/60 text-text-muted border border-border/60">
            <FileSpreadsheet className="size-6" />
          </span>
          <div>
            <p className="text-sm font-display font-semibold text-text">
              {previewMutation.isPending ? 'Reading file…' : 'Drop a file here, or click to browse'}
            </p>
            <p className="text-xs font-display text-text-muted mt-1">
              CSV or Excel works best · PDFs are okay too, but less reliable
            </p>
            <p className="text-[11px] font-display text-text-light mt-2">
              Your file should have columns for Checklist Name, Store, and Person (email or name). Department is optional and just for reference.
            </p>
          </div>
        </label>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          {warnings.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-warning/30 bg-warning/10 text-xs font-display text-warning">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                {warnings.map((w, i) => <span key={i}>{w}</span>)}
              </div>
            </div>
          )}

          <p className="text-xs font-display text-text-muted">
            {includedRows.length} of {rows.length} row{rows.length === 1 ? '' : 's'} included · rows outlined in amber need review.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] px-3 py-2">Checklist</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] px-3 py-2">Store</th>
                  <th className="text-left font-display font-semibold text-text-muted text-[11px] px-3 py-2">Person</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowIndex} className={`border-b border-border/60 last:border-b-0 ${row.excluded ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2 align-top">
                      <Combobox
                        value={row.checklistDefinitionId}
                        onChange={(v) => updateRow(row.rowIndex, { checklistDefinitionId: v, checklistConfidence: 'exact' })}
                        options={checklistOptions}
                        placeholder={row.raw.checklistName || 'Select checklist'}
                        disabled={row.excluded}
                        className={fieldRing(row.checklistDefinitionId, row.checklistConfidence)}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Combobox
                        value={row.storeId}
                        onChange={(v) => updateRow(row.rowIndex, { storeId: v, storeConfidence: 'exact' })}
                        options={storeOptions}
                        placeholder={row.raw.storeName || 'Select store'}
                        disabled={row.excluded}
                        className={fieldRing(row.storeId, row.storeConfidence)}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Combobox
                        value={row.userId}
                        onChange={(v) => updateRow(row.rowIndex, { userId: v, userConfidence: 'exact' })}
                        options={userOptions}
                        placeholder={row.raw.personName || 'Select person'}
                        disabled={row.excluded}
                        className={fieldRing(row.userId, row.userConfidence)}
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-center">
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

      {step === 'schedule' && (
        <div className="flex flex-col gap-4">
          {publishMutation.isError && (
            <div role="alert" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 text-danger text-xs font-display">
              <AlertCircle size={14} className="shrink-0" />
              {publishMutation.error instanceof Error ? publishMutation.error.message : "Couldn't publish this batch — try again."}
            </div>
          )}

          <p className="text-xs font-display text-text-muted">
            Optional — leave blank to keep each checklist's own existing schedule. Set these to apply one shared start date/time window across every checklist touched by this batch.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-display font-semibold text-text px-1">Effective Start Date</label>
            <DatePicker value={parseDateStr(startDate)} onChange={(d) => setStartDate(d ? toDateStr(d) : '')} placeholder="Keep existing" triggerClassName="h-12 rounded-xl px-4" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-display font-semibold text-text-muted px-1">Available From (Opens)</label>
              <TimePicker value={opensTime} onChange={setOpensTime} placeholder="Keep existing" triggerClassName="h-12 rounded-xl px-4" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-display font-semibold text-text-muted px-1">Cut-off By (Closes)</label>
              <TimePicker value={cutoffTime} onChange={setCutoffTime} placeholder="Keep existing" triggerClassName="h-12 rounded-xl px-4" />
            </div>
          </div>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <span className="flex items-center justify-center size-12 rounded-2xl bg-success/10 text-success border border-success/20">
            <PartyPopper className="size-6" />
          </span>
          <p className="text-sm font-display font-semibold text-text">All set!</p>
          <p className="text-xs font-display text-text-muted max-w-sm">
            Updated {summary.updatedDefinitions} checklist{summary.updatedDefinitions === 1 ? '' : 's'}, added{' '}
            {summary.storesAdded} store{summary.storesAdded === 1 ? '' : 's'} and{' '}
            {summary.assigneesAdded} people.
          </p>

          {summary.failed.length > 0 && (
            <div className="w-full max-w-sm text-left mt-2">
              <p className="text-xs font-display font-semibold text-danger flex items-center gap-1.5 mb-1.5">
                <AlertCircle size={13} /> {summary.failed.length} checklist{summary.failed.length === 1 ? '' : 's'} failed
              </p>
              <ul className="flex flex-col gap-1 text-[11px] font-display text-text-muted max-h-32 overflow-y-auto">
                {summary.failed.map((f) => (
                  <li key={f.definitionId}>
                    {checklistOptions.find((c) => c.value === f.definitionId)?.label ?? f.definitionId}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
