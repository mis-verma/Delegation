import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tag as TagIcon, Plus, Loader2, Trash2, Settings2, Check, ChevronDown, ChevronLeft, X } from 'lucide-react';
import { useCreateTagMutation, useDeleteTagMutation, useUpdateTagMutation } from './hook';
import { BARE_LABEL_CLASS, LABEL_COLORS, labelChipClass, labelColorKey, labelDotClass, suggestedLabelColor } from '../../lib/labelColors';
import { FIELD_LABEL_CLASS } from '../tasks/taskFormFieldStyles';
import { PickerShell } from '../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../components/dropdown/OptionList';
import { Button } from '../../components/button';
import { cn } from '@/lib/utils';
import { IconChip } from '../../components/iconChip';
import type { Tag } from '../../api/tags';

/** Server caps `tagIds` at 12; enforced here too so a full set fails at the field, not on submit. */
const MAX_LABELS = 12;

/**
 * Offered as one-tap creates while no labels exist yet. Each becomes a real Tag only when tapped, in the colour
 * its name suggests.
 */
const STARTER_LABELS = ['Travel', 'Billing', 'Expense', 'Marketing', 'Audit', 'Tax'];

interface LabelsFieldProps {
  /** Every label that exists. */
  tags: Tag[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  /** Whether this user may coin a new label. `POST /tags` is ADMIN/PC only. */
  canCreate: boolean;
  disabled?: boolean;
  /** Drop the "Labels n/12" heading, for a caller that already labels the row itself. */
  hideHeading?: boolean;
  /** Labels already saved on the record that can't be taken off (a ticket's labels are permanent). They stay
   *  ticked in the picker and a tap does nothing. */
  lockedIds?: string[];
}

type View = 'pick' | 'create' | 'manage';

/** One row of colour swatches. A 44px tap area on touch around each 28px dot. */
const ColorSwatches = ({ value, onPick, label }: { value: string; onPick: (key: string) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
    {LABEL_COLORS.map((c) => {
      const active = c.key === value;
      return (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={c.name}
          title={c.name}
          onClick={() => onPick(c.key)}
          className="group relative flex items-center justify-center size-8 pointer-coarse:size-11 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 [-webkit-tap-highlight-color:transparent]"
        >
          <span
            className={cn(
              'flex items-center justify-center size-6 rounded-full text-white transition-transform duration-150 group-hover:scale-110 group-active:scale-95',
              c.dot,
              active && 'ring-2 ring-offset-2 ring-offset-surface ring-primary-600 dark:ring-primary-300',
            )}
          >
            {active && <Check size={13} strokeWidth={3.5} />}
          </span>
        </button>
      );
    })}
  </div>
);

/** A label: its coloured icon and name, bare like TagChip (no border, no fill). */
const LabelChip = ({ tag, className }: { tag: Pick<Tag, 'name' | 'color'>; className?: string }) => (
  <IconChip icon={TagIcon} tone={labelDotClass(tag)} label={tag.name} className={cn(BARE_LABEL_CLASS, className)} title={`Label: ${tag.name}`} />
);

const BackBar = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to the labels"
      className="flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <ChevronLeft size={18} strokeWidth={2.5} />
    </button>
    <span className="t-card font-display font-bold text-text">{title}</span>
  </div>
);

/**
 * Label field shared by Delegation and Tickets, in the create forms and the detail sheets, built the way the
 * Priority and Assignee fields are: one full-width field that shows the picked labels as chips, and a picker that
 * opens from it (a bottom sheet on a phone, a popover from sm up) with a searchable, tickable list.
 *
 * Admin/PC also get "New label" (a name, a colour, a live preview) and "Manage labels" (recolour or delete)
 * inside the same picker. Everyone else picks from the shared list. Labels are one list for Delegation and
 * Tickets, and the name is unique, case-insensitively.
 */
export const LabelsField = ({ tags, selectedIds, onChange, canCreate, disabled = false, hideHeading = false, lockedIds }: LabelsFieldProps) => {
  const queryClient = useQueryClient();
  const createTag = useCreateTagMutation();
  const deleteTag = useDeleteTagMutation();
  const updateTag = useUpdateTagMutation();

  const [open, setOpen] = useState(false);
  // The dialog this field sits in, if any: the popover renders inside it so the dialog's focus trap does not pull
  // focus out of the name box.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const [view, setView] = useState<View>('pick');
  // Who was picked when the list opened goes first, frozen so rows do not jump while several are ticked.
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [recolorId, setRecolorId] = useState<string | null>(null);

  // A create that finishes later must append to the selection as it is then, not as it was when it started.
  const selectedRef = useRef(selectedIds);
  useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t);
  const atCap = selectedIds.length >= MAX_LABELS;

  const trimmed = name.trim();
  const clash = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const chosenColor = newColor ?? suggestedLabelColor(trimmed || 'label').key;

  const orderedTags = useMemo(() => {
    const pinned = new Set(pinnedIds);
    return [...tags.filter((t) => pinned.has(t.id)), ...tags.filter((t) => !pinned.has(t.id))];
  }, [tags, pinnedIds]);

  const locked = useMemo(() => new Set(lockedIds ?? []), [lockedIds]);

  const toggle = (id: string) => {
    if (locked.has(id)) return;
    if (selectedRef.current.includes(id)) onChange(selectedRef.current.filter((x) => x !== id));
    else if (selectedRef.current.length < MAX_LABELS) onChange([...selectedRef.current, id]);
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      setPinnedIds(selectedIds);
      setView('pick');
      setName('');
      setNewColor(null);
      setConfirmingId(null);
      setRecolorId(null);
    }
    setOpen(next);
  };

  const create = (labelName: string, color: string, done?: () => void) => {
    createTag.mutate(
      { name: labelName, color },
      {
        onSuccess: (tag) => {
          // In the shared list at once, so the chip shows its real name and colour before the refetch lands.
          queryClient.setQueryData<Tag[]>(['tags'], (old) => (old?.some((t) => t.id === tag.id) ? old : [...(old ?? []), tag]));
          if (!selectedRef.current.includes(tag.id) && selectedRef.current.length < MAX_LABELS) onChange([...selectedRef.current, tag.id]);
          done?.();
        },
      },
    );
  };

  const deleteLabel = (tag: Tag) => {
    deleteTag.mutate(tag.id, {
      onSuccess: () => {
        queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.filter((t) => t.id !== tag.id));
        if (selectedRef.current.includes(tag.id)) onChange(selectedRef.current.filter((x) => x !== tag.id));
        setConfirmingId(null);
      },
    });
  };

  const recolor = (tag: Tag, color: string) => {
    queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.map((t) => (t.id === tag.id ? { ...t, color } : t)));
    updateTag.mutate({ id: tag.id, payload: { color } });
  };

  const options: ListOption[] = orderedTags.map((t) => ({
    value: t.id,
    label: t.name,
    hint: locked.has(t.id) ? 'Added, stays on this ticket' : undefined,
    lead: (
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border', labelChipClass(t))} aria-hidden="true">
        <span className={cn('size-2.5 rounded-full', labelDotClass(t))} />
      </span>
    ),
  }));

  const heading = !hideHeading && (
    <label className={FIELD_LABEL_CLASS}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true">
        <TagIcon className="size-3.5" strokeWidth={2.25} />
      </span>
      Labels
      <span className="ml-auto inline-flex h-5 min-w-9 items-center justify-center rounded-full bg-surface-hover px-2 t-meta font-display font-semibold text-text-muted tabular-nums">
        {selectedIds.length}/{MAX_LABELS}
      </span>
    </label>
  );

  // Read-only: the chips, nothing to open.
  if (disabled) {
    return (
      <div className="flex flex-col gap-2">
        {heading}
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.length ? selected.map((t) => <LabelChip key={t.id} tag={t} />) : <span className="t-meta text-text-light">No labels</span>}
        </div>
      </div>
    );
  }

  const trigger = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={selected.length ? `Labels: ${selected.map((t) => t.name).join(', ')}. Add or remove` : 'Add labels'}
      className="group/labels flex w-full min-h-12 items-center gap-2 rounded-xl border border-border/70 bg-surface px-2.5 py-2 text-left cursor-pointer outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary-400/70 focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-500/15 [-webkit-tap-highlight-color:transparent]"
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {selected.length ? (
          selected.map((t) => <LabelChip key={t.id} tag={t} />)
        ) : (
          <span className="inline-flex items-center gap-1.5 px-1 text-sm font-display font-medium text-text-muted">
            <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
            Add labels
          </span>
        )}
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-light transition-colors duration-200 group-hover/labels:bg-primary-500/10 group-hover/labels:text-primary-700 dark:group-hover/labels:text-primary-300" aria-hidden="true">
        <ChevronDown size={14} strokeWidth={2.4} />
      </span>
    </button>
  );

  const pickView = (
    <div className="flex flex-col gap-2">
      <OptionList
        multiple
        options={options}
        selected={selectedIds}
        emptyText={canCreate ? 'No labels yet' : 'No labels have been made yet'}
        searchPlaceholder="Search labels…"
        onToggle={toggle}
        topActions={canCreate
          ? [
              { key: 'new', label: 'New label', icon: Plus, tone: 'primary', onSelect: () => { setView('create'); setName(''); setNewColor(null); } },
              ...(tags.length ? [{ key: 'manage', label: 'Manage labels', icon: Settings2, onSelect: () => setView('manage') }] : []),
            ]
          : undefined}
      />
      {tags.length === 0 && canCreate && (
        <div className="flex flex-col gap-1.5 px-1">
          <span className="t-meta font-medium text-text-muted">Start with one:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {STARTER_LABELS.map((starter) => {
              const color = suggestedLabelColor(starter);
              return (
                <button
                  key={starter}
                  type="button"
                  disabled={createTag.isPending}
                  onClick={() => create(starter, color.key)}
                  className={cn('inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border t-meta font-display font-semibold cursor-pointer outline-none transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[0.97] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary-500/40', color.chip)}
                >
                  <Plus size={11} strokeWidth={3} aria-hidden="true" className="opacity-70" />
                  {starter}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {atCap && <p className="px-1 t-meta font-medium text-text-muted">That is the limit of {MAX_LABELS}. Untick one to add another.</p>}
    </div>
  );

  const createView = (
    <div className="flex flex-col gap-3">
      <BackBar title="New label" onBack={() => setView('pick')} />
      <input
        autoFocus
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (trimmed && !clash && !createTag.isPending) create(trimmed, chosenColor, () => setView('pick'));
          }
        }}
        placeholder="Label name"
        aria-label="Label name"
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text placeholder:text-text-light outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
      />
      {trimmed && <LabelChip tag={{ name: trimmed, color: chosenColor }} className="self-start" />}
      <ColorSwatches value={chosenColor} onPick={setNewColor} label="Label colour" />
      {clash ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface-hover/40 px-3 py-2">
          <span className="t-meta font-medium text-text-secondary">“{clash.name}” already exists.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => { toggle(clash.id); setView('pick'); }}>
            {selectedIds.includes(clash.id) ? 'Already added' : 'Use it'}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="primary"
          disabled={!trimmed || createTag.isPending || atCap}
          onClick={() => create(trimmed, chosenColor, () => setView('pick'))}
          className="h-11 w-full font-display"
        >
          {createTag.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={15} strokeWidth={2.75} aria-hidden="true" />}
          Create and add{trimmed ? ` “${trimmed}”` : ''}
        </Button>
      )}
    </div>
  );

  const manageView = (
    <div className="flex flex-col gap-3">
      <BackBar title="Manage labels" onBack={() => { setView('pick'); setConfirmingId(null); setRecolorId(null); }} />
      <p className="px-1 t-meta font-medium text-text-muted">Tap a dot to change its colour. Deleting a label removes it from every delegation. A label used on a ticket can't be deleted.</p>
      <ul className="flex flex-col gap-1">
        {tags.map((tag) => {
          const confirming = confirmingId === tag.id;
          const busy = deleteTag.isPending && confirming;
          return (
            <li key={tag.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface px-2 py-1.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecolorId((id) => (id === tag.id ? null : tag.id))}
                  aria-label={`Change the colour of ${tag.name}`}
                  aria-expanded={recolorId === tag.id}
                  className={cn('flex size-8 pointer-coarse:size-10 shrink-0 items-center justify-center rounded-lg border cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40', labelChipClass(tag))}
                >
                  <span aria-hidden className={cn('size-3 rounded-full', labelDotClass(tag))} />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-display font-semibold text-text">{tag.name}</span>
                {confirming ? (
                  <span className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => deleteLabel(tag)}>
                      {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      Delete everywhere
                    </Button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingId(null)}
                      aria-label="Keep this label"
                      className="flex size-8 pointer-coarse:size-10 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      <X size={14} strokeWidth={2.75} />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(tag.id)}
                    aria-label={`Delete label ${tag.name}`}
                    className="flex size-8 pointer-coarse:size-10 items-center justify-center rounded-lg text-text-muted hover:bg-danger/10 hover:text-danger cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {recolorId === tag.id && <ColorSwatches value={labelColorKey(byId.get(tag.id)!)} onPick={(key) => recolor(tag, key)} label="Label colour" />}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {heading}
      <PickerShell
        bare
        open={open}
        onOpenChange={onOpenChange}
        trigger={trigger}
        title={view === 'pick' ? 'Labels' : view === 'create' ? 'New label' : 'Manage labels'}
        popoverClassName="w-[min(22rem,calc(100vw-1.5rem))]"
        popoverContainer={triggerEl?.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]') ?? undefined}
        sheetFooter={
          view === 'pick' ? (
            <Button variant="primary" onClick={() => setOpen(false)} className="h-11 w-full font-display">
              {selectedIds.length ? `Done, ${selectedIds.length} selected` : 'Done'}
            </Button>
          ) : undefined
        }
      >
        {view === 'pick' ? pickView : view === 'create' ? createView : manageView}
      </PickerShell>
    </div>
  );
};
