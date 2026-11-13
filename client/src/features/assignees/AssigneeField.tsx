import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Plus, UserPlus } from 'lucide-react';
import { PickerShell } from '../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../components/dropdown/OptionList';
import { Button } from '../../components/button';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';
import { FIELD_LABEL_CLASS, FIELD_CARD_CLASS } from '../tasks/taskFormFieldStyles';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
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
  emptyText?: string;
  pickerTitle?: string;
  allowCreate?: boolean;
}

const isHead = (u: AssignableUser) => u.role === 'MANAGER' || u.role === 'SENIOR';
const roleLabel = (u: AssignableUser) => (isHead(u) ? 'Head' : 'Team member');

const nameOf = (u: AssignableUser) => `${u.firstName} ${u.lastName ?? ''}`.trim();

const PersonChip = ({ user, main }: { user: AssignableUser; main: boolean }) => {
  const name = nameOf(user);
  return (
    <span className="inline-flex items-center gap-1.5 h-7 pl-0.5 pr-2.5 rounded-full border border-border/60 bg-surface-hover/50 min-w-0 max-w-full">
      <span className={`flex items-center justify-center size-6 rounded-full t-meta font-bold leading-none text-white shrink-0 ${avatarColorClass(name)}`} aria-hidden="true">
        {getInitials(name)}
      </span>
      <span className="min-w-0 truncate t-meta font-semibold text-text">
        {user.firstName}
        {user.lastName && <span> {user.lastName}</span>}
      </span>
      {main && <span className="shrink-0 rounded-full bg-surface-hover px-1.5 t-meta font-semibold text-text-muted">Main</span>}
    </span>
  );
};

export const AssigneeField = ({ selectedIds, onChange, users, isLoading = false, disabled = false, hideLabel = false, single = false, hintFor, emptyText = 'No assignable users', pickerTitle, allowCreate = true }: AssigneeFieldProps) => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const showRoles = !!currentUser && !OWN_SCOPE_ROLES.includes(currentUser.role);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const activeIds = single ? selectedIds : draftIds ?? selectedIds;

  const { data: departments } = useDepartmentsQuery(!disabled && !hintFor);
  const departmentName = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);
  const hintOf = useCallback(
    (u: AssignableUser): string | undefined => (hintFor ? hintFor(u) : u.departmentId ? departmentName.get(u.departmentId) : undefined) ?? undefined,
    [hintFor, departmentName],
  );

  const toggle = (id: string) => {
    if (single) {
      onChange(selectedIds.includes(id) ? [] : [id]);
      return;
    }
    setDraftIds(activeIds.includes(id) ? activeIds.filter((x) => x !== id) : [...activeIds, id]);
  };

  const selectedUsers = activeIds
    .map((id) => (users ?? []).find((u) => u.id === id))
    .filter((u): u is AssignableUser => !!u);

  const grouped = useMemo(() => new Set((users ?? []).map((u) => hintOf(u) ?? '')).size > 1, [users, hintOf]);

  const headsFirst = useCallback((a: AssignableUser, b: AssignableUser) => (showRoles ? Number(isHead(b)) - Number(isHead(a)) : 0), [showRoles]);

  const orderedUsers = useMemo(() => {
    const all = users ?? [];
    if (grouped) return [...all].sort((a, b) => (hintOf(a) ?? '~').localeCompare(hintOf(b) ?? '~') || headsFirst(a, b));
    const pinned = new Set(pinnedIds);
    return [...all.filter((u) => pinned.has(u.id)), ...all.filter((u) => !pinned.has(u.id)).sort(headsFirst)];
  }, [users, pinnedIds, grouped, hintOf, headsFirst]);

  const onPickerOpenChange = (next: boolean) => {
    if (next) {
      setPinnedIds(selectedIds);
      setDraftIds(selectedIds);
    } else if (draftIds) {
      const changed = draftIds.length !== selectedIds.length || draftIds.some((id, i) => id !== selectedIds[i]);
      if (changed) onChange(draftIds);
      setDraftIds(null);
    }
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
      hint: grouped ? (showRoles ? roleLabel(u) : undefined) : [hintOf(u), showRoles ? roleLabel(u) : undefined].filter(Boolean).join(' · '),
      group: grouped ? hintOf(u) ?? 'No department' : undefined,
      lead: (
        <span className={`flex items-center justify-center size-8 rounded-full t-meta font-bold text-white shrink-0 ${avatarColorClass(name)}`}>
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
          <PickerShell
            bare
            open={sheetOpen}
            onOpenChange={onPickerOpenChange}
            trigger={triggerButton}
            title={pickerTitle ?? (single ? 'Assign to' : 'Assign to (pick one or more)')}
            popoverContainer={triggerEl?.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]') ?? undefined}
            popoverClassName="w-[min(22rem,calc(100vw-2rem))]"
            sheetFooter={isPhone && !single && (
              <Button variant="primary" onClick={() => onPickerOpenChange(false)} className="w-full h-11 font-display">
                {activeIds.length ? `Done, ${activeIds.length} selected` : 'Done'}
              </Button>
            )}
          >
            <OptionList
              multiple={!single}
              options={sheetOptions}
              selected={activeIds}
              isLoading={isLoading}
              emptyText={emptyText}
              searchable
              searchPlaceholder="Search people…"
              onToggle={(id) => {
                if (single) { onChange([id]); setSheetOpen(false); } else toggle(id);
              }}
              topActions={[
                ...(single ? [{ key: 'none', label: 'Unassigned', onSelect: () => { onChange([]); setSheetOpen(false); } }] : []),
                ...(isAdmin && allowCreate ? [{ key: 'create', label: 'Create new user', icon: UserPlus, tone: 'primary' as const, onSelect: () => { setSheetOpen(false); setIsCreatingUser(true); } }] : []),
              ]}
            />
          </PickerShell>
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
