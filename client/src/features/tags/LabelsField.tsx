import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tag as TagIcon, X, Plus, Loader2, CornerDownLeft, Trash2, Settings2, Check, Palette } from 'lucide-react';
import { useCreateTagMutation, useDeleteTagMutation, useUpdateTagMutation } from './hook';
import { LABEL_COLORS, labelChipClass, labelColorKey, labelDotClass, suggestedLabelColor } from '../../lib/labelColors';
import { FIELD_LABEL_CLASS } from '../tasks/taskFormFieldStyles';
import { cn } from '@/lib/utils';
import type { Tag } from '../../api/tags';

/** Server caps `tagIds` at 12; enforced here too so a full set fails at the field, not on submit. */
const MAX_LABELS = 12;
/** How many unpicked labels the suggestion strip shows before the rest need typing to find. */
const MAX_SUGGESTIONS = 8;

/**
 * Offered as one-click creates while no labels exist yet. Each becomes a real Tag only when
 * clicked, in the colour its name suggests.
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
}

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
          // Keeps focus in whatever field the person was typing in, so the swatch tap lands.
          onMouseDown={(e) => e.preventDefault()}
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

/**
 * Label field shared by Delegation and Tickets, in both the create forms and the detail sheets.
 *
 * Works like a tag input, no popup: the picked labels are chips inside the box, and the box itself
 * is where you type. Enter (or a comma) attaches a matching label. A name that does not exist yet
 * opens a small card with a live preview and a colour to choose, then creates the label and attaches
 * it — the chip shows at once with a small spinner while the server catches up.
 * Unpicked labels sit as a strip of one-tap suggestions right under the box while it has focus.
 * Backspace on an empty box removes the last chip. Admin/PC can also open Manage to recolour or
 * delete labels.
 */
export const LabelsField = ({
  tags,
  selectedIds,
  onChange,
  canCreate,
  disabled = false,
  hideHeading = false,
}: LabelsFieldProps) => {
  const queryClient = useQueryClient();
  const createTag = useCreateTagMutation();
  const deleteTag = useDeleteTagMutation();
  const updateTag = useUpdateTagMutation();
  // Admin/PC only: a mode where every label shows a bin and a colour, for tidying up typos and
  // one-offs ("Bill" next to "Billing") without a trip to Settings.
  const [managing, setManaging] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [recolorId, setRecolorId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  // The colour chosen for the label about to be created; null means "the one its name suggests".
  const [newColor, setNewColor] = useState<string | null>(null);
  // Labels being created right now, drawn as chips straight away so Enter feels instant.
  const [pending, setPending] = useState<{ name: string; color: string }[]>([]);

  // Several quick Enters each finish creating on their own schedule; each must append to the
  // selection as it is *then*, not as it was when that Enter was pressed.
  const selectedRef = useRef(selectedIds);
  useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t);
  const used = selectedIds.length + pending.length;
  const atCap = used >= MAX_LABELS;

  const trimmed = query.trim().replace(/,+$/, '').trim();
  const needle = trimmed.toLowerCase();
  const suggestions = tags.filter((t) => !selectedIds.includes(t.id) && (!needle || t.name.toLowerCase().includes(needle)));
  // Case-insensitive, since the server's unique index would 409 "hallmarking" vs "Hallmarking".
  const exactMatch = tags.find((t) => t.name.toLowerCase() === needle);
  const isPendingName = pending.some((p) => p.name.toLowerCase() === needle);
  const canOfferCreate = canCreate && !!trimmed && !exactMatch && !isPendingName && !atCap && !disabled;
  const chosenColor = newColor ?? suggestedLabelColor(trimmed).key;

  const attach = (id: string) => {
    if (selectedRef.current.includes(id) || selectedRef.current.length + pending.length >= MAX_LABELS) return;
    onChange([...selectedRef.current, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  const create = (name: string, color: string) => {
    setPending((p) => [...p, { name, color }]);
    createTag.mutate(
      { name, color },
      {
        onSuccess: (tag) => {
          // Put it in the shared list now, so the chip resolves to its real name/colour without
          // waiting on the refetch the mutation also triggers.
          queryClient.setQueryData<Tag[]>(['tags'], (old) => (old?.some((t) => t.id === tag.id) ? old : [...(old ?? []), tag]));
          if (!selectedRef.current.includes(tag.id)) onChange([...selectedRef.current, tag.id]);
        },
        onSettled: () => setPending((p) => p.filter((x) => x.name !== name)),
      },
    );
  };

  const commit = () => {
    if (!trimmed || atCap) return;
    if (exactMatch) attach(exactMatch.id);
    else if (canOfferCreate) create(trimmed, chosenColor);
    // Someone who can't create still gets Enter-to-pick on the closest match.
    else if (!canCreate && suggestions[0]) attach(suggestions[0].id);
    else return;
    setQuery('');
    setNewColor(null);
  };

  const showSuggestions = !managing && focused && !disabled && !atCap && suggestions.length > 0;

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
    // Shown at once; the server catches up behind it.
    queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.map((t) => (t.id === tag.id ? { ...t, color } : t)));
    updateTag.mutate({ id: tag.id, payload: { color } });
  };

  const chipBase = 'inline-flex items-center gap-1.5 h-7 pointer-coarse:h-9 rounded-full border text-xs font-display font-semibold';

  return (
    <div className="flex flex-col gap-2" aria-describedby={atCap ? 'labels-field-help' : undefined}>
      {!hideHeading && (
        <label htmlFor="labels-field-input" className={FIELD_LABEL_CLASS}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary-500 to-primary-600 text-white" aria-hidden="true"><TagIcon className="size-3.5" strokeWidth={2.25} /></span>
          Labels
          <span className="ml-auto inline-flex h-5 min-w-9 items-center justify-center rounded-full bg-surface-hover px-2 t-meta font-display font-semibold text-text-muted tabular-nums">
            {used}/{MAX_LABELS}
          </span>
        </label>
      )}

      {/* The whole box focuses the input, so a tap anywhere in it starts typing. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-12 px-2.5 py-2 rounded-xl border bg-surface transition-[border-color,box-shadow] duration-200 ease-out',
          disabled
            ? 'border-border/60 opacity-60 cursor-not-allowed'
            : focused
              ? 'border-primary-400 ring-4 ring-primary-500/12 cursor-text'
              : 'border-border/70 dark:border-white/[0.08] hover:border-primary-400/60 cursor-text',
        )}
      >
        {selected.map((tag) => (
          <span
            key={tag.id}
            className={cn(chipBase, 'pl-2 pr-1', labelChipClass(tag))}
          >
            <span aria-hidden className={cn('size-2 rounded-full shrink-0', labelDotClass(tag))} />
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(tag.id); }}
                aria-label={`Remove label ${tag.name}`}
                // 28px circle on touch, padded to a 44px target by the ::after.
                className="relative flex items-center justify-center size-5 pointer-coarse:size-7 pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-[''] rounded-full hover:bg-current/15 focus-visible:bg-current/15 transition-colors duration-200 cursor-pointer outline-none"
              >
                <X size={12} strokeWidth={2.75} />
              </button>
            )}
          </span>
        ))}

        {pending.map((p) => (
          <span key={`pending-${p.name}`} className={cn(chipBase, 'pl-2 pr-2.5 opacity-70', labelChipClass({ name: p.name, color: p.color }))}>
            <span aria-hidden className={cn('size-2 rounded-full shrink-0', labelDotClass({ name: p.name, color: p.color }))} />
            {p.name}
            <Loader2 size={12} className="animate-spin" aria-label="Saving" />
          </span>
        ))}

        {!disabled && !atCap && (
          <input
            id="labels-field-input"
            ref={inputRef}
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            value={query}
            maxLength={40}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => { setQuery(e.target.value); setNewColor(null); }}
            onKeyDown={(e) => {
              // Enter or a comma commits, like most tag inputs.
              if (e.key === 'Enter' || (e.key === ',' && trimmed)) {
                // Never let Enter submit the surrounding form from here.
                e.preventDefault();
                commit();
              } else if (e.key === 'Backspace' && !query && selectedIds.length) {
                remove(selectedIds[selectedIds.length - 1]);
              } else if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={used ? 'Add another…' : canCreate ? 'Type a label, press Enter' : 'Search labels'}
            aria-label="Add label"
            // 16px on a phone: smaller makes iOS zoom the whole page when the field is focused.
            className="flex-1 min-w-[8rem] h-7 pointer-coarse:h-9 px-1.5 bg-transparent text-base sm:text-sm text-text placeholder:text-text-light outline-none"
          />
        )}
      </div>

      {/* New label: a live preview in the chosen colour, the twelve colours, one button. Shown while
          a name that does not exist yet is typed, whether or not the input still has focus, so a
          swatch tap on a phone never makes it vanish. */}
      {canOfferCreate && (
        <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-primary-500/20 bg-primary-500/5 dark:bg-primary-500/10">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-display font-semibold text-text-muted">
              <Palette size={13} aria-hidden /> New label
            </span>
            <span className={cn(chipBase, 'pl-2 pr-2.5 max-w-[60%]', labelChipClass({ name: trimmed, color: chosenColor }))}>
              <span aria-hidden className={cn('size-2 rounded-full shrink-0', labelDotClass({ name: trimmed, color: chosenColor }))} />
              <span className="truncate">{trimmed}</span>
            </span>
          </div>

          <ColorSwatches value={chosenColor} onPick={setNewColor} label="Label colour" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            className="inline-flex items-center justify-center gap-2 h-10 pointer-coarse:h-11 rounded-lg bg-primary-600 text-white text-sm font-display font-semibold transition-[background-color,transform] duration-150 ease-out hover:bg-primary-700 active:scale-[0.985] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Plus size={15} strokeWidth={2.75} />
            Create “{trimmed}”
            <CornerDownLeft size={13} strokeWidth={2.5} className="opacity-70 max-sm:hidden" aria-hidden />
          </button>
        </div>
      )}

      {/* Inline, not floating: pushes content down a little instead of covering the fields
          around it. onMouseDown preventDefault keeps focus in the input so taps land. */}
      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          {suggestions.slice(0, MAX_SUGGESTIONS).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { attach(tag.id); setQuery(''); setNewColor(null); }}
              className={cn(chipBase, 'px-2.5 hover:brightness-95 dark:hover:brightness-110 active:scale-[0.97] transition-[filter,transform] duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40', labelChipClass(tag))}
            >
              <Plus size={11} strokeWidth={3} aria-hidden className="shrink-0 opacity-70" />
              {tag.name}
            </button>
          ))}
          {suggestions.length > MAX_SUGGESTIONS && (
            <span className="t-meta font-medium text-text-light">+{suggestions.length - MAX_SUGGESTIONS} more, keep typing</span>
          )}
          {canCreate && tags.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setManaging(true); setConfirmingId(null); setRecolorId(null); }}
              className="inline-flex items-center gap-1 h-7 pointer-coarse:h-9 px-2 ml-auto rounded-full t-meta font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Settings2 size={12} strokeWidth={2.5} />
              Manage
            </button>
          )}
        </div>
      )}

      {/* Manage mode: every label with its colour and a bin. Tap the dot to recolour. Deleting takes
          the label off every delegation and ticket that carries it, so the bin first turns the chip
          into an inline "Delete everywhere?". */}
      {managing && canCreate && !disabled && (
        <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-border/60 dark:border-white/[0.08] bg-surface-hover/40">
          <div className="flex items-center justify-between gap-2">
            <span className="t-meta font-display font-semibold text-text-secondary">Tap a dot to change its colour, or delete one you no longer need</span>
            <button
              type="button"
              onClick={() => { setManaging(false); setConfirmingId(null); setRecolorId(null); }}
              className="inline-flex items-center gap-1 h-8 pointer-coarse:h-10 px-3 shrink-0 rounded-full bg-surface border border-border t-meta font-display font-semibold text-text hover:border-border-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Check size={12} strokeWidth={2.75} />
              Done
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => {
              const confirming = confirmingId === tag.id;
              const busy = deleteTag.isPending && confirming;
              return confirming ? (
                <span key={tag.id} className="inline-flex items-center gap-1 h-8 pointer-coarse:h-10 pl-2.5 pr-1 rounded-full border border-danger/40 bg-danger/10 text-xs font-display font-semibold text-danger">
                  Delete “{tag.name}” everywhere?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => deleteLabel(tag)}
                    className="inline-flex items-center gap-1 h-6 pointer-coarse:h-8 px-2.5 rounded-full bg-danger text-white t-meta font-bold hover:brightness-110 disabled:opacity-60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                  >
                    {busy && <Loader2 size={11} className="animate-spin" />}
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingId(null)}
                    aria-label="Keep this label"
                    className="flex items-center justify-center size-6 pointer-coarse:size-8 rounded-full hover:bg-danger/15 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <X size={12} strokeWidth={2.75} />
                  </button>
                </span>
              ) : (
                <span key={tag.id} className={cn('inline-flex items-center gap-1 h-8 pointer-coarse:h-10 pl-1 pr-1 rounded-full border text-xs font-display font-semibold', labelChipClass(tag))}>
                  <button
                    type="button"
                    onClick={() => setRecolorId((id) => (id === tag.id ? null : tag.id))}
                    aria-label={`Change the colour of ${tag.name}`}
                    aria-expanded={recolorId === tag.id}
                    className="relative flex items-center justify-center size-6 pointer-coarse:size-8 rounded-full hover:bg-current/15 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <span aria-hidden className={cn('size-3 rounded-full', labelDotClass(tag))} />
                  </button>
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => setConfirmingId(tag.id)}
                    aria-label={`Delete label ${tag.name}`}
                    className="flex items-center justify-center size-6 pointer-coarse:size-8 rounded-full opacity-70 hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <Trash2 size={12} strokeWidth={2.5} />
                  </button>
                </span>
              );
            })}
          </div>
          {recolorId && byId.get(recolorId) && (
            <div className="flex flex-col gap-1.5 pt-2.5 border-t border-border/60">
              <span className="t-meta font-display font-semibold text-text-muted">Colour for “{byId.get(recolorId)!.name}”</span>
              <ColorSwatches
                value={labelColorKey(byId.get(recolorId)!)}
                onPick={(key) => recolor(byId.get(recolorId)!, key)}
                label="Label colour"
              />
            </div>
          )}
        </div>
      )}

      {focused && !!trimmed && !canCreate && suggestions.length === 0 && (
        <p className="t-meta font-medium text-text-light px-0.5">No label called “{trimmed}”. Only an admin can add new ones.</p>
      )}

      {tags.length === 0 && canCreate && !disabled && pending.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="t-meta font-medium text-text-muted">No labels yet. Tap one to add it:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STARTER_LABELS.map((name) => {
              const color = suggestedLabelColor(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => create(name, color.key)}
                  title={`Create the label “${name}”`}
                  className={cn(chipBase, 'px-2.5 transition-[filter,transform] duration-200 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 hover:brightness-95 active:scale-[0.97]', color.chip)}
                >
                  <Plus size={11} strokeWidth={3} aria-hidden className="shrink-0 opacity-70" />
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {atCap && (
        <p id="labels-field-help" className="t-meta font-medium text-text-light">That's the limit of 12. Remove one to add another.</p>
      )}
    </div>
  );
};
