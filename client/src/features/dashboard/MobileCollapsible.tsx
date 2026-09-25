import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface MobileCollapsibleProps {
  /** What's being shown/hidden, lowercase — used in "Show {label}" / "Hide {label}". */
  label: string;
  children: ReactNode;
}

// Below `sm`, a card's heaviest content (chart, filter row) starts collapsed behind this toggle —
// same data, just not all of every card stacked open at once on a phone. `sm:` and up render
// `children` exactly as if this wrapper weren't there (`contents` keeps it out of the parent's
// flex/grid layout — no extra box, no gap/spacing side effects).
export const MobileCollapsible = ({ label, children }: MobileCollapsibleProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="sm:hidden flex items-center gap-1.5 self-start text-xs font-display font-semibold text-text-secondary hover:text-text transition-colors duration-200 cursor-pointer"
      >
        {open ? `Hide ${label}` : `Show ${label}`}
        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={open ? 'contents' : 'hidden sm:contents'}>{children}</div>
    </>
  );
};
