import { memo, useCallback, useMemo, useState } from 'react';
import { Pencil, Plus, Shirt, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, IconChip, InlineError, PageHeader, PANEL_CLASS, Skeleton, Switch, useConfirm } from '../../../components';
import { useDeleteDressTypeMutation, useDressTypesQuery, useUpdateDressTypeMutation } from './hook';
import { DressTypeFormDialog } from './DressTypeFormDialog';
import type { DressType } from '../../../api/dressTypes';

const GENDER_LABEL = { FEMALE: 'Women', MALE: 'Men' } as const;

const peopleText = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;

interface RowProps {
  type: DressType;
  busy: boolean;
  onToggleActive: (type: DressType) => void;
  onEdit: (type: DressType) => void;
  onDelete: (type: DressType) => void;
}

// A card on a phone (details on top, controls underneath), a single row from sm.
const DressTypeRow = memo(({ type, busy, onToggleActive, onEdit, onDelete }: RowProps) => (
  <li
    className={cn(
      PANEL_CLASS,
      'flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-3.5 transition-colors duration-150 hover:border-border-hover',
      !type.isActive && 'opacity-70',
    )}
  >
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <span aria-hidden className="flex items-center justify-center size-10 shrink-0 rounded-xl border border-primary-500/25 bg-primary-500/10 text-primary-700 dark:text-primary-300">
        <Shirt size={18} />
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-sm font-display font-semibold text-text leading-snug line-clamp-2">{type.name}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <IconChip icon={false} label={type.gender ? GENDER_LABEL[type.gender] : 'Anyone'} />
          <span className="text-xs font-display text-text-muted tabular-nums">{peopleText(type.peopleCount)}</span>
          {type.auditQuestionCount > 0 && (
            <span className="text-xs font-display text-text-muted tabular-nums">
              {type.auditQuestionCount} audit {type.auditQuestionCount === 1 ? 'question' : 'questions'}
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center justify-between sm:justify-end gap-3">
      <label htmlFor={`active-${type.id}`} className="flex items-center gap-2.5 min-h-11 sm:min-h-0 cursor-pointer">
        <Switch id={`active-${type.id}`} checked={type.isActive} onChange={() => onToggleActive(type)} disabled={busy} />
        <span className="text-xs font-display font-medium text-text-secondary">{type.isActive ? 'Active' : 'Off'}</span>
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(type)}
          disabled={busy}
          aria-label={`Edit ${type.name}`}
          title="Edit"
          className="size-11 sm:size-8 px-0 text-text-light hover:text-text"
        >
          <Pencil size={16} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(type)}
          disabled={busy}
          aria-label={`Delete ${type.name}`}
          title="Delete"
          className="size-11 sm:size-8 px-0 text-text-light hover:text-danger hover:bg-danger/10"
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      </div>
    </div>
  </li>
));
DressTypeRow.displayName = 'DressTypeRow';

const DressTypeRowSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex items-center gap-3 p-3 sm:p-3.5')}>
    <Skeleton className="size-10 rounded-xl shrink-0" />
    <div className="flex flex-col gap-1.5 flex-1">
      <Skeleton className="h-3.5 w-1/3 max-w-40" />
      <Skeleton className="h-3 w-1/4 max-w-24" />
    </div>
  </div>
);

/**
 * The catalog of dress types an audit can check people against (Saree, Coat and pant, Kurta...).
 * Each type is for women, men or anyone; the lists of items per type are set on the audit question
 * in the checklist builder, and a person's type on their profile.
 */
export const DressTypesPage = () => {
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DressType | null>(null);

  const { data, isPending, isError, refetch } = useDressTypesQuery();
  const updateMut = useUpdateDressTypeMutation();
  const deleteMut = useDeleteDressTypeMutation();
  const { mutate: updateType } = updateMut;
  const { mutate: deleteType } = deleteMut;

  const types = useMemo(() => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data]);

  const toggleActive = useCallback(async (type: DressType) => {
    if (type.isActive) {
      const ok = await confirm({
        title: `Turn off ${type.name}?`,
        description: 'It stops showing in the pickers. People who have it and its lists on audit questions stay as they are.',
        confirmLabel: 'Turn off',
        variant: 'danger',
      });
      if (!ok) return;
    }
    updateType({ id: type.id, payload: { isActive: !type.isActive } });
  }, [confirm, updateType]);

  const handleDelete = useCallback(async (type: DressType) => {
    if (type.peopleCount > 0) {
      const held = `${peopleText(type.peopleCount)} still ${type.peopleCount === 1 ? 'has' : 'have'} ${type.name}. Change their dress type on the People page first.`;
      if (type.isActive) {
        const ok = await confirm({
          title: `${type.name} is in use`,
          description: `${held} Or turn it off to hide it from the pickers.`,
          confirmLabel: 'Turn off instead',
          cancelLabel: 'Close',
        });
        if (ok) updateType({ id: type.id, payload: { isActive: false } });
      } else {
        await confirm({ title: `${type.name} is in use`, description: held, confirmLabel: 'Got it', cancelLabel: 'Close' });
      }
      return;
    }
    const questions = type.auditQuestionCount;
    const ok = await confirm({
      title: `Delete ${type.name}?`,
      description: questions > 0
        ? `${type.name} is on ${questions} audit ${questions === 1 ? 'question' : 'questions'}. Their list for it is lost. This cannot be undone.`
        : 'Nobody has this type and no audit question uses it. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteType(type.id);
  }, [confirm, updateType, deleteType]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const busyId = updateMut.isPending ? updateMut.variables?.id : deleteMut.isPending ? deleteMut.variables : undefined;

  return (
    <div className="flex flex-col gap-6 w-full">
      <PageHeader
        icon={Shirt}
        title="Dress Types"
        subtitle="Types of dress an audit can check, like Saree or Coat and pant. Each has its own list of items on the question."
        actions={
          <Button variant="primary" size="md" className="pointer-coarse:h-11" onClick={() => setShowForm(true)}>
            <Plus size={15} aria-hidden /> New type
          </Button>
        }
      />

      {isPending && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => <DressTypeRowSkeleton key={i} />)}
        </div>
      )}

      {isError && !data && (
        <InlineError message="We couldn't load the dress types. Check your connection and try again." onRetry={() => refetch()} />
      )}

      {!isPending && !isError && types.length === 0 && (
        <EmptyState
          icon={Shirt}
          title="No dress types yet"
          description="Add a type like Saree or Coat and pant, then give it a list of items on an audit question."
          action={{ label: 'New type', icon: Plus, onClick: () => setShowForm(true) }}
        />
      )}

      {types.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {types.map((t) => (
            <DressTypeRow
              key={t.id}
              type={t}
              busy={busyId === t.id}
              onToggleActive={toggleActive}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {(showForm || editing) && <DressTypeFormDialog onClose={closeForm} dressType={editing ?? undefined} />}
    </div>
  );
};
