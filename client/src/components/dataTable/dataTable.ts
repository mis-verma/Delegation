import type { KeyboardEvent } from 'react';

export const TABLE_FRAME_CLASS =
  'w-full overflow-auto overscroll-x-contain max-h-[min(72svh,56rem)] rounded-lg border border-border/60 bg-surface';

export const TH_CLASS =
  'sticky top-0 z-20 bg-primary-800 px-3 py-3 text-left t-meta font-semibold text-white tracking-tight whitespace-nowrap';

export const TH_CORNER_CLASS = 'left-0 z-30';

export const TD_CLASS = 'px-3 py-2.5 pointer-coarse:py-3 align-middle t-meta text-text-secondary';

export const TR_CLASS =
  'group border-b border-border/40 last:border-b-0 cursor-pointer transition-colors duration-200 ease-out hover:bg-surface-hover focus-visible:bg-surface-hover outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500';

export const TD_STICKY_CLASS =
  'sticky left-0 z-10 bg-surface transition-colors duration-200 ease-out group-hover:bg-surface-hover group-focus-visible:bg-surface-hover';

export const NUM_CLASS = 'text-right tabular-nums';

export const FIRST_COL_WIDTH_CLASS = 'min-w-44 max-w-56 lg:max-w-72 xl:max-w-[22rem]';

export const activateOnKey = <T extends HTMLElement>(onActivate: () => void) => (e: KeyboardEvent<T>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
};
