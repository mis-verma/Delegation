import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Download, FileSpreadsheet, FileUp } from 'lucide-react';
import { Button, Combobox, Modal, TagChip } from '../../components';
import { notifyError } from '../../lib/queryHelpers';
import { categoryApi, type CategoryHistoryPreview, type CategoryPriority, type CategoryProposal } from '../../api/categories';
import { tagApi } from '../../api/tags';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { useCreateManyCategoriesMutation, useDownloadCategoriesMutation } from './hook';
import { formatTatHours } from './tatFormat';

interface ImportCategoriesModalProps {
  onClose: () => void;
}

type Row = CategoryProposal & { selected: boolean; hours: string };

const FIELD = 'w-20 rounded-md border border-border bg-surface px-2 py-1.5 t-meta text-text outline-none focus:border-primary-600';
const MIN_ROWS_BY_DEFAULT = 3;
const PRIORITY_VALUES: CategoryPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PRIORITY_OPTIONS = PRIORITY_VALUES.map((value) => ({ value, label: PRIORITY_CONFIG[value].label }));

const SAMPLE_FILE = [
  'Category,Sub Category,Department,Assigned To,Labels,Priority,Due Hours',
  'Printer not working,Toner,IT Department,nitin@yourcompany.in,Hardware,High,24',
  'Printer not working,Paper jam,IT Department,nitin@yourcompany.in,Hardware,High,24',
  'Bank change,,Accounts Department,,,Medium,48',
].join('\r\n');

const downloadSample = () => {
  const url = URL.createObjectURL(new Blob(['﻿', SAMPLE_FILE], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'categories-sample.csv';
  link.click();
  URL.revokeObjectURL(url);
};

const newSubcategories = (row: CategoryProposal) => row.subcategories.filter((sub) => !sub.exists);

const isActionable = (row: CategoryProposal) => !row.exists || newSubcategories(row).length > 0;

const toRows = (data: CategoryHistoryPreview): Row[] => {
  const minRows = data.isList ? 1 : MIN_ROWS_BY_DEFAULT;
  return data.proposals.map((p) => ({
    ...p,
    selected: p.exists ? newSubcategories(p).length > 0 : !!p.departmentId && p.rowCount >= minRows,
    hours: p.tatHours ? String(p.tatHours) : '',
  }));
};

const labelKey = (name: string) => name.trim().toLowerCase();

export const ImportCategoriesModal = ({ onClose }: ImportCategoriesModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CategoryHistoryPreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [reading, setReading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createMany = useCreateManyCategoriesMutation();
  const download = useDownloadCategoriesMutation();

  const read = async (next: File, column?: string) => {
    setReading(true);
    try {
      const data = await categoryApi.historyPreview(next, column);
      setFile(next);
      setPreview(data);
      setRows(toRows(data));
    } catch (err) {
      notifyError(err, "Couldn't read that file. Check it and try again.");
    } finally {
      setReading(false);
    }
  };

  const patch = (key: string, change: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const chosen = rows.filter((r) => r.selected && isActionable(r));
  const chosenNew = chosen.filter((r) => !r.exists);
  const needsTeam = chosenNew.filter((r) => !r.departmentId).length;
  const badHours = chosenNew.filter((r) => r.hours.trim() && !(Number(r.hours) > 0)).length;
  const canCreate = chosen.length > 0 && needsTeam === 0 && badHours === 0;
  const subcategoryTotal = chosen.reduce((sum, r) => sum + newSubcategories(r).length, 0);

  const submit = async () => {
    setPreparing(true);
    try {
      const made = new Map<string, string>();
      const missing = new Map<string, string>();
      for (const row of chosenNew) {
        for (const label of row.labels) if (!label.tagId && !missing.has(labelKey(label.name))) missing.set(labelKey(label.name), label.name);
      }
      for (const [key, name] of missing) {
        const created = await tagApi.create({ name });
        made.set(key, created.data.id);
      }
      if (missing.size > 0) await queryClient.invalidateQueries({ queryKey: ['tags'] });

      createMany.mutate(
        chosen.map((r) => ({
          name: r.name,
          departmentId: r.departmentId ?? '',
          tatHours: r.hours.trim() ? Number(r.hours) : null,
          priority: r.priority,
          assigneeIds: r.assigneeId ? [r.assigneeId] : undefined,
          tagIds: r.labels.map((l) => l.tagId ?? made.get(labelKey(l.name))).filter((id): id is string => !!id),
          existingCategoryId: r.existingCategoryId ?? undefined,
          subcategories: newSubcategories(r).map((sub) => ({ name: sub.name })),
        })),
        { onSuccess: ({ failed }) => { if (failed.length === 0) onClose(); } },
      );
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't add the new labels. ${err.message}` : "Couldn't add the new labels. Try again.");
    } finally {
      setPreparing(false);
    }
  };

  const departmentOptions = (preview?.departments ?? []).map((d) => ({ value: d.id, label: d.name }));
  const peopleOptions = (preview?.people ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }));

  const addLabel = !chosen.length
    ? 'Tick the ones to add'
    : chosenNew.length > 0
      ? `Add ${chosenNew.length} ${chosenNew.length === 1 ? 'category' : 'categories'}${subcategoryTotal ? ` and ${subcategoryTotal} sub ${subcategoryTotal === 1 ? 'category' : 'categories'}` : ''}`
      : `Add ${subcategoryTotal} sub ${subcategoryTotal === 1 ? 'category' : 'categories'}`;

  const footer = preview ? (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => { setPreview(null); setFile(null); setRows([]); }} className="max-sm:h-11">Choose another file</Button>
      <div className="flex min-w-0 flex-col items-end gap-1 text-right">
        {chosen.length > 0 && !canCreate && (
          <p className="flex items-center gap-1 t-meta font-display text-danger">
            <AlertCircle size={12} className="shrink-0" aria-hidden />
            {needsTeam > 0 ? `${needsTeam} need a team.` : 'Check the due hours.'}
          </p>
        )}
        <Button type="button" variant="primary" size="sm" disabled={!canCreate} isLoading={createMany.isPending || preparing} onClick={() => void submit()} className="max-sm:h-11">
          {addLabel}
        </Button>
      </div>
    </>
  ) : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      icon={<FileUp className="size-5" />}
      title="Add categories from a file"
      description="Upload a list of categories (Excel or CSV). Check the list, then add the ones you want."
      footer={footer}
      size="3xl"
    >
      {!preview ? (
        <>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void read(f); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-12 text-center transition-colors ${dragOver ? 'border-primary-600 bg-primary-500/5' : 'border-border hover:border-primary-600'} ${reading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }}
          />
          <span className="flex size-12 items-center justify-center rounded-lg border border-border bg-surface-hover text-text-muted">
            <FileSpreadsheet className="size-6" />
          </span>
          <div>
            <p className="text-sm font-display font-semibold text-text">{reading ? 'Reading file…' : 'Drop your file here, or tap to choose it'}</p>
            <p className="mt-1 t-meta text-text-muted">Excel (.xlsx) or CSV with a Category column</p>
          </div>
        </label>
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-hover/30 p-4">
          <p className="text-sm font-display font-semibold text-text">How to make the file</p>
          <p className="t-meta text-text-secondary">The first row holds the column names, in this order. Repeat the category on a new row for each sub category.</p>
          <ul className="flex flex-col gap-1.5 t-meta text-text-secondary">
            <li><strong className="font-semibold text-text">Category</strong> (needed): the name people will pick.</li>
            <li><strong className="font-semibold text-text">Sub Category</strong> (optional): one name per row.</li>
            <li><strong className="font-semibold text-text">Department</strong>: the team that handles it. Use the name exactly as in Karya.</li>
            <li><strong className="font-semibold text-text">Assigned To</strong> (optional): a person's email, or full name.</li>
            <li><strong className="font-semibold text-text">Labels</strong> (optional): one or more, separated by commas. New labels are created for you.</li>
            <li><strong className="font-semibold text-text">Priority</strong> (optional): Low, Medium, High or Critical.</li>
            <li><strong className="font-semibold text-text">Due Hours</strong> (optional): usual hours to finish, like 24 or 48.</li>
          </ul>
          <p className="t-meta text-text-muted">A category with no person is sent to its department head to pick. A category with no hours uses the standard due time. Names already in Karya are skipped, but new sub categories under them are added.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadSample} className="max-sm:h-11">
              Download a sample file
            </Button>
            <Button type="button" variant="outline" size="sm" isLoading={download.isPending} onClick={() => download.mutate('xlsx')} className="max-sm:h-11">
              <Download size={14} aria-hidden />
              Download my current list
            </Button>
          </div>
        </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="t-meta text-text-secondary">
              {preview.totalRows} {preview.totalRows === 1 ? 'row' : 'rows'} read, {rows.length} categories found. {chosen.length} ticked.
            </p>
            {preview.columns.length > 1 && (
              <div role="group" aria-label="Group by" className="flex flex-wrap items-center gap-1.5">
                <span className="t-meta font-display font-semibold text-text-muted">Group by</span>
                {preview.columns.map((column) => (
                  <button
                    key={column}
                    type="button"
                    aria-pressed={preview.nameColumn === column}
                    disabled={reading}
                    onClick={() => file && void read(file, column)}
                    className={`min-h-9 cursor-pointer rounded-sm border px-2.5 t-meta font-display font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/50 ${preview.nameColumn === column ? 'border-transparent bg-primary-800 text-white' : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'}`}
                  >
                    {column}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[62rem] t-meta">
              <thead>
                <tr className="border-b border-border bg-surface-hover/40 text-left font-display font-semibold text-text-muted">
                  <th className="w-10 px-3 py-2"><span className="sr-only">Add</span></th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Labels</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Due (hours)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const locked = row.exists;
                  const fresh = newSubcategories(row);
                  return (
                    <tr key={row.key} className={`border-b border-border/60 align-top last:border-b-0 ${locked ? 'opacity-70' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected && isActionable(row)}
                          disabled={!isActionable(row)}
                          onChange={(e) => patch(row.key, { selected: e.target.checked })}
                          aria-label={`Add ${row.name}`}
                          className="size-4 accent-primary-700"
                        />
                      </td>
                      <td className="max-w-64 px-3 py-2">
                        <span className="block break-words font-display font-semibold text-text">{row.name}</span>
                        {locked && (
                          <span className="t-meta text-text-muted">
                            {fresh.length > 0 ? 'Already added. Only the new sub categories are added.' : 'Already added'}
                          </span>
                        )}
                        {row.subcategories.length > 0 && (
                          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Sub categories of ${row.name}`}>
                            {row.subcategories.map((sub) => (
                              <li key={sub.name} className={`rounded-sm border border-border bg-surface px-1.5 py-0.5 t-meta ${sub.exists ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                                {sub.name}
                              </li>
                            ))}
                          </ul>
                        )}
                        {row.warnings.map((warning) => (
                          <p key={warning} className="mt-1 flex items-start gap-1 t-meta text-danger">
                            <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden />
                            {warning}
                          </p>
                        ))}
                      </td>
                      <td className="min-w-44 px-3 py-2">
                        <Combobox
                          value={row.departmentId ?? ''}
                          onChange={(v) => patch(row.key, { departmentId: v || null })}
                          options={departmentOptions}
                          emptyOptionLabel="Choose a team"
                          placeholder="Choose a team"
                          disabled={locked}
                          className={`t-meta ${row.selected && !row.departmentId && !locked ? 'ring-2 ring-danger/40' : ''}`}
                        />
                      </td>
                      <td className="min-w-44 px-3 py-2">
                        <Combobox
                          value={row.assigneeId ?? ''}
                          onChange={(v) => patch(row.key, { assigneeId: v || null })}
                          options={peopleOptions}
                          emptyOptionLabel="Nobody yet"
                          placeholder={row.personName ?? 'Nobody yet'}
                          disabled={locked}
                          className="t-meta"
                        />
                      </td>
                      <td className="min-w-32 px-3 py-2">
                        {row.labels.length === 0 ? (
                          <span className="text-text-muted">None</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5" aria-label={`Labels of ${row.name}`}>
                            {row.labels.map((label) => (
                              <li key={label.name} className="flex items-center gap-1">
                                <TagChip tag={{ id: label.tagId ?? label.name, name: label.name, color: null }} />
                                {!label.tagId && <span className="t-meta text-text-muted">new</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="min-w-32 px-3 py-2">
                        <Combobox
                          value={row.priority ?? ''}
                          onChange={(v) => patch(row.key, { priority: (v || null) as CategoryPriority | null })}
                          options={PRIORITY_OPTIONS}
                          emptyOptionLabel="Not set"
                          placeholder="Not set"
                          disabled={locked}
                          className="t-meta"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.hours}
                          onChange={(e) => patch(row.key, { hours: e.target.value })}
                          disabled={locked}
                          inputMode="numeric"
                          placeholder="Default"
                          aria-label={`Due hours for ${row.name}`}
                          className={FIELD}
                        />
                        {Number(row.hours) > 0 && <span className="mt-0.5 block t-meta text-text-light">{formatTatHours(Number(row.hours))}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="t-meta text-text-muted">
            {preview.isList ? 'Every category in your list is ticked.' : `Categories with fewer than ${MIN_ROWS_BY_DEFAULT} tickets are not ticked.`} Tick or untick as you like. Names already in Karya are skipped.
          </p>
        </div>
      )}
    </Modal>
  );
};
