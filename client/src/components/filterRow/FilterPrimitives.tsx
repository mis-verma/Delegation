import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';

/**
 * The building blocks for a row inside an Options dialog.
 *
 * These lived in `features/tickets/list/` and were imported from there by `features/tasks/` —
 * Delegation reaching across into Tickets for generic UI, which made the Tickets folder look like
 * it owned controls that four files share. Moved verbatim; the markup is unchanged.
 */

export const OptionRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[11px] font-bold text-text-light tracking-widest">{label}</span>
    {children}
  </div>
);

export const FilterGroup = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-hover/50 border border-border/40 w-fit flex-wrap">
    {children}
  </div>
);

export const FilterPill = ({
  active,
  onClick,
  children,
  dotClassName,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Bg/text/border classes for a small leading dot (e.g. `lib/labelColors`'s `labelDotClass`) —
   *  opt-in, so Priority/Category/Status/etc. pills are unaffected. Used by Delegation's Labels
   *  filter so a label reads as the same colour here as everywhere else it's shown. */
  dotClassName?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
      active
        ? 'bg-background text-text shadow-sm ring-1 ring-border/50'
        : 'text-text-muted hover:text-text-secondary hover:bg-surface-active/50'
    }`}
  >
    {dotClassName && <span aria-hidden className={`size-2 rounded-full shrink-0 ${dotClassName}`} />}
    {children}
  </button>
);

export const PersonToggle = ({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    title={name}
    aria-label={name}
    aria-pressed={selected}
    className={`relative flex items-center justify-center size-7 rounded-full text-[10px] font-bold text-white transition-all duration-200 cursor-pointer ${avatarColorClass(name)} ${
      selected ? 'opacity-100 scale-105 ring-2 ring-offset-2 ring-offset-surface ring-primary-400' : 'opacity-60 hover:opacity-100'
    }`}
  >
    {getInitials(name)}
    {selected && (
      <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-3.5 rounded-full bg-primary-500 text-white animate-in zoom-in duration-200">
        <Check size={8} strokeWidth={4} />
      </span>
    )}
  </button>
);
