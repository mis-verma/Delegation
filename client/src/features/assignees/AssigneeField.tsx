import { useMemo, useState } from 'react';
import { ChevronDown, Plus, UserPlus } from 'lucide-react';
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
  hideLabel?: boolean;
  single?: boolean;
  hintFor?: (user: AssignableUser) => string | null | undefined;
}

const nameOf = (u: AssignableUser) => `${u.firstName} ${u.lastName ?? ''}`.trim();

const PersonChip = ({ user, main }: { user: AssignableUser; main: boolean }) => {
  const name = nameOf(user);
  return (
    <span className="inline-flex items-center gap-1.5 h-7 pl-0.5 pr-2.5 rounded-full border border-border/60 bg-surface-hover/50 min-w-0 max-w-full">
      <span className={`flex items-center justify-center size-6 rounded-full text-[0.625rem] font-bold text-white shrink-0 ${avatarColorClass(name)}`} aria-hidden="true">
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

export const AssigneeField = ({ selectedIds, onChange, users, isLoading = false, disabled = false, hideLabel = false, single = false, hintFor }: AssigneeFieldProps) => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PC';
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
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

  const picked = selectedUsers[0];
  const singleTrigger = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={pickerLabel}
      title="Change assignee"
      className="group/assign flex w-full min-w-0 items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-lg border border-border/60 bg-surface text-left cursor-pointer outline-none transition-colors duration-150 ease-out hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
    >
      {picked ? (
        <span className={`flex items-center justify-center size-7 rounded-full t-meta font-bold text-white shrink-0 ${avatarColorClass(nameOf(picked))}`} aria-hidden="true">
          {getInitials(nameOf(picked))}
        </span>
      ) : (
        <span className="flex items-center justify-center size-7 rounded-full border border-dashed border-border-hover text-text-muted shrink-0" aria-hidden="true">
          <UserPlus size={13} strokeWidth={2.25} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate t-meta font-display font-semibold ${picked ? 'text-text' : 'text-text-muted'}`}>{picked ? nameOf(picked) : 'Nobody yet'}</span>
        {picked && hintOf(picked) && <span className="truncate t-meta text-text-muted leading-tight">{hintOf(picked)}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 t-meta font-display font-semibold text-primary-600 dark:text-primary-300">
        {picked ? 'Change' : 'Pick'}
        <ChevronDown size={13} strokeWidth={2.5} className="transition-transform duration-150 group-aria-expanded/assign:rotate-180" aria-hidden="true" />
      </span>
    </button>
  );

  const triggerButton = single ? singleTrigger : (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={pickerLabel}
      title={single ? 'Change assignee' : 'Add or remove people'}
      className="group/assign flex w-full flex-wrap items-center gap-1.5 min-h-10 max-w-full min-w-0 rounded-lg border border-border/60 bg-surface p-1 pr-2.5 text-left cursor-pointer outline-none transition-colors duration-150 ease-out hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
    >
      {chips}
      {selectedUsers.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 h-7 pl-1.5 t-meta font-display font-semibold text-text-muted">
          <UserPlus size={14} strokeWidth={2.25} aria-hidden="true" />
          Nobody yet
        </span>
      ) : single ? (
        <span className="inline-flex items-center h-8 px-3 rounded-full border border-border-hover t-meta font-medium text-text-muted transition-colors duration-150 group-hover/assign:border-primary-400 group-hover/assign:text-primary-600">
          Change
        </span>
      ) : null}
      {!single && (
        <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 t-meta font-display font-semibold text-primary-600 dark:text-primary-300" aria-hidden="true">
          <Plus size={13} strokeWidth={2.5} />
          Add
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
    <div className={`group/field flex w-full min-w-0 flex-col gap-1.5 ${FIELD_CARD_CLASS}`}>
      {!hideLabel && (
        <label className={FIELD_LABEL_CLASS}>
          {single ? 'Assignee' : 'Assignees'}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-1.5 min-h-10">
        {disabled && (
          <div className="flex w-full flex-wrap items-center gap-1.5 min-h-10 rounded-lg border border-border/60 bg-surface p-1">{chips.length ? chips : <span className="pl-1.5 t-meta text-text-light">Nobody yet</span>}</div>
        )}

        {!disabled && (
          isPhone ? (
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
              className="w-56 max-h-72 pointer-events-auto overscroll-contain"
              collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
              collisionPadding={16}
              container={triggerEl?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? undefined}
            >
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
