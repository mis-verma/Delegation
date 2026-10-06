import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, type LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FabAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Small corner badge on the sub-action button, e.g. "Soon". */
  badge?: string;
}

export interface FabProps {
  actions: FabAction[];
  /** Icon on the closed button when there's more than one action. Ignored for a single action. */
  icon?: LucideIcon;
  'aria-label'?: string;
}

export const Fab = ({ actions, icon: Icon = Plus, 'aria-label': ariaLabel }: FabProps) => {
  const [expanded, setExpanded] = useState(false);

  const isSingleAction = actions.length === 1;
  const singleAction = isSingleAction ? actions[0] : null;

  const handleMainClick = () => {
    if (singleAction) {
      if (!singleAction.disabled) singleAction.onClick();
    } else {
      setExpanded((v) => !v);
    }
  };

  return createPortal(
    <>
      {/* Tap-outside-to-close backdrop. Stays mounted and fades on opacity — AnimatePresence was
          only buying the exit fade, and `pointer-events-none` makes a permanently-present
          full-screen overlay harmless while it's invisible. */}
      {!isSingleAction && (
        <div
          onClick={() => setExpanded(false)}
          aria-hidden="true"
          className={`md:hidden fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}

      <div
        className="md:hidden fixed right-4 sm:right-6 z-40 flex flex-col items-end gap-4"
        style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }}
      >
        {!isSingleAction && (
          // The speed-dial items stay mounted and are transformed out of view when closed, which
          // gives the same open *and* close animation AnimatePresence provided. `inert` keeps the
          // hidden buttons off the tab order. The stagger is a per-item transition-delay, walked
          // bottom-up so the row nearest the FAB moves first — same order as before.
          <div
            inert={!expanded}
            className={`flex flex-col items-end gap-4 transition-opacity duration-200 ${
              expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
                {actions.map((action, i) => (
                  <div
                    key={action.key}
                    style={{ transitionDelay: `${(actions.length - 1 - i) * 40}ms` }}
                    className={`flex items-center gap-3.5 transition-all duration-200 ease-out motion-reduce:transition-none ${
                      expanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-90'
                    }`}
                  >
                    <span className="px-3.5 py-2 rounded-full bg-surface border border-border text-sm font-display font-semibold text-text whitespace-nowrap">
                      {action.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => { if (!action.disabled) { action.onClick(); setExpanded(false); } }}
                      disabled={action.disabled}
                      aria-label={action.label}
                      className={cn(
                        "relative flex items-center justify-center size-12 rounded-full border border-primary-500/30 bg-surface text-primary-700 dark:text-primary-300 transition-all duration-200 cursor-pointer active:scale-90",
                        "hover:bg-primary-500/10 hover:border-primary-500/50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-primary-500/30"
                      )}
                    >
                      <action.icon className="size-5" strokeWidth={2.25} />
                      {action.badge && (
                        <span className="absolute -top-2 -right-2 text-xs font-display font-semibold px-2 py-0.5 rounded-full bg-surface-hover border border-border text-text-muted">
                          {action.badge}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleMainClick}
          disabled={singleAction?.disabled}
          aria-label={ariaLabel ?? singleAction?.label ?? (expanded ? 'Close quick actions' : 'Quick actions')}
          aria-expanded={isSingleAction ? undefined : expanded}
          className={cn(
            "flex items-center justify-center size-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white cursor-pointer transition-all duration-300 ease-out",
            // No shadow: a ring in the page colour lifts the button off whatever scrolls beneath it.
            "ring-4 ring-background hover:from-primary-400 hover:to-primary-600",
            "active:scale-95 focus-visible:outline-none focus-visible:ring-primary-500/40",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
            (!isSingleAction && expanded) ? "scale-95 from-primary-600 to-primary-800" : ""
          )}
        >
          <span
            className={`flex transition-transform duration-300 ease-out motion-reduce:transition-none ${
              !isSingleAction && expanded ? 'rotate-[135deg]' : 'rotate-0'
            }`}
          >
            {singleAction ? <singleAction.icon className="size-6" strokeWidth={2.5} /> : <Icon className="size-6" strokeWidth={2.5} />}
          </span>
        </button>
      </div>
    </>,
    document.body
  );
};