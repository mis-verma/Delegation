import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tag as TagIcon, X, Plus, Loader2, CornerDownLeft, Trash2, Settings2, Check } from 'lucide-react';
import { useCreateTagMutation, useDeleteTagMutation } from './hook';
import { labelChipClass, labelDotClass } from '../../lib/labelColors';
import { FIELD_LABEL_CLASS, FIELD_LABEL_ICON_CLASS } from '../tasks/taskFormFieldStyles';
import type { Tag } from '../../api/tags';

/** Server caps `tagIds` at 12; enforced here too so a full set fails at the field, not on submit. */
const MAX_LABELS = 12;
/** How many unpicked labels the suggestion strip shows before the rest need typing to find. */
const MAX_SUGGESTIONS = 8;

/**
 * Offered as one-click creates while no labels exist yet. Each becomes a real Tag only when
 * clicked. These six names hash to six different colours; re-check if you change one.
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

/**
 * Label field shared by Delegation and Tickets, in both the create forms and the detail sheets.
 *
 * Works like a tag input, no popup: the picked labels are chips inside the box, and the box itself
 * is where you type. Enter (or a comma) attaches a matching label, or creates the typed one on the
 * spot and attaches it — the chip shows at once with a small spinner while the server catches up.
 * Unpicked labels sit as a strip of one-tap suggestions right under the box while it has focus.
 * Backspace on an empty box removes the last chip.
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
  // Admin/PC only: a mode where every label shows a bin, for clearing out typos and one-offs
  // ("Bill" next to "Billing") without a trip to Settings.
  const [managing, setManaging] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  // Names being created right now — drawn as chips straight away so Enter feels instant.
  const [pending, setPending] = useState<string[]>([]);

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
  const suggestions = useMemo(
    () => tags.filter((t) => !selectedIds.includes(t.id) && (!needle || t.name.toLowerCase().includes(needle))),
    [tags, selectedIds, needle],
  );
  // Case-insensitive, since the server's unique index would 409 "hallmarking" vs "Hallmarking".
  const exactMatch = tags.find((t) => t.name.toLowerCase() === needle);
  const isPendingName = pending.some((n) => n.toLowerCase() === needle);
  const canOfferCreate = canCreate && !!trimmed && !exactMatch && !isPendingName && !atCap;

  const attach = (id: string) => {
    if (selectedRef.current.includes(id) || selectedRef.current.length + pending.length >= MAX_LABELS) return;
    onChange([...selectedRef.current, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  const create = (name: string) => {
    setPending((p) => [...p, name]);
    createTag.mutate(
      { name },
      {
        onSuccess: (tag) => {
          // Put it in the shared list now, so the chip resolves to its real name/colour without
          // waiting on the refetch the mutation also triggers.
          queryClient.setQueryData<Tag[]>(['tags'], (old) => (old?.some((t) => t.id === tag.id) ? old : [...(old ?? []), tag]));
          if (!selectedRef.current.includes(tag.id)) onChange([...selectedRef.current, tag.id]);
        },
        onSettled: () => setPending((p) => p.filter((n) => n !== name)),
      },
    );
  };

  const commit = () => {
    if (!trimmed || atCap) return;
    if (exactMatch) attach(exactMatch.id);
    else if (canOfferCreate) create(trimmed);
    // Someone who can't create still gets Enter-to-pick on the closest match.
    else if (!canCreate && suggestions[0]) attach(suggestions[0].id);
    else return;
    setQuery('');
  };

  const showSuggestions = !managing && focused && !disabled && !atCap && (suggestions.length > 0 || canOfferCreate);

  const deleteLabel = (tag: Tag) => {
    deleteTag.mutate(tag.id, {
      onSuccess: () => {
        queryClient.setQueryData<Tag[]>(['tags'], (old) => old?.filter((t) => t.id !== tag.id));
        if (selectedRef.current.includes(tag.id)) onChange(selectedRef.current.filter((x) => x !== tag.id));
        setConfirmingId(null);
      },
    });
  };

  return (
    <div className="flex flex-col gap-1.5" aria-describedby={atCap ? 'labels-field-help' : undefined}>
      {!hideHeading && (
        <label htmlFor="labels-field-input" className={FIELD_LABEL_CLASS}>
          <TagIcon className={FIELD_LABEL_ICON_CLASS} />
          Labels
          <span className="ml-auto text-[11px] font-medium text-text-light tabular-nums">
            {used}/{MAX_LABELS}
          </span>
        </label>
      )}

      {/* The whole box focuses the input, so a tap anywhere in it starts typing. */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 min-h-10 px-1.5 py-1.5 rounded-xl border bg-surface transition-all duration-200 ease-in-out ${
          disabled
            ? 'border-border/60 opacity-60 cursor-not-allowed'
            : focused
              ? 'border-primary-400 ring-2 ring-primary-500/15 cursor-text'
              : 'border-border/60 dark:border-white/[0.08] hover:border-border-hover cursor-text'
        }`}
      >
        {selected.map((tag) => (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border text-xs font-display font-semibold animate-in fade-in zoom-in-95 duration-150 ${labelChipClass(tag.name)}`}
          >
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(tag.id); }}
                aria-label={`Remove label ${tag.name}`}
                className="flex items-center justify-center size-5 rounded-full hover:bg-current/15 focus-visible:bg-current/15 transition-colors duration-200 cursor-pointer outline-none"
              >
                <X size={12} strokeWidth={2.75} />
              </button>
            )}
          </span>
        ))}

        {pending.map((name) => (
          <span
            key={`pending-${name}`}
            className={`inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full border text-xs font-display font-semibold opacity-70 ${labelChipClass(name)}`}
          >
            {name}
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
            onChange={(e) => setQuery(e.target.value)}
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
            className="flex-1 min-w-[8rem] h-7 px-1.5 bg-transparent text-sm text-text placeholder:text-text-light outline-none"
          />
        )}
      </div>

      {/* Inline, not floating: pushes content down a little instead of covering the fields
          around it. onMouseDown preventDefault keeps focus in the input so taps land. */}
      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {canOfferCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
              className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-dashed border-primary-400/70 bg-primary-500/[0.06] dark:bg-primary-500/10 text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Plus size={12} strokeWidth={2.75} />
              Create “{trimmed}”
              <CornerDownLeft size={11} strokeWidth={2.5} className="opacity-60" aria-hidden />
            </button>
          )}
          {suggestions.slice(0, MAX_SUGGESTIONS).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { attach(tag.id); setQuery(''); }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border/60 dark:border-white/[0.08] bg-surface text-xs font-display font-semibold text-text-secondary hover:border-primary-400/60 hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span aria-hidden className={`size-2 rounded-full shrink-0 ${labelDotClass(tag.name)}`} />
              {tag.name}
            </button>
          ))}
          {suggestions.length > MAX_SUGGESTIONS && (
            <span className="text-[11px] font-medium text-text-light">+{suggestions.length - MAX_SUGGESTIONS} more, keep typing</span>
          )}
          {canCreate && tags.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setManaging(true); setConfirmingId(null); }}
              className="inline-flex items-center gap-1 h-7 px-2 ml-auto rounded-full text-[11px] font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Settings2 size={12} strokeWidth={2.5} />
              Manage
            </button>
          )}
        </div>
      )}

      {/* Manage mode: every label with a bin. Deleting takes it off every delegation and ticket
          that carries it, so the bin first turns the chip into an inline "Delete everywhere?". */}
      {managing && canCreate && !disabled && (
        <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-border/60 dark:border-white/[0.08] bg-surface-hover/40 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-display font-semibold text-text-secondary">Delete labels you no longer need</span>
            <button
              type="button"
              onClick={() => { setManaging(false); setConfirmingId(null); }}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface border border-border text-[11px] font-display font-semibold text-text hover:border-border-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
                <span key={tag.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-danger/40 bg-danger/10 text-xs font-display font-semibold text-danger animate-in fade-in zoom-in-95 duration-150">
                  Delete “{tag.name}” everywhere?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => deleteLabel(tag)}
                    className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-danger text-white text-[11px] font-bold hover:brightness-110 disabled:opacity-60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                  >
                    {busy && <Loader2 size={11} className="animate-spin" />}
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingId(null)}
                    aria-label="Keep this label"
                    className="flex items-center justify-center size-5 rounded-full hover:bg-danger/15 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <X size={12} strokeWidth={2.75} />
                  </button>
                </span>
              ) : (
                <span key={tag.id} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full border border-border/60 dark:border-white/[0.08] bg-surface text-xs font-display font-semibold text-text-secondary">
                  <span aria-hidden className={`size-2 rounded-full shrink-0 ${labelDotClass(tag.name)}`} />
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => setConfirmingId(tag.id)}
                    aria-label={`Delete label ${tag.name}`}
                    className="flex items-center justify-center size-5 rounded-full text-text-light hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                  >
                    <Trash2 size={11} strokeWidth={2.5} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {focused && !!trimmed && !canCreate && suggestions.length === 0 && (
        <p className="text-[11px] font-medium text-text-light px-0.5">No label called “{trimmed}”. Only an admin can add new ones.</p>
      )}

      {tags.length === 0 && canCreate && !disabled && pending.length === 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-text-light">No labels yet. Tap one to start:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STARTER_LABELS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => create(name)}
                title={`Create the label “${name}”`}
                className={`px-2.5 h-7 rounded-full border text-xs font-display font-semibold transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 hover:brightness-95 ${labelChipClass(name)}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {atCap && (
        <p id="labels-field-help" className="text-[11px] font-medium text-text-light">That's the limit of 12. Remove one to add another.</p>
      )}
    </div>
  );
};
