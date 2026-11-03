import { useMemo, useState } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { PickerShell } from '../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../components/dropdown/OptionList';
import { Button } from '../../components/button';
import { avatarColorClass } from '../../lib/avatarColors';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useStoresQuery } from '../tickets/hook';
import type { Department } from '../../api/departments';

interface DepartmentFieldProps {
  id?: string;
  value?: string;
  onChange?: (id: string) => void;
  selectedIds?: string[];
  onChangeMany?: (ids: string[]) => void;
  multiple?: boolean;
  departments?: Department[];
  isLoading?: boolean;
  disabled?: boolean;
  noneLabel?: string;
  onCreateNew?: () => void;
  className?: string;
}

export const DepartmentTile = ({ name, size }: { name: string | null; size: 'sm' | 'md' }) => (
  <span
    aria-hidden="true"
    className={cn(
      'flex shrink-0 items-center justify-center rounded-lg text-white',
      size === 'md' ? 'size-8' : 'size-7',
      name ? avatarColorClass(name) : 'border border-dashed border-border-hover bg-transparent text-text-muted',
    )}
  >
    <Building2 size={size === 'md' ? 16 : 14} strokeWidth={2.25} />
  </span>
);

export const DepartmentField = ({
  id, value = '', onChange, selectedIds = [], onChangeMany, multiple = false, departments, isLoading = false, disabled = false, noneLabel, onCreateNew, className,
}: DepartmentFieldProps) => {
  const [open, setOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const { data: stores } = useStoresQuery();
  const storeName = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s.name])), [stores]);

  const byId = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d])), [departments]);
  const hintOf = (d: Department) => (d.storeId ? storeName.get(d.storeId) : undefined);
  const activeIds = multiple ? selectedIds : value ? [value] : [];
  const pickedList = activeIds.map((pid) => byId.get(pid)).filter((d): d is Department => !!d);
  const picked = pickedList[0];
  const extraCount = pickedList.length - 1;

  const options = useMemo<ListOption[]>(
    () => [
      ...(!multiple && noneLabel ? [{ value: '', label: noneLabel, lead: <DepartmentTile name={null} size="md" /> }] : []),
      ...(departments ?? []).map((d) => ({
        value: d.id,
        label: d.name,
        hint: d.storeId ? storeName.get(d.storeId) : undefined,
        lead: <DepartmentTile name={d.name} size="md" />,
      })),
    ],
    [departments, multiple, noneLabel, storeName],
  );

  const toggle = (pid: string) => {
    if (!multiple) {
      onChange?.(pid);
      setOpen(false);
      return;
    }
    onChangeMany?.(activeIds.includes(pid) ? activeIds.filter((x) => x !== pid) : [...activeIds, pid]);
  };

  const subLine = multiple && extraCount > 0
    ? `Main team, plus ${extraCount} more: ${pickedList.slice(1).map((d) => d.name).join(', ')}`
    : picked && multiple ? 'Main team' : picked ? hintOf(picked) : undefined;

  const body = (
    <>
      <DepartmentTile name={picked?.name ?? null} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate t-meta font-display font-semibold', picked ? 'text-text' : 'text-text-muted')}>
          {isLoading ? 'Loading…' : picked ? picked.name : noneLabel ?? 'Choose a department'}
        </span>
        {picked && subLine && <span className="truncate t-meta leading-tight text-text-muted">{subLine}</span>}
      </span>
      {multiple && extraCount > 0 && (
        <span className="shrink-0 rounded-full bg-surface-hover px-1.5 t-meta font-semibold text-text-muted">+{extraCount}</span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={cn('flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface-hover/40 pl-1.5 pr-2.5', className)}>
        {body}
      </div>
    );
  }

  const inline = multiple && !isPhone;

  const trigger = (
    <button
      id={id}
      ref={setTriggerEl}
      type="button"
      aria-expanded={inline ? open : undefined}
      onClick={inline ? () => setOpen((o) => !o) : undefined}
      aria-label={picked ? `Department: ${pickedList.map((d) => d.name).join(', ')}. Change` : 'Choose a department'}
      title="Change department"
      className={cn(
        'group/dept flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-surface pl-1.5 pr-2.5 text-left outline-none transition-colors duration-150 ease-out hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] pointer-coarse:h-11',
        className,
      )}
    >
      {body}
      <span className="inline-flex shrink-0 items-center gap-0.5 t-meta font-display font-semibold text-primary-600 dark:text-primary-300">
        {picked ? 'Change' : 'Pick'}
        <ChevronDown size={13} strokeWidth={2.5} className="transition-transform duration-150 group-aria-expanded/dept:rotate-180" aria-hidden="true" />
      </span>
    </button>
  );

  const list = (
    <OptionList
      multiple={multiple}
      options={options}
      selected={multiple ? activeIds : [value]}
      isLoading={isLoading}
      emptyText="No departments yet"
      searchable
      searchPlaceholder="Search departments…"
      onToggle={toggle}
      topActions={onCreateNew ? [{
        key: 'create',
        label: 'New department',
        icon: Plus,
        tone: 'primary' as const,
        onSelect: () => { setOpen(false); onCreateNew(); },
      }] : undefined}
    />
  );

  if (inline) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1.5">
        {trigger}
        {open && (
          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface p-2">
            <div className="max-h-72 overflow-y-auto overscroll-contain">{list}</div>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)} className="w-full font-display">
              {activeIds.length ? `Done, ${activeIds.length} selected` : 'Done'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <PickerShell
      bare
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={multiple ? 'Choose departments' : 'Choose a department'}
      popoverContainer={triggerEl?.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]') ?? undefined}
      popoverClassName="w-[min(22rem,calc(100vw-2rem))] max-h-80"
      sheetFooter={isPhone && multiple && (
        <Button variant="primary" onClick={() => setOpen(false)} className="w-full h-11 font-display">
          {activeIds.length ? `Done, ${activeIds.length} selected` : 'Done'}
        </Button>
      )}
    >
      {list}
    </PickerShell>
  );
};
