import { useRef, useState } from 'react';
import { AlertCircle, FileSpreadsheet, FileUp } from 'lucide-react';
import { Button, Combobox, Modal } from '../../components';
import { notifyError } from '../../lib/queryHelpers';
import { categoryApi, type CategoryHistoryPreview, type CategoryProposal } from '../../api/categories';
import { useCreateManyCategoriesMutation } from './hook';
import { formatTatHours } from './tatFormat';

interface ImportCategoriesModalProps {
  onClose: () => void;
}

type Row = CategoryProposal & { selected: boolean; hours: string };

const FIELD = 'w-20 rounded-md border border-border bg-surface px-2 py-1.5 t-meta text-text outline-none focus:border-primary-600';
const MIN_ROWS_BY_DEFAULT = 3;

const toRows = (proposals: CategoryProposal[]): Row[] =>
  proposals.map((p) => ({
    ...p,
    selected: !p.exists && !!p.departmentId && p.rowCount >= MIN_ROWS_BY_DEFAULT,
    hours: p.tatHours ? String(p.tatHours) : '',
  }));

export const ImportCategoriesModal = ({ onClose }: ImportCategoriesModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CategoryHistoryPreview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMany = useCreateManyCategoriesMutation();

  const read = async (next: File, column?: string) => {
    setReading(true);
    try {
      const data = await categoryApi.historyPreview(next, column);
      setFile(next);
      setPreview(data);
      setRows(toRows(data.proposals));
    } catch (err) {
      notifyError(err, "Couldn't read that file. Check it and try again.");
    } finally {
      setReading(false);
    }
  };

  const patch = (key: string, change: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const chosen = rows.filter((r) => r.selected && !r.exists);
  const needsTeam = chosen.filter((r) => !r.departmentId).length;
  const badHours = chosen.filter((r) => r.hours.trim() && !(Number(r.hours) > 0)).length;
  const canCreate = chosen.length > 0 && needsTeam === 0 && badHours === 0;

  const submit = () => {
    createMany.mutate(
      chosen.map((r) => ({
        name: r.name,
        departmentId: r.departmentId!,
        tatHours: r.hours.trim() ? Number(r.hours) : null,
        assigneeIds: r.assigneeId ? [r.assigneeId] : undefined,
      })),
      { onSuccess: ({ failed }) => { if (failed.length === 0) onClose(); } },
    );
  };

  const departmentOptions = (preview?.departments ?? []).map((d) => ({ value: d.id, label: d.name }));
  const peopleOptions = (preview?.people ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.email})` }));

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
        <Button type="button" variant="primary" size="sm" disabled={!canCreate} isLoading={createMany.isPending} onClick={submit} className="max-sm:h-11">
          {chosen.length === 0 ? 'Tick the ones to add' : `Add ${chosen.length} ${chosen.length === 1 ? 'category' : 'categories'}`}
        </Button>
      </div>
    </>
  ) : undefined;

  return (
    <Modal
      open
      onClose={onClose}
      icon={<FileUp className="size-5" />}
      title="Add categories from your ticket history"
      description="Upload the old ticket file. Each category gets its team, person and usual due time from how those tickets were handled."
      footer={footer}
      size="3xl"
    >
      {!preview ? (
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
            <p className="mt-1 t-meta text-text-muted">Excel (.xlsx) or CSV with a Category or Sub Category column</p>
          </div>
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="t-meta text-text-secondary">
              {preview.totalRows} tickets read, {rows.length} categories found. {chosen.length} ticked.
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
            <table className="w-full min-w-[46rem] t-meta">
              <thead>
                <tr className="border-b border-border bg-surface-hover/40 text-left font-display font-semibold text-text-muted">
                  <th className="w-10 px-3 py-2"><span className="sr-only">Add</span></th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Tickets</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Due (hours)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={`border-b border-border/60 align-top last:border-b-0 ${row.exists ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.selected && !row.exists}
                        disabled={row.exists}
                        onChange={(e) => patch(row.key, { selected: e.target.checked })}
                        aria-label={`Add ${row.name}`}
                        className="size-4 accent-primary-700"
                      />
                    </td>
                    <td className="max-w-64 px-3 py-2">
                      <span className="block break-words font-display font-semibold text-text">{row.name}</span>
                      {row.exists && <span className="t-meta text-text-muted">Already added</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-text-secondary">{row.rowCount}</td>
                    <td className="min-w-44 px-3 py-2">
                      <Combobox
                        value={row.departmentId ?? ''}
                        onChange={(v) => patch(row.key, { departmentId: v || null })}
                        options={departmentOptions}
                        emptyOptionLabel="Choose a team"
                        placeholder="Choose a team"
                        disabled={row.exists}
                        className={`t-meta ${row.selected && !row.departmentId && !row.exists ? 'ring-2 ring-danger/40' : ''}`}
                      />
                    </td>
                    <td className="min-w-44 px-3 py-2">
                      <Combobox
                        value={row.assigneeId ?? ''}
                        onChange={(v) => patch(row.key, { assigneeId: v || null })}
                        options={peopleOptions}
                        emptyOptionLabel="Nobody yet"
                        placeholder={row.personName ?? 'Nobody yet'}
                        disabled={row.exists}
                        className="t-meta"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.hours}
                        onChange={(e) => patch(row.key, { hours: e.target.value })}
                        disabled={row.exists}
                        inputMode="numeric"
                        placeholder="Default"
                        aria-label={`Due hours for ${row.name}`}
                        className={FIELD}
                      />
                      {Number(row.hours) > 0 && <span className="mt-0.5 block t-meta text-text-light">{formatTatHours(Number(row.hours))}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-meta text-text-muted">Categories with fewer than {MIN_ROWS_BY_DEFAULT} tickets are not ticked. Tick any you want. Names already in Karya are skipped.</p>
        </div>
      )}
    </Modal>
  );
};
