import { useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { PickerShell } from '../../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../../components/dropdown/OptionList';
import { DepartmentTile } from '../../departments/DepartmentField';
import { useOrgMove } from './orgMoveContext';

interface MoveToMenuProps {
  userId: string;
  userName: string;
  currentDepartmentId: string | null;
}

const NONE = '__none__';

export const MoveToMenu = ({ userId, userName, currentDepartmentId }: MoveToMenuProps) => {
  const move = useOrgMove();
  const [open, setOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

  const targets = move?.targets;
  const options = useMemo<ListOption[]>(
    () => [
      ...(currentDepartmentId ? [{ value: NONE, label: 'No department', lead: <DepartmentTile name={null} size="md" /> }] : []),
      ...(targets ?? []).map((t) => ({
        value: t.id,
        label: t.name,
        hint: t.storeName ?? undefined,
        lead: <DepartmentTile name={t.name} size="md" />,
      })),
    ],
    [targets, currentDepartmentId],
  );

  if (!move) return null;

  const choose = (value: string) => {
    setOpen(false);
    if (value === currentDepartmentId) return;
    if (value === NONE) {
      move.moveUser(userId, { departmentId: null, storeId: null });
      return;
    }
    const target = move.targets.find((t) => t.id === value);
    if (target) move.moveUser(userId, { departmentId: target.id, ...(target.storeId ? { storeId: target.storeId } : {}) });
  };

  const trigger = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={`Move ${userName} to another department`}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 @md:px-2.5 rounded-lg border border-transparent t-meta font-display font-medium text-text-muted cursor-pointer transition-colors duration-150 hover:bg-surface-active hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <ArrowRightLeft className="size-3.5" aria-hidden />
      <span className="hidden @md:inline">Move to...</span>
    </button>
  );

  return (
    <PickerShell
      bare
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={`Move ${userName} to`}
      popoverContainer={triggerEl?.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]') ?? undefined}
      popoverClassName="w-[min(22rem,calc(100vw-2rem))] max-h-80"
    >
      <OptionList
        options={options}
        selected={currentDepartmentId ? [currentDepartmentId] : []}
        emptyText="No departments yet"
        searchable
        searchPlaceholder="Search departments…"
        onToggle={choose}
      />
    </PickerShell>
  );
};
