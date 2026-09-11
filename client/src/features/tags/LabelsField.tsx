import { useMemo, useRef, useState } from 'react';
import { Tag as TagIcon, X, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useCreateTagMutation } from './hook';
import { labelChipClass, labelDotClass } from '../../lib/labelColors';
import { FIELD_LABEL_CLASS, FIELD_LABEL_ICON_CLASS } from '../tasks/taskFormFieldStyles';
import type { Tag } from '../../api/tags';

/** Server caps `tagIds` at 12; enforced here too so a full set fails at the pill, not on submit. */
const MAX_LABELS = 12;

/**
 * Offered as one-click creates while no labels exist yet.
 *
 * Not seeded into the database behind anyone's back — an empty label list is a real state, and
 * inventing rows in it would be a decision nobody asked for. These are a starting point an
 * ADMIN/PC can take or ignore; each becomes a real Tag only when clicked. Once any label exists
 * the row disappears, since the list itself is then the better prompt.
 *
 * Each renders in the colour the hash will actually give it, so what you click is what you get —
 * which is also why the set is exactly these six. A hash over ten hues can't be told to avoid
 * collisions (six draws from ten collide more often than not), but the names here are ours to
 * pick, and this set happens to land on six different colours: emerald, teal, lime, violet, blue
 * and near-black. "Compliance" and "Vendor" were the first two candidates and were dropped
 * because they duplicated Travel's and Expense's hues. If you change a name here, re-check the
 * colour it produces.
 */
const STARTER_LABELS = ['Travel', 'Billing', 'Expense', 'Marketing', 'Audit', 'Tax'];

interface LabelsFieldProps {
  /** Every label that exists. */
  tags: Tag[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  /**
   * Whether this user may coin a new label. `POST /tags` is ADMIN/PC only, so for anyone else the
   * "Create" affordance is hidden rather than shown and then 403'd.
   */
  canCreate: boolean;
  disabled?: boolean;
}

/**
 * Label picker shared by Delegation and Tickets — labels are one org-wide vocabulary, not a
 * concept either entity owns, so this lives under features/tags rather than features/tasks
 * (where it was originally written, before Tickets needed the identical picker).
 *
 * Built on the same DropdownMenu primitive as AssigneeField, not a bespoke popup — same
 * trigger shape, same `container`/`collisionBoundary` fix for scrolling inside a Dialog (see that
 * file's comments for why the fix is needed), same multi-select-without-closing behaviour. The one
 * addition over a plain checklist is a search input pinned at the top of the content, since a
 * label set can grow past what's comfortable to scan — it also doubles as where a new label's name
 * is typed for "Create".
 */
export const LabelsField = ({
  tags,
  selectedIds,
  onChange,
  canCreate,
  disabled = false,
}: LabelsFieldProps) => {
  const createTag = useCreateTagMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  // Reading a ref's .current during render isn't allowed (it can go stale without triggering a
  // re-render), so the trigger's DOM node is tracked in state via a callback ref instead.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((t): t is Tag => !!t);
  const atCap = selectedIds.length >= MAX_LABELS;

  const trimmed = query.trim();
  const suggestions = useMemo(() => {
    const needle = trimmed.toLowerCase();
    return tags.filter((t) => !needle || t.name.toLowerCase().includes(needle));
  }, [tags, trimmed]);

  // Case-insensitive, because the server's unique index is on the exact name and offering
  // "Create Hallmarking" when "hallmarking" already exists would just 409.
  const exactMatch = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const canOfferCreate = canCreate && !!trimmed && !exactMatch && !atCap;

  const toggle = (id: string) => {
    if (atCap && !selectedIds.includes(id)) return;
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  // Shared by the "Create" row and the starter chips below, so both paths attach the new label
  // immediately rather than creating it and leaving the user to pick it again.
  const createAndAttach = (name: string) => {
    if (createTag.isPending) return;
    createTag.mutate(
      { name },
      {
        onSuccess: (tag) => {
          onChange([...selectedIds, tag.id]);
          setQuery('');
          inputRef.current?.focus();
        },
      },
    );
  };

  // Gates both whether the trigger renders below and whether the label's `htmlFor` should point
  // at it — pointing a label at an id that isn't in the DOM (the trigger disappears at the cap or
  // when disabled) is a silent broken association, not a crash, but still wrong.
  const showTrigger = !disabled && !atCap;

  return (
    <div
      className="group/field flex flex-col gap-1.5"
      aria-describedby={atCap ? 'labels-field-help' : undefined}
    >
      <label htmlFor={showTrigger ? 'labels-field-trigger' : undefined} className={FIELD_LABEL_CLASS}>
        <TagIcon className={FIELD_LABEL_ICON_CLASS} />
        Labels
        <span className="ml-auto text-[11px] font-medium text-text-light tabular-nums">
          {selectedIds.length}/{MAX_LABELS}
        </span>
      </label>

      <div className="flex flex-col gap-2">
        {/* min-h-10, matching AssigneeField's row exactly — same height for the "+" trigger
            to center inside, so the two dropdown fields line up. */}
        <div className="flex flex-wrap items-center gap-1.5 min-h-10">
          {/* Each selected chip wears the label's own colour rather than one flat primary fill,
              so the set you've picked here matches what the card will show. */}
          {selected.map((tag) => (
            <span
              key={tag.id}
              className={`flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border text-xs font-medium ${labelChipClass(tag.name)}`}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => remove(tag.id)}
                disabled={disabled}
                aria-label={`Remove label ${tag.name}`}
                // currentColor-tinted hover, so it reads on both the light palette fills and the
                // near-black one without needing a per-colour override.
                className="p-0.5 rounded-full hover:bg-current/20 focus-visible:bg-current/20 transition-colors duration-200 ease-in-out cursor-pointer outline-none disabled:cursor-not-allowed"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </span>
          ))}

          {showTrigger && (
            // modal={false}: same reason as AssigneeField — keeps the dialog scrollable
            // while the checklist is open, since checkbox items call preventDefault on select.
            <DropdownMenu
              modal={false}
              onOpenChange={(open) => {
                if (!open) setQuery('');
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  id="labels-field-trigger"
                  ref={setTriggerEl}
                  type="button"
                  title="Add label"
                  aria-label="Add label"
                  className="flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full border border-dashed border-border-hover text-text-light hover:text-primary-600 hover:border-primary-400 transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} strokeWidth={2.5} />
                  <span className="text-xs font-display">{selected.length === 0 ? 'Add label' : 'Add'}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                // See AssigneeField's identical comment: required so the list actually
                // scrolls with a trackpad instead of just sitting there frozen.
                className="w-64 max-h-80 pointer-events-auto overscroll-contain flex flex-col p-0"
                collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
                collisionPadding={16}
                container={triggerEl?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}
              >
                <div className="p-1.5 shrink-0">
                  <input
                    ref={inputRef}
                    type="text"
                    // Radix's DropdownMenuContent doesn't expose an onOpenAutoFocus override (it's
                    // an internal-only prop on the underlying Menu primitive), but its FocusScope
                    // only moves focus on mount if nothing inside the content already has it —
                    // autoFocus here wins that race, landing focus on search rather than the
                    // first checklist row.
                    autoFocus
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    // Radix's roving focus/typeahead lives on the content and would otherwise
                    // steal arrow keys and letter keys away from this input.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Typing a label that already exists and hitting Enter should attach it,
                        // the same as clicking its checkbox — not fall through to "Create" (which
                        // would 409) or do nothing.
                        if (exactMatch) {
                          toggle(exactMatch.id);
                          setQuery('');
                          return;
                        }
                        if (canOfferCreate) createAndAttach(trimmed);
                        return;
                      }
                      if (e.key !== 'Escape') e.stopPropagation();
                    }}
                    placeholder="Search labels…"
                    className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-lg placeholder:text-text-light focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all duration-200 ease-in-out"
                  />
                </div>

                <div className="overflow-y-auto overscroll-contain flex flex-col p-1.5 pt-0">
                  {suggestions.length === 0 && !canOfferCreate && (
                    <div className="px-2 py-1.5 text-xs text-text-light">
                      {canCreate ? 'No labels match.' : `No label matches “${trimmed}”. Only an admin can add new labels.`}
                    </div>
                  )}

                  {/* Each option shows its own colour, so the label you're about to pick looks
                      the same here as it will on the card. */}
                  {suggestions.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={selectedIds.includes(tag.id)}
                      onCheckedChange={() => toggle(tag.id)}
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2"
                    >
                      <span aria-hidden className={`size-2.5 rounded-full shrink-0 ${labelDotClass(tag.name)}`} />
                      {tag.name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  {canOfferCreate && (
                    <>
                      <DropdownMenuSeparator />
                      <button
                        type="button"
                        onClick={() => createAndAttach(trimmed)}
                        disabled={createTag.isPending}
                        className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-primary-600 dark:text-primary-400 hover:bg-surface-hover transition-colors duration-200 ease-in-out cursor-pointer outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        {createTag.isPending ? 'Creating…' : `Create “${trimmed}”`}
                      </button>
                    </>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Starter labels, only while none exist and only for someone who may create them. Gives
            an empty field something to do besides stare back, and shows the colour range. */}
        {tags.length === 0 && canCreate && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-text-light">No labels yet — start with one of these:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STARTER_LABELS.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={disabled || createTag.isPending}
                  onClick={() => createAndAttach(name)}
                  title={`Create the label “${name}”`}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed ${labelChipClass(name)}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {atCap && (
          <p id="labels-field-help" className="text-[11px] font-medium text-text-light">Remove one to add another.</p>
        )}
      </div>
    </div>
  );
};
