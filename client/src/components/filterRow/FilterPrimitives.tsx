import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';

/**
 * The building blocks for a row inside an Options dialog.
 *
 * These lived in `features/tickets/list/` and were imported from there by `features/tasks/` —
 * Delegation reaching across into Tickets for generic UI, which made the Tickets folder look like
 * it owned controls that four files share. Moved verbatim; the markup is unchanged.
 */

// Phones get a plain readable label (12px, secondary text, normal tracking) — the desktop's tiny
// letter-spaced light-grey caps style read as faint noise on a small screen, especially in dark mode.
export const OptionRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2 min-w-0">
    <span className="text-xs font-display font-semibold text-text-secondary sm:t-meta sm:font-bold sm:text-text-light sm:tracking-widest">{label}</span>
    {children}
  </div>
);

// Full width on phones so every group in the sheet shares one right edge (w-fit left each group a
// different ragged width); desktop keeps w-fit.
export const FilterGroup = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-1 p-1 rounded-xl sm:rounded-lg bg-surface-hover/50 border border-border/40 w-full sm:w-fit flex-wrap">
    {children}
  </div>
);

export const FilterPill = ({
  active,
  onClick,
  children,
  dotClassName,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Bg/text/border classes for a small leading dot (e.g. `lib/labelColors`'s `labelDotClass`) —
   *  opt-in, so Priority/Category/Status/etc. pills are unaffected. Used by Delegation's Labels
   *  filter so a label reads as the same colour here as everywhere else it's shown. */
  dotClassName?: string;
  /** A leading Lucide icon instead of (not combined with) the dot above — opt-in the same way, for
   *  rows where each option already has a real icon elsewhere (e.g. Priority's arrow icons) rather
   *  than just a colour. */
  icon?: LucideIcon;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs font-display font-medium transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-95 [-webkit-tap-highlight-color:transparent] ${
      // Flat fill + hairline border, no shadow/ring — same "raised card on a gray track" language
      // AssignmentModeToggle's segmented control already uses, instead of this being the one
      // filter pill in the app still marking its active state with elevation.
      active
        ? 'bg-surface-active text-text border border-border'
        : 'text-text-muted hover:text-text-secondary hover:bg-surface-active/50 border border-transparent'
    }`}
  >
    {Icon && <Icon size={12} strokeWidth={2.5} className="shrink-0" />}
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
    className={`relative flex items-center justify-center size-9 sm:size-7 rounded-full t-meta sm:t-meta font-bold text-white transition-all duration-200 cursor-pointer ${avatarColorClass(name)} ${
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
