import { useState } from 'react';
import { ListTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Switch, useConfirm } from '../../components';
import { cn } from '@/lib/utils';
import { useDeleteSubcategoryMutation, useSaveSubcategoryMutation } from './hook';
import type { Subcategory } from '@/api/categories';


const ICON_BUTTON = 'flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 cursor-pointer outline-none hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50';

interface Draft {
  name: string;
}

const draftOf = (sub?: Subcategory): Draft => ({ name: sub?.name ?? '' });

interface EditorRowProps {
  categoryId: string;
  sub?: Subcategory;
  onDone: () => void;
}

const EditorRow = ({ categoryId, sub, onDone }: EditorRowProps) => {
  const [draft, setDraft] = useState<Draft>(() => draftOf(sub));
  const save = useSaveSubcategoryMutation();
  const nameMissing = !draft.name.trim();

  const submit = () => {
    if (nameMissing) return;
    save.mutate(
      {
        categoryId,
        id: sub?.id,
        payload: {
          name: draft.name.trim(),
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} className="max-sm:h-11">Cancel</Button>
        <Button type="button" variant="primary" size="sm" onClick={submit} isLoading={save.isPending} disabled={nameMissing} className="max-sm:h-11">
          {sub ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

interface SubcategoryItemProps {
  categoryId: string;
  sub: Subcategory;
}

const SubcategoryItem = ({ categoryId, sub }: SubcategoryItemProps) => {
  const [editing, setEditing] = useState(false);
  const save = useSaveSubcategoryMutation();
  const remove = useDeleteSubcategoryMutation();
  const confirm = useConfirm();

  if (editing) return <EditorRow categoryId={categoryId} sub={sub} onDone={() => setEditing(false)} />;

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
  subcategories: Subcategory[];
}

export const SubcategoriesEditor = ({ categoryId, subcategories }: SubcategoriesEditorProps) => {
  const [adding, setAdding] = useState(false);

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
        When a category has subcategories, people must pick one on the ticket.
      </p>
      {subcategories.length === 0 && !adding && (
        <p className="rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2 t-meta text-text-muted">No subcategories yet.</p>
      )}
      {subcategories.map((sub) => (
        <SubcategoryItem key={sub.id} categoryId={categoryId} sub={sub} />
      ))}
      {adding && <EditorRow categoryId={categoryId} onDone={() => setAdding(false)} />}
    </section>
  );
};
