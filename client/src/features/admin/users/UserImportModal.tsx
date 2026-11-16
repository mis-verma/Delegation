import { useMemo, useState, type DragEvent } from 'react';
import { AlertCircle, Building2, Check, CheckCircle2, Download, FileSpreadsheet, Store, UploadCloud, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconChip, Modal, ToggleChip } from '../../../components';
import { csvBlob, downloadBlob } from '../../../lib/exportTable';
import type { UserImportPreview, UserImportResult, UserImportRow } from '../../../api/admin';
import { useImportUsersMutation, useUserImportPreviewMutation } from '../hook';
import { ROLE_LABEL } from './userImportDisplay';

interface UserImportModalProps {
  onClose: () => void;
}

type Draft = UserImportRow & { include: boolean; problem: string | null };
type Loaded = Omit<UserImportPreview, 'rows'> & { rows: Draft[]; fileName: string };

const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLUMNS: { name: string; help: string }[] = [
  { name: 'Name', help: 'Required. Or use First name and Last name.' },
  { name: 'Email', help: 'Required. Their login. Must be new.' },
  { name: 'Role', help: 'Optional. User, Agent, Manager, Senior or Approval manager. Blank is User.' },
  { name: 'Department', help: 'Optional. Must match an existing department.' },
  { name: 'Store', help: 'Optional. Must match an existing store.' },
  { name: 'Phone', help: 'Optional. 10 to 15 digits.' },
  { name: 'Gender', help: 'Optional. Female or Male.' },
];

const downloadTemplate = () =>
  downloadBlob(
    csvBlob([
      ['Name', 'Email', 'Role', 'Department', 'Store', 'Phone', 'Gender'],
      ['Asha Verma', 'asha@example.com', 'User', 'Sales', 'Solan', '9876543210', 'Female'],
      ['Ravi Kumar', 'ravi@example.com', 'Manager', 'Accounts', 'Rohru', '', 'Male'],
    ]),
    'people-import-template.csv',
  );

const problemOf = (row: UserImportRow): string | null => {
  if (!row.firstName) return 'Name is missing';
  if (!row.email) return 'Email is missing';
  if (row.emailInvalid) return 'Email is not valid';
  if (row.alreadyExists) return 'Already has an account';
  if (row.duplicateInFile) return 'Email appears twice in the file';
  if (row.phoneInvalid) return `Phone "${row.phoneText}" is not valid`;
  if (row.departmentText && !row.departmentId) return `No department called "${row.departmentText}"`;
  if (row.storeText && !row.storeId) return `No store called "${row.storeText}"`;
  if (!row.roleMatched) return `Role "${row.roleText}" is not recognised`;
  return null;
};

const fullName = (row: UserImportRow) => `${row.firstName}${row.lastName ? ` ${row.lastName}` : ''}`;

export const UserImportModal = ({ onClose }: UserImportModalProps) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [result, setResult] = useState<UserImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sendSetupCode, setSendSetupCode] = useState(true);
  const previewMut = useUserImportPreviewMutation();
  const importMut = useImportUsersMutation();

  const readFile = (file: File) => {
    previewMut.mutate(file, {
      onSuccess: (data) => setLoaded({
        ...data,
        fileName: file.name,
        rows: data.rows.map((r) => {
          const problem = problemOf(r);
          return { ...r, problem, include: !problem };
        }),
      }),
    });
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const rows = useMemo(() => loaded?.rows ?? [], [loaded]);
  const chosen = rows.filter((r) => r.include);
  const blocked = rows.filter((r) => r.problem).length;
  const pickable = rows.filter((r) => !r.problem);
  const allChosen = pickable.length > 0 && chosen.length === pickable.length;

  const toggle = (rowIndex: number) =>
    setLoaded((prev) => prev && { ...prev, rows: prev.rows.map((r) => (r.rowIndex === rowIndex && !r.problem ? { ...r, include: !r.include } : r)) });
  const setAll = (include: boolean) =>
    setLoaded((prev) => prev && { ...prev, rows: prev.rows.map((r) => (r.problem ? r : { ...r, include })) });

  const submit = () => {
    if (!chosen.length) return;
    importMut.mutate(
      {
        users: chosen.map((r) => ({ rowIndex: r.rowIndex, email: r.email, firstName: r.firstName, lastName: r.lastName, role: r.role, departmentId: r.departmentId, storeId: r.storeId, phone: r.phone, gender: r.gender })),
        sendSetupCode,
      },
      { onSuccess: setResult },
    );
  };

  const footer = result ? (
    <div className="flex w-full justify-end">
      <Button onClick={onClose} className="max-sm:h-11 max-sm:w-full">Done</Button>
    </div>
  ) : loaded ? (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button variant="outline" onClick={() => setLoaded(null)} disabled={importMut.isPending} className="max-sm:h-11">Choose another file</Button>
      <Button onClick={submit} disabled={!chosen.length} isLoading={importMut.isPending} className="max-sm:h-11">
        {chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}` : 'Nobody to add'}
      </Button>
    </div>
  ) : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add people from a file"
      description={result ? 'Import finished' : loaded ? loaded.fileName : 'Upload a CSV or Excel (.xlsx) file. You check every row before anyone is added.'}
      icon={<UploadCloud size={18} aria-hidden="true" />}
      size="xl"
      dirty={!!loaded && !result}
      footer={footer}
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <p className="t-card font-display font-bold text-text">{result.created} {result.created === 1 ? 'person' : 'people'} added</p>
              <p className="t-meta text-text-secondary">
                {sendSetupCode
                  ? `${result.setupCodesSent} got a code by email to set their password.`
                  : 'No emails were sent. Use "Send setup code" on each person when they should log in.'}
              </p>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="flex flex-col gap-2" role="alert">
              <p className="t-card font-display font-bold text-danger">{result.failed.length} could not be added</p>
              <ul className="flex flex-col gap-1.5">
                {result.failed.map((f) => (
                  <li key={f.rowIndex} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-danger/5 px-3 py-2 t-meta">
                    <span className="font-display font-semibold text-text">Row {f.rowIndex}, {f.email}</span>
                    <span className="text-danger">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : !loaded ? (
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
            <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
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
              <span className="t-meta font-medium text-text-muted">CSV or Excel (.xlsx), up to 300 people</span>
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
            <p className="t-meta text-text-muted">Admin, Owner and PC accounts can not be added here. Everyone starts with a temporary password they must change.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="t-meta font-medium text-text-muted" aria-live="polite">
              {chosen.length} of {rows.length} will be added
              {blocked > 0 && <span className="text-danger"> · {blocked} can not be added</span>}
            </p>
            <button
              type="button"
              onClick={() => setAll(!allChosen)}
              disabled={pickable.length === 0}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-2.5 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 pointer-coarse:min-h-11 dark:text-primary-300"
            >
              {allChosen ? 'Unpick all' : 'Pick all'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip on={sendSetupCode} onClick={() => setSendSetupCode((v) => !v)}>Email each person a setup code</ToggleChip>
          </div>

          {(loaded.truncated || loaded.skippedEmpty > 0 || loaded.unknownColumns.length > 0) && (
            <p className="flex items-start gap-1.5 rounded-lg bg-surface-hover/60 px-3 py-2 t-meta text-text-secondary">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {loaded.truncated && 'Only the first 300 rows are shown. Split the file to add the rest. '}
                {loaded.skippedEmpty > 0 && `${loaded.skippedEmpty} empty ${loaded.skippedEmpty === 1 ? 'row was' : 'rows were'} skipped. `}
                {loaded.unknownColumns.length > 0 && `Ignored columns: ${loaded.unknownColumns.join(', ')}.`}
              </span>
            </p>
          )}

          <ul className="flex flex-col gap-2" aria-label="People in your file">
            {rows.map((row) => (
              <li key={row.rowIndex}>
                <label
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 transition-[border-color,background-color,opacity] duration-200 ease-out',
                    row.problem ? 'cursor-not-allowed border-danger/30 bg-danger/5' : 'cursor-pointer',
                    !row.problem && (row.include ? 'border-border/70 bg-surface hover:border-primary-500/40' : 'border-border/40 bg-surface-hover/30 opacity-60'),
                  )}
                >
                  <input type="checkbox" checked={row.include} disabled={!!row.problem} onChange={() => toggle(row.rowIndex)} className="peer sr-only" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40',
                      row.problem ? 'border-danger/40 text-transparent' : row.include ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover text-transparent',
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 flex-col">
                      <span className="line-clamp-1 t-card font-display font-semibold text-text">{fullName(row) || 'No name'}</span>
                      <span className="line-clamp-1 break-all t-meta text-text-muted">{row.email || 'No email'}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <IconChip icon={UserRound} tone="bg-primary-600" label={ROLE_LABEL[row.role]} />
                      {row.departmentId && <IconChip icon={Building2} tone="bg-coral-500" label={row.departmentText ?? ''} />}
                      {row.storeId && <IconChip icon={Store} tone="bg-info" label={row.storeText ?? ''} />}
                    </span>
                    {row.problem && (
                      <span className="flex items-start gap-1.5 t-meta font-medium text-danger">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                        Row {row.rowIndex}: {row.problem}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};
