import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PANEL_CLASS } from '../../../components';
import { useIsMobile } from '../../../lib/useMediaQuery';

interface PhoneCollapseProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const PhoneCollapse = ({ title, hint, defaultOpen = false, children }: PhoneCollapseProps) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!isMobile) return <>{children}</>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={panelId}
        className={`${PANEL_CLASS} flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="t-section font-display font-bold text-text">{title}</span>
          {hint && <span className="t-meta font-display text-text-muted">{hint}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div id={panelId} className="flex flex-col gap-3">
      {children}
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded
        aria-controls={panelId}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-lg px-3 t-meta font-display font-semibold text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <ChevronUp className="size-4" aria-hidden="true" />
        Hide {title.toLowerCase()}
      </button>
    </div>
  );
};
