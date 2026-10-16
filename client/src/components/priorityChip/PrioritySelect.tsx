import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconChip } from '../iconChip';

export interface PrioritySelectOption<V extends string> {
  value: V;
  label: string;
  /** Gradient classes for the icon circle, from the shared priority meta. */
  solid: string;
  icon: LucideIcon;
}

interface PrioritySelectProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: PrioritySelectOption<V>[];
  disabled?: boolean;
  /** Kept for existing callers; the pills always fill the row they are in. */
  fullWidth?: boolean;
  /** Kept for existing callers (it styled the old dropdown's trigger); the pills ignore it. */
  triggerClassName?: string;
}

/**
 * The priority field as a row of pills, the same shape as the event types and the labels: every level visible and
 * one tap away, each led by its coloured icon circle, the picked one tinted blue with a tick. Three or four levels
 * share the row; on a narrow screen they wrap two by two. A person who may only view it sees the plain chip.
 */
export function PrioritySelect<V extends string>({ value, onChange, options, disabled = false }: PrioritySelectProps<V>) {
  const current = options.find((o) => o.value === value) ?? options[0];
  if (disabled) return <IconChip icon={current.icon} tone={current.solid} label={current.label} />;
  return (
    <div role="radiogroup" aria-label="Priority" className="flex w-full flex-wrap gap-1.5">
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
              'flex min-w-0 flex-1 basis-[5.25rem] items-center justify-center gap-1.5 h-9 pointer-coarse:h-10 px-2 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent]',
              on ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover',
            )}
          >
            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-white', solid)} aria-hidden="true">
              <Icon className="size-3 text-white!" strokeWidth={2.75} />
            </span>
            <span className="truncate">{label}</span>
            {on && <Check size={12} strokeWidth={3} className="shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
