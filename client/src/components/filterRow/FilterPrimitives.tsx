import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { avatarColorClass } from '../../lib/avatarColors';
import { getInitials } from '../../lib/getInitials';

export const OptionRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2 min-w-0">
    <span className="text-xs font-display font-semibold text-text-secondary sm:t-meta sm:font-bold sm:text-text-light sm:tracking-widest">{label}</span>
    {children}
  </div>
);

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
  dotClassName?: string;
  icon?: LucideIcon;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs font-display font-medium transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-95 [-webkit-tap-highlight-color:transparent] ${
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
