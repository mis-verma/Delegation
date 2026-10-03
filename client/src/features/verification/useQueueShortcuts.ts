import { useEffect, useRef } from 'react';

export interface QueueShortcutHandlers {
  /** Off while the page is not showing the waiting list. */
  enabled: boolean;
  /** The mobile review sheet is open: its own dialog must not block the keys. */
  sheetOpen: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onApprove: () => void;
  onSendBack: () => void;
  onOpen: () => void;
  onClose: () => void;
  onHelp: () => void;
}

// Where a key press belongs to something else: typing, a dropdown being driven by arrow keys.
const OWN_KEYS_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"], [role="combobox"], [role="tab"]';

export const useQueueShortcuts = (handlers: QueueShortcutHandlers) => {
  const ref = useRef(handlers);
  useEffect(() => { ref.current = handlers; });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const h = ref.current;
      if (!h.enabled || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest(OWN_KEYS_SELECTOR)) return;
      // Another dialog (help, confirm, ticket detail) or the photo viewer owns the keyboard.
      if (document.querySelector('[aria-label="Image preview"]')) return;
      if (!h.sheetOpen && document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          h.onNext();
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          h.onPrevious();
          break;
        case 'a':
          h.onApprove();
          break;
        case 's':
          e.preventDefault();
          h.onSendBack();
          break;
        case 'Enter':
          // On a focused button or link Enter already does its own thing (the row title opens it).
          if (target?.closest('button, a')) return;
          h.onOpen();
          break;
        case 'Escape':
          h.onClose();
          break;
        case '?':
          h.onHelp();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
