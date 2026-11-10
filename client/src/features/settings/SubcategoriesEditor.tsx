import { useState } from 'react';
import { Clock, ListTree, Pencil, Plus, Trash2, User } from 'lucide-react';
import { Button, Combobox, Input, Switch, TagChip, useConfirm } from '../../components';
import { LabelsField } from '../tags/LabelsField';
import { useTagsQuery } from '../tags/hook';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { useAssignableUsersQuery } from '../tickets/hook';
import { cn } from '@/lib/utils';
import { useDeleteSubcategoryMutation, useSaveSubcategoryMutation } from './hook';
import type { CategoryPriority, Subcategory } from '@/api/categories';

const PRIORITY_CHOICES: CategoryPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const PILL = 'h-9 pointer-coarse:h-11 px-3 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]';
const PILL_ON = 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300';
const PILL_OFF = 'border-border/60 bg-surface text-text-secondary hover:border-border-hover';

const ICON_BUTTON = 'flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 cursor-pointer outline-none hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50';

interface Draft {
  name: string;
  priority: CategoryPriority | '';
  tatHours: string;
  assigneeId: string;
  tagIds: string[];
}

const draftOf = (sub?: Subcategory): Draft => ({
  name: sub?.name ?? '',
  priority: sub?.priority ?? '',
  tatHours: sub?.tatHours ? String(sub.tatHours) : '',
  assigneeId: sub?.assigneeId ?? '',
  tagIds: sub?.tagIds ?? [],
});

const tatError = (hours: string) => (hours && !(/^[0-9]+$/.test(hours) && Number(hours) > 0 && Number(hours) <= 720) ? 'Enter whole hours, 1 to 720' : undefined);

interface EditorRowProps {
  categoryId: string;
  departmentId: string;
  sub?: Subcategory;
  onDone: () => void;
}

const EditorRow = ({ categoryId, departmentId, sub, onDone }: EditorRowProps) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(sub));
  const save = useSaveSubcategoryMutation();
  const { data: people } = useAssignableUsersQuery(departmentId || undefined);
  const { data: tags } = useTagsQuery();
  const nameMissing = !draft.name.trim();
  const hoursError = tatError(draft.tatHours);

  const submit = () => {
    if (nameMissing || hoursError) return;
    save.mutate(
      {
        categoryId,
        id: sub?.id,
        payload: {
          name: draft.name.trim(),
          priority: draft.priority === '' ? null : draft.priority,
          tatHours: draft.tatHours ? Number(draft.tatHours) : null,
          assigneeId: draft.assigneeId || null,
          tagIds: draft.tagIds,
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary-500/40 bg-surface p-3">
      <Input
        aria-label="Subcategory name"
        placeholder="e.g. Ceiling fan"
        autoComplete="off"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        autoFocus
      />
      <p className="t-meta text-text-muted">Leave a field empty to use the category's own value.</p>
      <div className="flex flex-col gap-1.5">
        <span className="t-meta font-display font-semibold text-text-secondary">Priority</span>
        <div role="radiogroup" aria-label="Subcategory priority" className="flex flex-wrap gap-1.5">
          <button type="button" role="radio" aria-checked={!draft.priority} onClick={() => setDraft((d) => ({ ...d, priority: '' }))} className={cn(PILL, !draft.priority ? PILL_ON : PILL_OFF)}>
            Same as category
          </button>
          {PRIORITY_CHOICES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={draft.priority === p} onClick={() => setDraft((d) => ({ ...d, priority: p }))} className={cn(PILL, draft.priority === p ? PILL_ON : PILL_OFF)}>
              {PRIORITY_CONFIG[p].label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Due within</span>
          <Input
            inputMode="numeric"
            aria-label="Due within, in hours"
            placeholder="Same as category"
            suffix={<span className="t-meta text-text-light">hours</span>}
            value={draft.tatHours}
            error={hoursError}
            onChange={(e) => setDraft((d) => ({ ...d, tatHours: e.target.value.trim() }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-display font-semibold text-text-secondary">Who gets it</span>
          <Combobox
            value={draft.assigneeId}
            onChange={(v) => setDraft((d) => ({ ...d, assigneeId: v }))}
            options={(people ?? []).map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName ?? ''}`.trim() }))}
            emptyOptionLabel="Same as category"
            placeholder="Search people..."
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="t-meta font-display font-semibold text-text-secondary">Labels added on top of the category's</span>
        <LabelsField tags={tags ?? []} selectedIds={draft.tagIds} onChange={(ids) => setDraft((d) => ({ ...d, tagIds: ids }))} canCreate />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} className="max-sm:h-11">Cancel</Button>
        <Button type="button" variant="primary" size="sm" onClick={submit} isLoading={save.isPending} disabled={nameMissing || !!hoursError} className="max-sm:h-11">
          {sub ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

interface SubcategoryItemProps {
  categoryId: string;
  departmentId: string;
  sub: Subcategory;
  personName: string | undefined;
}

const SubcategoryItem = ({ categoryId, departmentId, sub, personName }: SubcategoryItemProps) => {
  const [editing, setEditing] = useState(false);
  const save = useSaveSubcategoryMutation();
  const remove = useDeleteSubcategoryMutation();
  const confirm = useConfirm();

  if (editing) return <EditorRow categoryId={categoryId} departmentId={departmentId} sub={sub} onDone={() => setEditing(false)} />;

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${sub.name}"?`,
      description: 'Tickets already filed under it block the delete. Turn it off instead to stop it showing on new tickets.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove.mutate({ categoryId, id: sub.id });
  };

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2', !sub.isActive && 'opacity-70')}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug break-words">{sub.name}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-meta text-text-muted">
          {sub.priority && <span>{PRIORITY_CONFIG[sub.priority].label} priority</span>}
          {sub.tatHours ? <span className="inline-flex items-center gap-1 tabular-nums"><Clock size={12} aria-hidden />{sub.tatHours} h</span> : null}
          {personName && <span className="inline-flex items-center gap-1"><User size={12} aria-hidden />{personName}</span>}
          {!sub.priority && !sub.tatHours && !personName && !sub.tags?.length && <span>Uses the category's settings</span>}
        </div>
        {!!sub.tags?.length && (
          <div className="flex flex-wrap items-center gap-1">
            {sub.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}
          </div>
        )}
      </div>
      <Switch
        checked={sub.isActive}
        disabled={save.isPending}
        onChange={(next) => save.mutate({ categoryId, id: sub.id, payload: { isActive: next } })}
      />
      <span className="sr-only">{sub.isActive ? `${sub.name} is on` : `${sub.name} is off`}</span>
      <button type="button" aria-label={`Edit ${sub.name}`} onClick={() => setEditing(true)} className={ICON_BUTTON}>
        <Pencil size={15} aria-hidden />
      </button>
      <button type="button" aria-label={`Delete ${sub.name}`} onClick={handleDelete} disabled={remove.isPending} className={cn(ICON_BUTTON, 'hover:bg-danger/10 hover:text-danger')}>
        <Trash2 size={15} aria-hidden />
      </button>
    </div>
  );
};

interface SubcategoriesEditorProps {
  categoryId: string;
  departmentId: string;
  subcategories: Subcategory[];
}

export const SubcategoriesEditor = ({ categoryId, departmentId, subcategories }: SubcategoriesEditorProps) => {
  const [adding, setAdding] = useState(false);
  const { data: people } = useAssignableUsersQuery(departmentId || undefined);
  const personById = new Map((people ?? []).map((u) => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()]));

  return (
    <section className="flex flex-col gap-2" aria-label="Subcategories">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
          <ListTree className="size-3.5 text-text-light" strokeWidth={2.5} aria-hidden />
          Subcategories
          <span className="font-medium text-text-light">(optional)</span>
        </span>
        {!adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} className="max-sm:h-11">
            <Plus size={14} aria-hidden />
            Add
          </Button>
        )}
      </div>
      <p className="t-meta text-text-muted">
        When a category has subcategories, people must pick one on the ticket. A subcategory can set its own priority, due time and person.
      </p>
      {subcategories.length === 0 && !adding && (
        <p className="rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2 t-meta text-text-muted">No subcategories yet.</p>
      )}
      {subcategories.map((sub) => (
        <SubcategoryItem key={sub.id} categoryId={categoryId} departmentId={departmentId} sub={sub} personName={sub.assigneeId ? personById.get(sub.assigneeId) : undefined} />
      ))}
      {adding && <EditorRow categoryId={categoryId} departmentId={departmentId} onDone={() => setAdding(false)} />}
    </section>
  );
};
