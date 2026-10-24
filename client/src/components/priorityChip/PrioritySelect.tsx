import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../iconChip';

export interface PrioritySelectOption<V extends string> {
  value: V;
  label: string;
  solid: string;
  icon: LucideIcon;
}

interface PrioritySelectProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PrioritySelectOption<V>[];
  disabled?: boolean;
  fullWidth?: boolean;
  triggerClassName?: string;
}

export function PrioritySelect<V extends string>({ value, onChange, options, disabled = false }: PrioritySelectProps<V>) {
  const current = options.find((o) => o.value === value) ?? options[0];
  if (disabled) return <IconChip icon={current.icon} tone={current.solid} label={current.label} />;
  return (
    <div role="radiogroup" aria-label="Priority" className="@container flex w-full gap-1.5">
      {options.map(({ value: v, label, solid, icon: Icon }) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn(
              'flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 h-9 pointer-coarse:h-10 px-1.5 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent]',
              on ? 'border-primary-500/60 bg-primary-500/10 ring-1 ring-primary-500/30 text-primary-700 dark:text-primary-300' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover',
            )}
          >
            <span className={cn('hidden @min-[17rem]:flex size-5 shrink-0 items-center justify-center rounded-full text-white', solid)} aria-hidden="true">
              <Icon className="size-3 text-white!" strokeWidth={2.75} />
            </span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
