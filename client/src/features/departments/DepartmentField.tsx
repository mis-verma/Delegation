import { useMemo, useState } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { PickerShell } from '../../components/dateTime/PickerShell';
import { OptionList, type ListOption } from '../../components/dropdown/OptionList';
import { avatarColorClass } from '../../lib/avatarColors';
import { cn } from '@/lib/utils';
import { useStoresQuery } from '../tickets/hook';
import type { Department } from '../../api/departments';

interface DepartmentFieldProps {
  value: string;
  onChange: (id: string) => void;
  departments?: Department[];
  isLoading?: boolean;
  disabled?: boolean;
  noneLabel?: string;
  onCreateNew?: () => void;
  className?: string;
}

const DepartmentTile = ({ name, size }: { name: string | null; size: 'sm' | 'md' }) => (
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

export const DepartmentField = ({ value, onChange, departments, isLoading = false, disabled = false, noneLabel, onCreateNew, className }: DepartmentFieldProps) => {
  const [open, setOpen] = useState(false);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const { data: stores } = useStoresQuery();
  const storeName = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s.name])), [stores]);

  const hintOf = (d: Department) => (d.storeId ? storeName.get(d.storeId) : undefined);
  const picked = (departments ?? []).find((d) => d.id === value);

  const options = useMemo<ListOption[]>(
    () => [
      ...(noneLabel ? [{ value: '', label: noneLabel, lead: <DepartmentTile name={null} size="md" /> }] : []),
      ...(departments ?? []).map((d) => ({
        value: d.id,
        label: d.name,
        hint: d.storeId ? storeName.get(d.storeId) : undefined,
        lead: <DepartmentTile name={d.name} size="md" />,
      })),
    ],
    [departments, noneLabel, storeName],
  );

  const body = (
    <>
      <DepartmentTile name={picked?.name ?? null} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate t-meta font-display font-semibold', picked ? 'text-text' : 'text-text-muted')}>
          {isLoading ? 'Loading…' : picked ? picked.name : noneLabel ?? 'Choose a department'}
        </span>
        {picked && hintOf(picked) && <span className="truncate t-meta leading-tight text-text-muted">{hintOf(picked)}</span>}
      </span>
    </>
  );

  if (disabled) {
    return (
      <div className={cn('flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface-hover/40 pl-1.5 pr-2.5', className)}>
        {body}
      </div>
    );
  }

  const trigger = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-label={picked ? `Department: ${picked.name}. Change` : 'Choose a department'}
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

  return (
    <PickerShell
      bare
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Choose a department"
      popoverContainer={triggerEl?.closest<HTMLElement>('[role="dialog"], [data-slot="dialog-content"]') ?? undefined}
      popoverClassName="w-[min(22rem,calc(100vw-2rem))]"
    >
      <OptionList
        options={options}
        selected={[value]}
        isLoading={isLoading}
        emptyText="No departments yet"
        searchable
        searchPlaceholder="Search departments…"
        onToggle={(id) => { onChange(id); setOpen(false); }}
        topActions={onCreateNew ? [{
          key: 'create',
          label: 'New department',
          icon: Plus,
          tone: 'primary' as const,
          onSelect: () => { setOpen(false); onCreateNew(); },
        }] : undefined}
      />
    </PickerShell>
  );
};
