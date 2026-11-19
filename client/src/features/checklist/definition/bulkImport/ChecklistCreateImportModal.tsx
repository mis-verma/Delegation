import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, FileSpreadsheet, AlertCircle, ChevronLeft, PartyPopper, Download, Camera, Trash2, Store as StoreIcon, User, Repeat, CheckCircle2, Clock, ClipboardPaste } from 'lucide-react';
import {
  Modal, Button, DatePicker, TimePicker, InlineError, NoticeBanner, Switch, IconChip, useConfirm,
} from '../../../../components';
import { UserMultiSelect } from '../../../../components/userMultiSelect';
import { SelectDropdown } from '../../../../components/dropdown/SelectDropdown';
import { PANEL_CLASS } from '../../../../components/entityCard';
import { cn } from '@/lib/utils';
import { notifyError } from '../../../../lib/queryHelpers';
import { useStoresQuery } from '../../../tickets/hook';
import { RECURRENCE_LABEL } from '../../recurrenceRegistry';
import {
  useChecklistCreateImportPreviewMutation,
  useChecklistCreateImportPublishMutation,
} from '../../hook';
import { checklistCreateImportApi } from '../../../../api/checklistCreateImport';
import type { CreateImportGroupPreview, CreateImportMatchedRow, CreateImportSummary } from '../../../../api/checklistCreateImport';
import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';
import { pastedRowsToCsv } from './pastedTable';
import { DEFAULT_CUTOFF_TIME, DEFAULT_LATE_UNTIL_TIME, DEFAULT_OPENS_TIME } from '../builder/builderModel';

interface ChecklistCreateImportModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'upload' | 'review' | 'schedule' | 'done';
type ResponseMode = 'SHARED' | 'PER_DEPARTMENT' | 'PER_USER';

const SUPPORTED_RECURRENCES: ChecklistRecurrence[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'];
const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls,.pdf';

type EditableGroup = {
  key: string;
  name: string;
  recurrence: ChecklistRecurrence | '';
  excluded: boolean;
  items: { label: string; photoRequired: boolean; conflict: boolean }[];
  personIds: string[];
  storeIds: string[];
  opensTime: string;
  cutoffTime: string;
  lateUntilTime: string;
  timeConflict: boolean;
  timeProblems: string[];
};

const TIMED: ReadonlySet<ChecklistRecurrence | ''> = new Set(['DAILY', 'ONE_TIME']);

const clock12 = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const toEditable = (g: CreateImportGroupPreview): EditableGroup => ({
  key: g.key,
  name: g.checklistName,
  recurrence: SUPPORTED_RECURRENCES.includes(g.recurrence as ChecklistRecurrence) ? (g.recurrence as ChecklistRecurrence) : '',
  excluded: false,
  items: g.items.map((i) => ({ ...i })),
  personIds: g.personIds,
  storeIds: g.storeIds,
  opensTime: g.opensTime ?? '',
  cutoffTime: g.cutoffTime ?? '',
  lateUntilTime: g.lateUntilTime ?? '',
  timeConflict: g.timeConflict,
  timeProblems: g.timeProblems,
});

const groupProblem = (g: EditableGroup): string | null => {
  if (!g.name.trim()) return 'Needs a checklist name';
  if (!g.recurrence) return 'Pick how often it runs';
  if (g.items.length === 0) return 'Needs at least one question';
  if (g.storeIds.length === 0) return 'Pick at least one store';
  if (g.personIds.length === 0) return 'Pick at least one person';
  return null;
};

const RESPONSE_MODE_OPTIONS: { value: ResponseMode; label: string; hint: string }[] = [
  { value: 'SHARED', label: 'One run, shared', hint: 'Everyone sees the same run and ticks off the same list together.' },
  { value: 'PER_USER', label: 'One run per person', hint: 'Each assignee gets their own copy to fill in separately.' },
  { value: 'PER_DEPARTMENT', label: 'One run per department', hint: 'Each department sharing this checklist gets its own copy.' },
];

export const ChecklistCreateImportModal = ({ open, onClose }: ChecklistCreateImportModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [rawRows, setRawRows] = useState<CreateImportMatchedRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [startDate, setStartDate] = useState('');
  const [opensTime, setOpensTime] = useState(DEFAULT_OPENS_TIME);
  const [cutoffTime, setCutoffTime] = useState(DEFAULT_CUTOFF_TIME);
  const [lateUntilTime, setLateUntilTime] = useState(DEFAULT_LATE_UNTIL_TIME);
  const [pasted, setPasted] = useState('');
  const [responseMode, setResponseMode] = useState<ResponseMode>('SHARED');
  const [summary, setSummary] = useState<CreateImportSummary | null>(null);
  const [downloading, setDownloading] = useState(false);
  const confirm = useConfirm();

  const { data: liveStores } = useStoresQuery();
  const previewMutation = useChecklistCreateImportPreviewMutation();
  const publishMutation = useChecklistCreateImportPublishMutation();

  const handleTemplate = async () => {
    setDownloading(true);
    try {
      await checklistCreateImportApi.downloadTemplate();
    } catch (err) {
      notifyError(err, "Couldn't download the template. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setGroups([]);
    setRawRows([]);
    setWarnings([]);
    setStartDate('');
    setOpensTime(DEFAULT_OPENS_TIME);
    setCutoffTime(DEFAULT_CUTOFF_TIME);
    setLateUntilTime(DEFAULT_LATE_UNTIL_TIME);
    setPasted('');
    setResponseMode('SHARED');
    setSummary(null);
    previewMutation.reset();
    publishMutation.reset();
  };

  const handleClose = async () => {
    if (publishMutation.isPending) return;
    if (step === 'review' || step === 'schedule') {
      const leave = await confirm({
        title: 'Close this import?',
        description: 'The checklists you matched will be lost and you will need to upload the file again.',
        confirmLabel: 'Close',
        cancelLabel: 'Keep working',
        variant: 'danger',
      });
      if (!leave) return;
    }
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    previewMutation.mutate(file, {
      onSuccess: (data) => {
        setStoreOptions(data.stores);
        setRawRows(data.rows);
        setGroups(data.groups.map(toEditable));
        setWarnings(data.warnings);
        setStep('review');
      },
    });
  };

  const pastedTable = useMemo(() => (pasted.trim() ? pastedRowsToCsv(pasted) : null), [pasted]);
  const handlePasted = () => {
    if (!pastedTable) return;
    handleFile(new File([pastedTable.csv], 'pasted-rows.csv', { type: 'text/csv' }));
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
    if (!ACCEPTED_EXTENSIONS.split(',').map((x) => x.trim().toLowerCase()).includes(ext)) {
      toast.error('That file type is not supported. Use CSV, Excel or PDF.');
      return;
    }
    handleFile(file);
  };

  const updateGroup = (key: string, patch: Partial<EditableGroup>) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  const updateItem = (key: string, index: number, patch: Partial<EditableGroup['items'][number]>) =>
    setGroups((prev) => prev.map((g) => (g.key !== key ? g : { ...g, items: g.items.map((it, i) => (i === index ? { ...it, ...patch, conflict: false } : it)) })));

  const removeItem = (key: string, index: number) =>
    setGroups((prev) => prev.map((g) => (g.key !== key ? g : { ...g, items: g.items.filter((_, i) => i !== index) })));

  const includedGroups = useMemo(() => groups.filter((g) => !g.excluded), [groups]);
  const problems = useMemo(
    () => includedGroups.map((g) => ({ key: g.key, problem: groupProblem(g) })).filter((p) => p.problem),
    [includedGroups],
  );
  const canContinueFromReview = includedGroups.length > 0 && problems.length === 0;

  const handlePublish = () => {
    publishMutation.mutate(
      {
        groups: includedGroups.map((g) => ({
          name: g.name.trim(),
          recurrence: g.recurrence as ChecklistRecurrence,
          storeIds: g.storeIds,
          assigneeIds: g.personIds,
          items: g.items.map((i) => ({ label: i.label, photoRequired: i.photoRequired })),
          opensTime: g.opensTime || undefined,
          cutoffTime: g.cutoffTime || undefined,
          lateUntilTime: g.lateUntilTime || undefined,
        })),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        opensTime: opensTime || undefined,
        cutoffTime: cutoffTime || undefined,
        lateUntilTime: lateUntilTime || undefined,
        responseMode,
      },
      { onSuccess: (data) => { setSummary(data); setStep('done'); } },
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk create checklists"
      description="Download the template, fill one question per row, then upload it."
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
                <p className="t-meta font-display text-warning flex items-center gap-1 max-w-sm text-right">
                  <AlertCircle size={12} className="shrink-0" />
                  {includedGroups.length === 0
                    ? "You've excluded every checklist. Include at least one to continue."
                    : `Fix ${problems.length} checklist${problems.length === 1 ? '' : 's'} to continue.`}
                </p>
              )}
              <Button onClick={() => setStep('schedule')} disabled={!canContinueFromReview}>
                Continue with {includedGroups.length} checklist{includedGroups.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        ) : step === 'schedule' ? (
          <>
            <Button variant="outline" onClick={() => setStep('review')}>
              <ChevronLeft size={14} /> Back
            </Button>
            <Button onClick={handlePublish} isLoading={publishMutation.isPending}>
              Create {includedGroups.length} checklist{includedGroups.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : step === 'done' ? (
          <Button onClick={handleClose}>Close</Button>
        ) : undefined
      }
    >
      {step === 'upload' && (
        <div className="flex flex-col gap-5">
          {previewMutation.isError && (
            <InlineError
              message={previewMutation.error instanceof Error ? previewMutation.error.message : "We couldn't read that file. Make sure it has the right columns and try again."}
            />
          )}

          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 1</span>
              <p className="t-card font-display font-bold text-text">Get the template</p>
              <p className="t-meta text-text-secondary">A sheet with dropdown lists for type, person and store.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleTemplate()} isLoading={downloading} className="mt-auto max-sm:h-11">
                <Download size={15} aria-hidden />
                Download template
              </Button>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 2</span>
              <p className="t-card font-display font-bold text-text">Fill one question per row</p>
              <p className="t-meta text-text-secondary">Give rows the same Checklist Name and Type to share one checklist between several people or stores.</p>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4">
              <span className="t-meta font-display font-bold text-text-muted">Step 3</span>
              <p className="t-card font-display font-bold text-text">Upload and check</p>
              <p className="t-meta text-text-secondary">You see every checklist grouped and can fix anything before it is created.</p>
            </li>
          </ol>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 py-14 px-6 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-colors',
              dragOver ? 'border-primary-500 bg-primary-500/5' : 'border-border/80 hover:border-primary-400',
              previewMutation.isPending && 'pointer-events-none opacity-60',
            )}
          >
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <span className="flex items-center justify-center size-12 rounded-xl bg-muted/60 text-text-muted border border-border/60">
              <FileSpreadsheet className="size-6" />
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-display font-semibold text-text">
                {previewMutation.isPending ? 'Reading file…' : 'Drop a file here, or click to browse'}
              </p>
              <p className="t-meta font-display text-text-muted">
                CSV or Excel works best · PDFs are okay too, but less reliable
              </p>
            </div>
          </label>

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
            <label htmlFor="create-import-paste" className="flex items-center gap-1.5 t-card font-display font-bold text-text">
              <ClipboardPaste size={15} aria-hidden className="text-text-muted" />
              Or paste rows from Excel or Google Sheets
            </label>
            <p className="t-meta text-text-secondary">Copy the cells including the header row, then paste them here.</p>
            <textarea
              id="create-import-paste"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder={'Checklist Name	Type	Question	Photos Required	Person	Store	Time Slot'}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-meta text-text-muted">
                {!pasted.trim() ? 'Nothing pasted yet.' : pastedTable ? `${pastedTable.dataRows} row${pastedTable.dataRows === 1 ? '' : 's'} found.` : 'Paste a header row and at least one row under it.'}
              </p>
              <Button type="button" size="sm" onClick={handlePasted} disabled={!pastedTable} isLoading={previewMutation.isPending} className="max-sm:h-11">
                Read pasted rows
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          {warnings.length > 0 && (
            <NoticeBanner tone="warning" icon={AlertCircle}>
              <div className="flex flex-col gap-0.5">
                {warnings.map((w, i) => <span key={i}>{w}</span>)}
              </div>
            </NoticeBanner>
          )}

          <p className="t-meta font-display text-text-muted">
            {rawRows.length} row{rawRows.length === 1 ? '' : 's'} grouped into {groups.length} checklist{groups.length === 1 ? '' : 's'}.
          </p>

          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {groups.map((g) => {
              const problem = groupProblem(g);
              return (
                <div key={g.key} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4', g.excluded && 'opacity-50')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <input
                        value={g.name}
                        onChange={(e) => updateGroup(g.key, { name: e.target.value })}
                        disabled={g.excluded}
                        placeholder="Checklist name"
                        className="h-10 min-w-48 flex-1 rounded-lg border border-border bg-surface px-3 text-sm font-display font-semibold text-text outline-none focus:border-primary-500 disabled:opacity-60"
                      />
                      <div className="w-44">
                        <SelectDropdown
                          value={g.recurrence}
                          onChange={(v) => updateGroup(g.key, { recurrence: v as ChecklistRecurrence })}
                          disabled={g.excluded}
                          aria-label={`How often ${g.name || 'this checklist'} runs`}
                          options={[
                            { value: '', label: 'Pick how often' },
                            ...SUPPORTED_RECURRENCES.map((r) => ({ value: r, label: RECURRENCE_LABEL[r] })),
                          ]}
                        />
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => updateGroup(g.key, { excluded: !g.excluded })}>
                      {g.excluded ? 'Include' : 'Exclude'}
                    </Button>
                  </div>

                  {TIMED.has(g.recurrence) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <IconChip
                        icon={Clock}
                        tone="bg-primary-600"
                        label={g.cutoffTime || g.opensTime
                          ? `${g.opensTime ? clock12(g.opensTime) : 'Start of day'} to ${g.cutoffTime ? clock12(g.cutoffTime) : 'end of day'}${g.lateUntilTime ? `, late till ${clock12(g.lateUntilTime)}` : ''}`
                          : 'Uses the default times on the next step'}
                      />
                      {g.timeConflict && <IconChip icon={AlertCircle} tone="bg-warning" label="Rows gave different times, the first one is used" labelClassName="text-warning" />}
                      {g.timeProblems.length > 0 && <IconChip icon={AlertCircle} tone="bg-warning" label={`Couldn't read: ${g.timeProblems.join(', ')}`} labelClassName="text-warning" />}
                    </div>
                  )}

                  {problem && !g.excluded && (
                    <p className="t-meta font-display text-warning flex items-center gap-1.5">
                      <AlertCircle size={12} className="shrink-0" /> {problem}
                    </p>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
                      <Repeat size={13} aria-hidden /> Questions ({g.items.length})
                    </span>
                    <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
                      {g.items.map((item, index) => (
                        <li key={index} className="flex items-center gap-2 px-3 py-2">
                          <span className="min-w-0 flex-1 truncate t-meta text-text">{item.label}</span>
                          {item.conflict && (
                            <IconChip icon={AlertCircle} tone="bg-warning" label="Photo flag disagreed" labelClassName="text-warning" />
                          )}
                          <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                            <Camera size={13} className="text-text-light" aria-hidden />
                            <Switch checked={item.photoRequired} onChange={(v) => updateItem(g.key, index, { photoRequired: v })} disabled={g.excluded} />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeItem(g.key, index)}
                            aria-label={`Remove question: ${item.label}`}
                            disabled={g.excluded}
                            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
                        <StoreIcon size={13} aria-hidden /> Stores
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(liveStores ?? storeOptions).map((s) => {
                          const active = g.storeIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              disabled={g.excluded}
                              aria-pressed={active}
                              onClick={() => updateGroup(g.key, { storeIds: active ? g.storeIds.filter((id) => id !== s.id) : [...g.storeIds, s.id] })}
                              className={cn(
                                'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 t-meta font-display font-semibold transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
                                active ? 'border-primary-500/60 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border bg-surface text-text-secondary hover:border-border-hover',
                              )}
                            >
                              {active && <CheckCircle2 size={12} aria-hidden />}
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
                        <User size={13} aria-hidden /> People
                      </span>
                      <UserMultiSelect
                        storeIds={g.storeIds}
                        selected={g.personIds}
                        onChange={(ids) => updateGroup(g.key, { personIds: ids })}
                        all={g.storeIds.length === 0}
                        emptyHint="Pick a store to see who can be assigned."
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'schedule' && (
        <div className="flex flex-col gap-4">
          {publishMutation.isError && (
            <InlineError
              message={publishMutation.error instanceof Error ? publishMutation.error.message : "Couldn't create these checklists. Try again."}
            />
          )}

          <p className="t-meta font-display text-text-muted">
            Applies to all {includedGroups.length} checklist{includedGroups.length === 1 ? '' : 's'} in this batch. Times from the sheet win over these, and only daily and one-time checklists use times.
          </p>

          <div role="group" aria-labelledby="create-start-date-label" className="flex flex-col gap-1.5">
            <span id="create-start-date-label" className="t-meta font-display font-semibold text-text px-1">Start date</span>
            <DatePicker
              value={startDate ? new Date(`${startDate}T00:00`) : null}
              onChange={(d) => setStartDate(d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '')}
              placeholder="Today"
              triggerClassName="h-11 rounded-xl px-4"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div role="group" aria-labelledby="create-opens-label" className="flex flex-col gap-1.5">
              <span id="create-opens-label" className="t-meta font-display font-semibold text-text-muted px-1">Opens</span>
              <TimePicker label="Opens" value={opensTime} onChange={setOpensTime} placeholder="Open all day" />
            </div>
            <div role="group" aria-labelledby="create-closes-label" className="flex flex-col gap-1.5">
              <span id="create-closes-label" className="t-meta font-display font-semibold text-text-muted px-1">Closes</span>
              <TimePicker label="Closes" value={cutoffTime} onChange={setCutoffTime} placeholder="Open all day" />
            </div>
            <div role="group" aria-labelledby="create-late-label" className="flex flex-col gap-1.5">
              <span id="create-late-label" className="t-meta font-display font-semibold text-text-muted px-1">Late until</span>
              <TimePicker label="Late until" value={lateUntilTime} onChange={setLateUntilTime} placeholder="No late window" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="t-meta font-display font-semibold text-text px-1">How it's filled</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {RESPONSE_MODE_OPTIONS.map((opt) => {
                const active = responseMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setResponseMode(opt.value)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors duration-150 cursor-pointer',
                      active ? 'border-primary-500/60 bg-primary-500/8' : 'border-border bg-surface hover:border-primary-300',
                    )}
                  >
                    <span className={cn('t-meta font-display font-bold', active ? 'text-primary-700 dark:text-primary-300' : 'text-text')}>{opt.label}</span>
                    <span className="t-meta text-text-muted">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 'done' && summary && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <span className={cn('flex items-center justify-center size-12 rounded-xl border', summary.created === 0 && summary.failed.length > 0 ? 'bg-danger/10 text-danger border-danger/20' : 'bg-success/10 text-success border-success/20')}>
            {summary.created === 0 && summary.failed.length > 0 ? <AlertCircle className="size-6" /> : <PartyPopper className="size-6" />}
          </span>
          <p className="text-sm font-display font-semibold text-text">
            {summary.created === 0 && summary.failed.length > 0 ? 'Nothing was created' : summary.failed.length > 0 ? 'Done, with some failures' : 'All set!'}
          </p>
          <p className="t-meta font-display text-text-muted max-w-sm">
            Created {summary.created} checklist{summary.created === 1 ? '' : 's'}.
          </p>

          {summary.failed.length > 0 && (
            <div className="flex flex-col gap-1.5 w-full max-w-sm text-left">
              <p className="t-meta font-display font-semibold text-danger flex items-center gap-1.5">
                <AlertCircle size={13} /> {summary.failed.length} checklist{summary.failed.length === 1 ? '' : 's'} failed
              </p>
              <ul className="flex flex-col gap-1 t-meta font-display text-text-muted max-h-32 overflow-y-auto">
                {summary.failed.map((f, i) => (
                  <li key={i}>
                    <span className="font-semibold text-text">{f.name}</span>: {f.message}
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
