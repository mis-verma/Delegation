import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCloseOnBack } from '../../lib/useCloseOnBack';

export interface FabAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  description?: string;
  disabled?: boolean;
  badge?: string;
}

export interface FabProps {
  actions: FabAction[];
  icon?: LucideIcon;
  sheetTitle?: string;
  'aria-label'?: string;
}

const tap = () => haptic('tap');

export const Fab = ({ actions, icon: Icon = Plus, sheetTitle = 'Create', 'aria-label': ariaLabel }: FabProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  const primary = actions[0] ?? null;
  const hasMore = actions.length > 1;
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const startHold = () => {
    if (!hasMore) return;
    held.current = false;
    holdTimer.current = window.setTimeout(() => { held.current = true; haptic('success'); setSheetOpen(true); }, 450);
  };
  const endHold = () => { if (holdTimer.current !== null) window.clearTimeout(holdTimer.current); holdTimer.current = null; };

  useCloseOnBack(sheetOpen, () => setSheetOpen(false));

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

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
    if (held.current) { held.current = false; return; }
    tap();
    if (primary && !primary.disabled) primary.onClick();
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
        {hasMore && (
          <button
            type="button"
            onClick={() => { tap(); setSheetOpen(true); }}
            aria-label={`More: ${actions.slice(1).map((a) => a.label).join(', ')}`}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center justify-center size-9 rounded-full border border-border/70 bg-surface text-text-secondary ring-4 ring-background cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]"
          >
            <MoreHorizontal className="size-4" strokeWidth={2.5} />
          </button>
        )}
        <button
          type="button"
          onClick={handleMainClick}
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(e) => { if (hasMore) e.preventDefault(); }}
          disabled={primary?.disabled}
          aria-label={ariaLabel ?? primary?.label ?? sheetTitle}
          className={cn(
            'flex items-center justify-center size-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white cursor-pointer transition-transform duration-150 ease-out',
            'ring-4 ring-background active:scale-95 focus-visible:outline-none focus-visible:ring-primary-500/40',
            'disabled:opacity-50 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]',
          )}
        >
          {primary ? <primary.icon className="size-6" strokeWidth={2.5} /> : <Icon className="size-6" strokeWidth={2.5} />}
        </button>
      </div>

      {hasMore && sheetOpen && (
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
