import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface InfoHintProps {
  /** What the control is about, read by screen readers: "What does Completion mean". */
  label: string;
  children: ReactNode;
}

/**
 * A small "i" that explains a number or term in plain words. A popover rather than a hover tooltip, so
 * it works with a tap on a phone as well as a click or the keyboard.
 */
export const InfoHint = ({ label, children }: InfoHintProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-light transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3 text-xs font-medium leading-relaxed text-text-secondary">
      {children}
    </PopoverContent>
  </Popover>
);
