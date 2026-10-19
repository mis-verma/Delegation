import type { KeyboardEvent } from 'react';

export const onRadioKeyDown = (e: KeyboardEvent<HTMLElement>, index: number, count: number, select: (next: number) => void) => {
  let next: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  else return;
  e.preventDefault();
  select(next);
  const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
};
