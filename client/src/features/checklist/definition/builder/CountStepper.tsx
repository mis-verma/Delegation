import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}

const STEP_BUTTON =
  'flex size-11 sm:size-8 items-center justify-center rounded-full text-text-secondary outline-none transition-colors duration-150 ' +
  'hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer';

export const CountStepper = ({ value, min = 0, max = 99, onChange, label, className }: CountStepperProps) => (
  <div role="group" aria-label={label} className={cn('inline-flex items-center rounded-full border border-border bg-surface p-0.5', className)}>
    <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={STEP_BUTTON}>
      <Minus size={14} strokeWidth={2.5} aria-hidden />
    </button>
    <output aria-live="polite" className="min-w-8 text-center t-card font-display font-bold tabular-nums text-text">{value}</output>
    <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={STEP_BUTTON}>
      <Plus size={14} strokeWidth={2.5} aria-hidden />
    </button>
  </div>
);
