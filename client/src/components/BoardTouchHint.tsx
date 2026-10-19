import { useState } from 'react';
import { Hand, X } from 'lucide-react';

const STORAGE_KEY = 'board-touch-hint-dismissed';

const shouldShow = () => {
  if (typeof window === 'undefined') return false;
  if (!window.matchMedia('(pointer: coarse)').matches) return false;
  try { return localStorage.getItem(STORAGE_KEY) !== '1'; } catch { return true; }
};

export const BoardTouchHint = () => {
  const [visible, setVisible] = useState(shouldShow);
  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { }
    setVisible(false);
  };

  return (
    <div role="note" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-surface-hover/60 text-xs font-display text-text-secondary">
      <Hand size={14} className="shrink-0 text-text-light" aria-hidden />
      <span className="flex-1 min-w-0">Press and hold a card, then drag it to another column to change its status.</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="relative flex items-center justify-center size-7 shrink-0 rounded-full text-text-muted hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-2"
      >
        <X size={14} />
      </button>
    </div>
  );
};
