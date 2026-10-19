import { useEffect, useRef } from 'react';

export interface QueueShortcutHandlers {
  enabled: boolean;
  sheetOpen: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onApprove: () => void;
  onSendBack: () => void;
  onOpen: () => void;
  onClose: () => void;
  onHelp: () => void;
}

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
