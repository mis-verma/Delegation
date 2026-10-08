import { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';
import { UserForm } from '../admin/users/UserForm';
import type { AssignableUser } from '../../api/users';

interface AssigneeFieldProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  users?: AssignableUser[];
  isLoading?: boolean;
  disabled?: boolean;
  /** Suppress the built-in "Assignees" label — for callers (e.g. an icon-led row layout) that
   *  already provide their own label next to this field. */
  hideLabel?: boolean;
  /** Ticket's assignee is one person, not a list — picking someone new replaces the current
   *  selection instead of adding to it, the dropdown closes on pick (normal single-select
   *  behaviour), and an explicit "Unassigned" item is offered to clear it. Delegation's own
   *  multi-assignee behaviour (the default) is unchanged. */
  single?: boolean;
}

// Shows only the currently-assigned people as solid avatars, plus a dashed "+" trigger that
// opens a checklist of everyone else — instead of always showing every assignable user inline.
// Shared by Delegation (multi-assignee: TaskForm/TaskDetail split the result back into
// assigneeId + additionalAssigneeIds) and Ticket (single-assignee, via `single`) so both entities
// get the same picker experience instead of Ticket hand-rolling a plain text dropdown.
export const AssigneeField = ({ selectedIds, onChange, users, isLoading = false, disabled = false, hideLabel = false, single = false }: AssigneeFieldProps) => {
  const { user: currentUser } = useAuth();
  // PC has full parity with ADMIN throughout this app.
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PC';
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  // Reading a ref's .current during render isn't allowed (it can go stale without triggering a
  // re-render), so the trigger's DOM node is tracked in state via a callback ref instead.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

  const toggle = (id: string) => {
    if (single) {
      onChange(selectedIds.includes(id) ? [] : [id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const nameOf = (u: AssignableUser) => `${u.firstName} ${u.lastName ?? ''}`.trim();
  const selectedUsers = (users ?? []).filter((u) => selectedIds.includes(u.id));

  return (
    <div className={`group/field flex flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
      {!hideLabel && (
        <label className={FIELD_LABEL_CLASS}>
          {single ? 'Assignee' : 'Assignees'}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-1.5 min-h-10">
        {selectedUsers.map((u) => {
          const name = nameOf(u);
          return (
            <button
              key={u.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(u.id)}
              title={`${name} — click to remove`}
              className={`relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 flex items-center justify-center size-7 sm:size-8 rounded-full text-xs sm:text-[0.6875rem] font-semibold sm:font-bold text-white shrink-0 cursor-pointer transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:hover:scale-100 ${avatarColorClass(name)}`}
            >
              {getInitials(name)}
            </button>
          );
        })}

        {!disabled && (
          // modal={false} is load-bearing, not a preference. Radix's DropdownMenu defaults to
          // modal, which takes its own scroll lock and puts `pointer-events: none` on everything
          // outside itself. Nested inside the Dialog that renders this form, that second lock wins
          // — and because the checkbox items call preventDefault on select (so you can tick
          // several people without the menu closing), the menu is still open after you pick
          // someone and the modal body stays frozen. Non-modal keeps the dialog scrollable while
          // the list is open, which is the behaviour a picker inside a scrolling form needs.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {selectedUsers.length === 0 ? (
                // Empty state: the "Unassigned" label is part of the clickable trigger itself,
                // not separate inert text next to it — a plain <span> here reads as a status pill
                // but does nothing when clicked, which is exactly what looked broken.
                <button
                  ref={setTriggerEl}
                  type="button"
                  title="Add assignee"
                  aria-label="Add assignee"
                  className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2 pointer-coarse:after:inset-x-0 flex items-center gap-1.5 h-7 sm:h-8 pl-2 pr-3 rounded-full border border-dashed border-border-hover text-text-light hover:text-primary-600 hover:border-primary-400 transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} strokeWidth={2.5} />
                  <span className="text-xs font-display">Unassigned</span>
                </button>
              ) : (
                <button
                  ref={setTriggerEl}
                  type="button"
                  title={single ? 'Change assignee' : 'Add assignee'}
                  aria-label={single ? 'Change assignee' : 'Add assignee'}
                  className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 flex items-center justify-center size-7 sm:size-8 rounded-full border border-dashed border-border-hover text-text-light hover:text-primary-600 hover:border-primary-400 transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} strokeWidth={2.5} />
                </button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              // `pointer-events-auto` is required, not cosmetic. This menu is portalled to
              // document.body, and the Dialog wrapping this form sets `pointer-events: none`
              // there while it's open. With modal={true} Radix put `pointer-events: auto` on the
              // menu itself; with modal={false} (needed so the dialog stays scrollable) it
              // doesn't — so the list inherited none and the wheel/touchpad had nothing to scroll.
              //
              // `overscroll-contain` stops a scroll that reaches the end of this list from
              // chaining into the dialog body behind it.
              //
              // max-h-72 because the inherited `max-h-(--radix-…-available-height)` can resolve
              // to a couple of rows inside a short modal.
              className="w-56 max-h-72 pointer-events-auto overscroll-contain"
              // See Combobox's identical comment: constrains flip/shift to the modal's own content
              // element instead of the viewport, so a trigger near the bottom of the modal doesn't
              // spill the checklist out past the modal's card.
              collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
              collisionPadding={16}
              // Portal into the dialog rather than document.body. This is what actually makes the
              // list scrollable with a trackpad: Dialog's react-remove-scroll blocks wheel/touch
              // outside its own subtree, and a body-portalled menu is outside it. Falls back to
              // the body portal when this field isn't inside a dialog (e.g. TaskDetail's inline
              // use), where there's no scroll lock to be outside of.
              container={triggerEl?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}
            >
              {/* Single mode's own explicit way to clear the pick — multi-select has no
                  equivalent since removing is just clicking the avatar off. */}
              {single && (
                <>
                  <DropdownMenuItem onSelect={() => onChange([])} className="gap-2 text-text-muted">
                    Unassigned
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {isLoading ? (
                <div className="px-2 py-1.5 text-xs text-text-light">Loading team…</div>
              ) : (users ?? []).length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-text-light">No assignable users</div>
              ) : (
                (users ?? []).map((u) => {
                  const name = nameOf(u);
                  const checked = selectedIds.includes(u.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={u.id}
                      checked={checked}
                      onCheckedChange={() => toggle(u.id)}
                      // Multi-select stays open across picks (so you can tick several people in a
                      // row); single-select closes on pick, the normal dropdown convention.
                      onSelect={(e) => { if (!single) e.preventDefault(); }}
                      className="gap-2"
                    >
                      <span className={`flex items-center justify-center size-5 rounded-full text-[0.5625rem] font-bold text-white shrink-0 ${avatarColorClass(name)}`}>
                        {getInitials(name)}
                      </span>
                      {name}
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}

              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setIsCreatingUser(true)}
                    className="gap-2 text-primary-600 dark:text-primary-400"
                  >
                    <UserPlus size={14} />
                    Create new user
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Disabled (read-only) view has no clickable trigger to fold this label into. */}
        {disabled && selectedUsers.length === 0 && (
          <span className="text-xs text-text-light">Unassigned</span>
        )}
      </div>

      {isCreatingUser && (
        <UserForm
          onClose={() => setIsCreatingUser(false)}
          onCreated={(created) => onChange(single ? [created.id] : [...selectedIds, created.id])}
        />
      )}
    </div>
  );
};
