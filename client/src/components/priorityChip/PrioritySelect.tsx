import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SelectDropdown } from '../dropdown';
import { IconChip } from '../iconChip';

export interface PrioritySelectOption<V extends string> {
  value: V;
  label: string;
  /** Gradient classes for the icon tile, from the shared priority meta. */
  solid: string;
  icon: LucideIcon;
}

interface PrioritySelectProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PrioritySelectOption<V>[];
  disabled?: boolean;
  /** Fill the row, like every other form field. Off for the inline chip beside other chips. */
  fullWidth?: boolean;
}

const Tile = ({ icon: Icon, solid }: { icon: LucideIcon; solid: string }) => (
  <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-white', solid)} aria-hidden="true">
    <Icon className="size-3.5" strokeWidth={2.75} />
  </span>
);

/**
 * The priority field, built on the app's one select (SelectDropdown): the same 44px trigger, bottom sheet on a
 * phone and menu on a PC as every other dropdown, with each level led by its gradient icon tile. Replaces the
 * small chip that opened a menu on a light touch. A person who may only view it sees the plain chip.
 */
export function PrioritySelect<V extends string>({ value, onChange, options, disabled = false, fullWidth = true }: PrioritySelectProps<V>) {
  const current = options.find((o) => o.value === value) ?? options[0];
  if (disabled) return <IconChip icon={current.icon} tone={current.solid} label={current.label} />;
  return (
    <SelectDropdown
      aria-label="Priority"
      label="Priority"
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ value: o.value, label: o.label, lead: <Tile icon={o.icon} solid={o.solid} /> }))}
      triggerClassName={cn('rounded-xl font-display font-semibold', !fullWidth && 'w-auto min-w-40')}
      contentClassName="min-w-48"
    />
  );
}
