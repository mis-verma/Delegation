import { useId, useMemo, useState } from 'react';
import { Building2, ChevronDown, Plus, X } from 'lucide-react';
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
  peopleCount?: (departmentId: string) => number;
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
  id, value = '', onChange, selectedIds = [], onChangeMany, multiple = false, departments, isLoading = false, disabled = false, noneLabel, onCreateNew, peopleCount, className,
}: DepartmentFieldProps) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const { data: stores } = useStoresQuery();
  const storeName = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s.name])), [stores]);

  const byId = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d])), [departments]);
  const hintOf = (d: Department) => (d.storeId ? storeName.get(d.storeId) : undefined);
  const rawIds = multiple ? selectedIds : value ? [value] : [];
  const activeIds = byId.size > 0 ? rawIds.filter((pid) => byId.has(pid)) : rawIds;
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
    ? `${pickedList.length} departments. The first is the main team.`
    : picked && multiple ? 'Main team' : picked ? hintOf(picked) : undefined;

  const makeMain = (pid: string) => onChangeMany?.([pid, ...activeIds.filter((x) => x !== pid)]);
  const removeOne = (pid: string) => onChangeMany?.(activeIds.filter((x) => x !== pid));

  const body = (
    <>
      <DepartmentTile name={picked?.name ?? null} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate t-meta font-display font-semibold', picked ? 'text-text' : 'text-text-muted')}>
          {isLoading ? 'Loading…' : picked ? (multiple ? pickedList.map((d) => d.name).join(', ') : picked.name) : noneLabel ?? 'Choose a department'}
        </span>
        {picked && subLine && <span className="truncate t-meta leading-tight text-text-muted">{subLine}</span>}
      </span>
    </>
  );

  const peopleNote = (departmentId: string) => {
    if (!peopleCount) return null;
    const count = peopleCount(departmentId);
    return (
      <span className={cn('shrink-0 t-meta font-display font-medium', count === 0 ? 'text-warning' : 'text-text-muted')}>
        {count === 0 ? 'no one picked' : `${count} ${count === 1 ? 'person' : 'people'}`}
      </span>
    );
  };

  const chips = multiple && pickedList.length > 0 && (
    <ul className="flex flex-wrap gap-1.5" aria-label="Selected departments">
      {pickedList.map((d, index) => (
        <li key={d.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-surface-hover/40 py-0.5 pl-1 pr-0.5">
          <DepartmentTile name={d.name} size="sm" />
          <span className="min-w-0 truncate t-meta font-display font-semibold text-text">{d.name}</span>
          {peopleNote(d.id)}
          {index === 0 ? (
            <span className="shrink-0 rounded-sm bg-primary-800 px-1.5 t-meta font-display font-semibold text-white">Main</span>
          ) : (
            <button
              type="button"
              onClick={() => makeMain(d.id)}
              className="shrink-0 cursor-pointer rounded-sm px-1.5 t-meta font-display font-semibold text-primary-600 outline-none hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300 pointer-coarse:min-h-9"
            >
              Make main
            </button>
          )}
          <button
            type="button"
            onClick={() => removeOne(d.id)}
            aria-label={`Remove ${d.name}`}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted outline-none transition-colors hover:bg-surface-active hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:size-9"
          >
            <X size={13} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );

  if (disabled) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1.5">
        <div className={cn('flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface-hover/40 pl-1.5 pr-2.5', className)}>
          {body}
        </div>
        {multiple && pickedList.length > 1 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected departments">
            {pickedList.map((d, index) => (
              <li key={d.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-surface-hover/40 py-0.5 pl-1 pr-2">
                <DepartmentTile name={d.name} size="sm" />
                <span className="min-w-0 truncate t-meta font-display font-semibold text-text">{d.name}</span>
                {peopleNote(d.id)}
                {index === 0 && <span className="shrink-0 rounded-sm bg-primary-800 px-1.5 t-meta font-display font-semibold text-white">Main</span>}
              </li>
            ))}
          </ul>
        )}
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
      aria-haspopup="listbox"
      aria-controls={inline && open ? `${panelId}` : undefined}
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
      <div
        className="flex w-full min-w-0 flex-col gap-1.5"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
            triggerEl?.focus();
          }
        }}
      >
        {trigger}
        {open && (
          <div id={panelId} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface p-2">
            <div className="max-h-72 overflow-y-auto overscroll-contain">{list}</div>
            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
              <span className="t-meta font-display font-medium text-text-muted">{activeIds.length === 0 ? 'None selected' : `${activeIds.length} selected`}</span>
              <div className="flex items-center gap-1.5">
                {activeIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => onChangeMany?.([])} className="font-display">Clear</Button>
                )}
                <Button variant="primary" size="sm" onClick={() => setOpen(false)} className="font-display">Done</Button>
              </div>
            </div>
          </div>
        )}
        {chips}
      </div>
    );
  }

  const picker = (
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

  return multiple ? (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {picker}
      {chips}
    </div>
  ) : picker;
};
