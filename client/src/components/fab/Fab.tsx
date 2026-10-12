import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCloseOnBack } from '../../lib/useCloseOnBack';

export interface FabAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** One short line under the label in the action sheet, e.g. "Type it in yourself". */
  description?: string;
  disabled?: boolean;
  /** Small tag beside the label in the action sheet, e.g. "Soon". */
  badge?: string;
}

export interface FabProps {
  actions: FabAction[];
  /** Icon on the button when there's more than one action. Ignored for a single action. */
  icon?: LucideIcon;
  /** Title of the action sheet, e.g. "Create". */
  sheetTitle?: string;
  'aria-label'?: string;
}

// A short tick on Android when the button is pressed, like a native app. iOS browsers ignore it.
const tap = () => {
  try { navigator.vibrate?.(8); } catch { /* not supported: nothing to do */ }
};

/**
 * Phone-only round + button, working like an app's:
 * - One action: a tap does it straight away (opens the form).
 * - More than one: a tap opens a bottom action sheet with one big row per action, the first being the
 *   everyday one. A tap outside, Cancel, Escape or the phone's Back button closes it.
 * - It slides out of the way while the list scrolls down and comes back on the first scroll up, so it
 *   never sits on top of what the person is reading.
 */
export const Fab = ({ actions, icon: Icon = Plus, sheetTitle = 'Create', 'aria-label': ariaLabel }: FabProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  const singleAction = actions.length === 1 ? actions[0] : null;

  useCloseOnBack(sheetOpen, () => setSheetOpen(false));

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Hide while scrolling down, show again on any scroll up or near the top.
  useEffect(() => {
    lastY.current = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 80 || delta < -6) setHidden(false);
        else if (delta > 6) setHidden(true);
        lastY.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleMainClick = () => {
    tap();
    if (singleAction) {
      if (!singleAction.disabled) singleAction.onClick();
    } else {
      setSheetOpen(true);
    }
  };

  const runAction = (action: FabAction) => {
    if (action.disabled) return;
    tap();
    setSheetOpen(false);
    action.onClick();
  };

  return createPortal(
    <>
      <div
        className={cn(
          'md:hidden fixed right-4 sm:right-6 z-40 transition-transform duration-200 ease-out motion-reduce:transition-none',
          hidden && !sheetOpen ? 'translate-y-[calc(100%+8rem)]' : 'translate-y-0',
        )}
        style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={handleMainClick}
          disabled={singleAction?.disabled}
          aria-label={ariaLabel ?? singleAction?.label ?? sheetTitle}
          aria-haspopup={singleAction ? undefined : 'dialog'}
          aria-expanded={singleAction ? undefined : sheetOpen}
          className={cn(
            'flex items-center justify-center size-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white cursor-pointer transition-transform duration-150 ease-out',
            // No shadow: a ring in the page colour lifts the button off whatever scrolls beneath it.
            'ring-4 ring-background active:scale-95 focus-visible:outline-none focus-visible:ring-primary-500/40',
            'disabled:opacity-50 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]',
          )}
        >
          {singleAction ? <singleAction.icon className="size-6" strokeWidth={2.5} /> : <Icon className="size-6" strokeWidth={2.5} />}
        </button>
      </div>

      {!singleAction && sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/40 cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={sheetTitle}
            className="relative flex flex-col gap-2 rounded-t-2xl bg-surface border-t border-border px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200 ease-out motion-reduce:animate-none"
          >
            <span className="self-center h-1 w-8 rounded-full bg-border" aria-hidden />
            <p className="t-section font-display font-bold text-text px-1 pt-1">{sheetTitle}</p>
            <ul className="flex flex-col">
              {actions.map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    onClick={() => runAction(action)}
                    disabled={action.disabled}
                    className="w-full flex items-center gap-3 min-h-16 px-1 py-2 rounded-xl text-left cursor-pointer transition-colors duration-150 ease-out active:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
                  >
                    <span className="flex items-center justify-center size-11 shrink-0 rounded-xl bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                      <action.icon className="size-5" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="flex items-center gap-1.5 t-card font-display font-semibold text-text">
                        {action.label}
                        {action.badge && (
                          <span className="t-meta font-semibold px-1.5 rounded-md bg-surface-hover text-text-muted">{action.badge}</span>
                        )}
                      </span>
                      {action.description && <span className="t-meta text-text-muted">{action.description}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="h-12 rounded-xl border border-border bg-surface t-card font-display font-semibold text-text-secondary cursor-pointer transition-colors duration-150 ease-out active:bg-surface-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};
