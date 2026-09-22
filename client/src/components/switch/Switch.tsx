import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Plain on/off control for a single boolean setting — no shared shadcn Switch existed in this
// codebase yet. Flat border-only styling (no box-shadow on the track or knob) to match the app's
// standing no-card-shadow convention rather than the usual drop-shadow knob.
export const Switch = ({ checked, onChange, id, disabled, className }: SwitchProps) => (
  <button
    type="button"
    id={id}
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
      checked ? 'bg-primary-600 border-primary-600' : 'bg-surface-hover border-border',
      className
    )}
  >
    <span
      className={cn(
        'inline-block size-4.5 rounded-full bg-white transition-transform duration-200 ease-in-out',
        checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
      )}
    />
  </button>
);
