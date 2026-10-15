import { useState, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { PickerShell } from '../dateTime/PickerShell';
import { OptionList } from './OptionList';
import { useMediaQuery } from '../../lib/useMediaQuery';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SelectDropdownOption<Value extends string> {
  value: Value;
  label: string;
  /** A leading visual (a coloured icon tile, an avatar), shown beside the label in the list and in the trigger. */
  lead?: ReactNode;
}

interface SelectDropdownProps<Value extends string> {
  value: Value;
  onChange: (value: Value) => void;
  options: SelectDropdownOption<Value>[];
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
  triggerClassName?: string;
  contentClassName?: string;
  'aria-label'?: string;
  /** Heading of the phone sheet. Defaults to the aria-label. */
  label?: string;
}

const TRIGGER_CLASS = cn(
  "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface pl-3.5 pr-2 text-sm font-medium text-text transition-all duration-200 outline-none cursor-pointer group",
  "hover:border-primary-400/70",
  "focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-500/15",
  "disabled:opacity-60 disabled:bg-surface-hover disabled:cursor-not-allowed disabled:border-border"
);

export function SelectDropdown<Value extends string>({
  value,
  onChange,
  options,
  disabled = false,
  align = 'start',
  triggerClassName,
  contentClassName,
  label,
  ...rest
}: SelectDropdownProps<Value>) {
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);

  const triggerButton = (
    <button
      ref={setTriggerEl}
      type="button"
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(TRIGGER_CLASS, triggerClassName)}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {selected?.lead}
        <span className="truncate">{selected?.label ?? '—'}</span>
      </span>
      <span className="flex items-center justify-center size-6 rounded-full bg-surface-hover text-text-light shrink-0 transition-colors duration-200 group-hover:bg-primary-500/10 group-hover:text-primary-700 dark:group-hover:text-primary-300">
        <ChevronDown size={14} strokeWidth={2.4} />
      </span>
    </button>
  );

  // Phones get a bottom sheet with 48px rows instead of a small menu under the field.
  if (isPhone) {
    return (
      <PickerShell
        bare
        open={open}
        onOpenChange={(next) => { if (!disabled) setOpen(next); }}
        trigger={triggerButton}
        title={label ?? rest['aria-label'] ?? 'Choose an option'}
      >
        <OptionList
          options={options}
          selected={[value]}
          onToggle={(v) => { onChange(v as Value); setOpen(false); }}
        />
      </PickerShell>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      
      <DropdownMenuContent
        align={align}
        className={cn(
          'min-w-[10rem] p-1.5 rounded-xl border border-border bg-surface animate-in fade-in-80 zoom-in-95 duration-200',
          contentClassName
        )}
        collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
        collisionPadding={16}
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => onChange(opt.value)}
              className={cn(
                "flex items-center justify-between gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer outline-none active:scale-[0.98]",
                isSelected
                  ? "text-primary-700 bg-gradient-to-r from-primary-500/15 to-primary-500/5 dark:text-primary-300"
                  : "text-text-secondary focus:bg-surface-hover focus:text-text"
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {opt.lead}
                <span className="truncate">{opt.label}</span>
              </span>
              {isSelected && (
                <span className="flex items-center justify-center size-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shrink-0"><Check size={10} strokeWidth={3.5} /></span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}