import { useMemo, useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PickerShell } from '../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../components/dropdown/OptionList';
import { Button } from '../../components/button';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';
import { UserForm } from '../admin/users/UserForm';
import type { AssignableUser } from '../../api/users';
import { useDepartmentsQuery } from '../tickets/hook';

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
  /** Second line under each person in the picker. Defaults to their department's name (looked up
   *  from the cached departments list); return null/undefined for no line. */
  hintFor?: (user: AssignableUser) => string | null | undefined;
}

const nameOf = (u: AssignableUser) => `${u.firstName} ${u.lastName ?? ''}`.trim();

/** "[avatar] First name" on a phone, the full name from sm up, and a small "Main" tag on the
 *  first person of several (the primary assignee). Display only: the whole row is one button. */
const PersonChip = ({ user, main }: { user: AssignableUser; main: boolean }) => {
  const name = nameOf(user);
  return (
    <span className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full border border-border/60 bg-surface min-w-0 max-w-full">
      <span className={`flex items-center justify-center size-6 rounded-full t-meta font-bold text-white shrink-0 ${avatarColorClass(name)}`} aria-hidden="true">
        {getInitials(name)}
      </span>
      <span className="min-w-0 truncate t-meta font-semibold text-text">
        {user.firstName}
        {user.lastName && <span className="hidden sm:inline"> {user.lastName}</span>}
      </span>
      {main && <span className="shrink-0 rounded-full bg-surface-hover px-1.5 t-meta font-semibold text-text-muted">Main</span>}
    </span>
  );
};

// The picked people as name chips, and one tap target (the whole row) that opens the picker. Removing
// someone only happens inside the picker (untick, or "Unassigned"), so a stray tap on a chip can't
// silently drop a person. Shared by Delegation (multi-assignee: TaskForm/TaskDetail split the result
// back into assigneeId + additionalAssigneeIds) and Ticket (single-assignee, via `single`).
export const AssigneeField = ({ selectedIds, onChange, users, isLoading = false, disabled = false, hideLabel = false, single = false, hintFor }: AssigneeFieldProps) => {
  const { user: currentUser } = useAuth();
  // PC has full parity with ADMIN throughout this app.
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PC';
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  // Reading a ref's .current during render isn't allowed (it can go stale without triggering a
  // re-render), so the trigger's DOM node is tracked in state via a callback ref instead.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  // Who was picked when the list opened goes first. Frozen at open time so rows don't jump about
  // while someone ticks several people in a row.
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const { data: departments } = useDepartmentsQuery(!disabled && !hintFor);
  const departmentName = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);
  const hintOf = (u: AssignableUser): string | undefined =>
    (hintFor ? hintFor(u) : u.departmentId ? departmentName.get(u.departmentId) : undefined) ?? undefined;

  const toggle = (id: string) => {
    if (single) {
      onChange(selectedIds.includes(id) ? [] : [id]);
      return;
    }
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // In selectedIds order, so the first one (the primary assignee) is the one marked "Main".
  const selectedUsers = selectedIds
    .map((id) => (users ?? []).find((u) => u.id === id))
    .filter((u): u is AssignableUser => !!u);

  const orderedUsers = useMemo(() => {
    const pinned = new Set(pinnedIds);
    const all = users ?? [];
    return [...all.filter((u) => pinned.has(u.id)), ...all.filter((u) => !pinned.has(u.id))];
  }, [users, pinnedIds]);

  const onPickerOpenChange = (next: boolean) => {
    if (next) setPinnedIds(selectedIds);
    setSheetOpen(next);
  };

  const chips = selectedUsers.map((u, i) => <PersonChip key={u.id} user={u} main={!single && i === 0 && selectedUsers.length > 1} />);

  const pickerLabel = single
    ? selectedUsers.length ? `Assignee: ${nameOf(selectedUsers[0])}. Change` : 'Choose an assignee'
    : selectedUsers.length ? `Assignees: ${selectedUsers.map(nameOf).join(', ')}. Add or remove people` : 'Add people';

  const triggerButton = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={pickerLabel}
      title={single ? 'Change assignee' : 'Add or remove people'}
      className="group/assign flex flex-wrap items-center gap-1.5 min-h-11 max-w-full min-w-0 rounded-xl text-left cursor-pointer outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
    >
      {chips}
      {selectedUsers.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full border border-border-hover t-meta font-medium text-text-muted transition-colors duration-150 group-hover/assign:border-primary-400 group-hover/assign:text-primary-600">
          <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
          Unassigned
        </span>
      ) : single ? (
        <span className="inline-flex items-center h-8 px-3 rounded-full border border-border-hover t-meta font-medium text-text-muted transition-colors duration-150 group-hover/assign:border-primary-400 group-hover/assign:text-primary-600">
          Change
        </span>
      ) : (
        <span className="flex items-center justify-center size-8 rounded-full border border-border-hover text-text-muted transition-colors duration-150 group-hover/assign:border-primary-400 group-hover/assign:text-primary-600" aria-hidden="true">
          <Plus size={15} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );

  const sheetOptions: ListOption[] = orderedUsers.map((u) => {
    const name = nameOf(u);
    return {
      value: u.id,
      label: name,
      hint: hintOf(u),
      lead: (
        <span className={`flex items-center justify-center size-8 rounded-full text-xs font-bold text-white shrink-0 ${avatarColorClass(name)}`}>
          {getInitials(name)}
        </span>
      ),
    };
  });

  return (
    <div className={`group/field flex flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
      {!hideLabel && (
        <label className={FIELD_LABEL_CLASS}>
          {single ? 'Assignee' : 'Assignees'}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-1.5 min-h-10">
        {/* Read-only: the names, with no picker affordance. */}
        {disabled && chips}

        {!disabled && (
          // modal={false} is load-bearing, not a preference. Radix's DropdownMenu defaults to
          // modal, which takes its own scroll lock and puts `pointer-events: none` on everything
          // outside itself. Nested inside the Dialog that renders this form, that second lock wins
          // — and because the checkbox items call preventDefault on select (so you can tick
          // several people without the menu closing), the menu is still open after you pick
          // someone and the modal body stays frozen. Non-modal keeps the dialog scrollable while
          // the list is open, which is the behaviour a picker inside a scrolling form needs.
          isPhone ? (
            // Phones get a bottom sheet: a 224px menu with 36px rows is hard to hit, and a long team
            // needs a search box.
            <PickerShell
              bare
              open={sheetOpen}
              onOpenChange={onPickerOpenChange}
              trigger={triggerButton}
              title={single ? 'Assign to' : 'Assign to (pick one or more)'}
              sheetFooter={!single && (
                <Button variant="primary" onClick={() => setSheetOpen(false)} className="w-full h-11 font-display">
                  {selectedIds.length ? `Done, ${selectedIds.length} selected` : 'Done'}
                </Button>
              )}
            >
              <OptionList
                multiple={!single}
                options={sheetOptions}
                selected={selectedIds}
                isLoading={isLoading}
                emptyText="No assignable users"
                searchPlaceholder="Search people…"
                onToggle={(id) => {
                  if (single) { onChange([id]); setSheetOpen(false); } else toggle(id);
                }}
                topActions={[
                  ...(single ? [{ key: 'none', label: 'Unassigned', onSelect: () => { onChange([]); setSheetOpen(false); } }] : []),
                  ...(isAdmin ? [{ key: 'create', label: 'Create new user', icon: UserPlus, tone: 'primary' as const, onSelect: () => { setSheetOpen(false); setIsCreatingUser(true); } }] : []),
                ]}
              />
            </PickerShell>
          ) : (
          <DropdownMenu modal={false} open={sheetOpen} onOpenChange={onPickerOpenChange}>
            <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
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

              {isAdmin && (
                <>
                  <DropdownMenuItem
                    onSelect={() => setIsCreatingUser(true)}
                    className="gap-2 text-primary-600 dark:text-primary-400"
                  >
                    <UserPlus size={14} />
                    Create new user
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {isLoading ? (
                <div className="px-2 py-1.5 text-xs text-text-light">Loading team…</div>
              ) : (users ?? []).length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-text-light">No assignable users</div>
              ) : (
                orderedUsers.map((u) => {
                  const name = nameOf(u);
                  const hint = hintOf(u);
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
                      <span className={`flex items-center justify-center size-6 rounded-full text-xs font-bold text-white shrink-0 ${avatarColorClass(name)}`}>
                        {getInitials(name)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="line-clamp-2 break-words">{name}</span>
                        {hint && <span className="t-meta text-text-muted truncate">{hint}</span>}
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}

            </DropdownMenuContent>
          </DropdownMenu>
          )
        )}

        {/* Disabled (read-only) view has no clickable trigger to fold this label into. */}
        {disabled && selectedUsers.length === 0 && (
          <span className="t-meta text-text-light">Unassigned</span>
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
