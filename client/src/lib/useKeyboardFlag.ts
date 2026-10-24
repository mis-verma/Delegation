import { useEffect } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number']);

const opensKeyboard = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el.isContentEditable;
};

export const useKeyboardFlag = () => {
  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)');
    const root = document.documentElement;
    let timer = 0;

    const sync = () => {
      if (touch.matches && opensKeyboard(document.activeElement)) root.setAttribute('data-keyboard', 'open');
      else root.removeAttribute('data-keyboard');
    };
    const onFocusIn = () => { window.clearTimeout(timer); sync(); };
    const onFocusOut = () => { window.clearTimeout(timer); timer = window.setTimeout(sync, 120); };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      root.removeAttribute('data-keyboard');
    };
  }, []);
};
