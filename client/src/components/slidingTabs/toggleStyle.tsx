import { motion, useReducedMotion } from 'framer-motion';

export const TOGGLE_TRACK = 'relative inline-flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-full bg-surface-hover/70 p-1 ring-1 ring-inset ring-border/50';

export const TOGGLE_ITEM = 'group relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-4 font-display font-semibold outline-none transition-colors duration-150 ease-out select-none active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/60 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]';

export const TOGGLE_SIZE_MD = 'min-h-11 t-card sm:min-h-10';

export const TOGGLE_SIZE_SM = 'min-h-11 t-meta sm:min-h-9';

export const TOGGLE_ON = 'text-text';

export const TOGGLE_OFF = 'text-text-muted hover:text-text';

const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 } as const;

export const TogglePill = ({ id }: { id: string }) => {
  const reduce = useReducedMotion();
  return (
    <motion.span
      layoutId={id}
      transition={reduce ? { duration: 0 } : SPRING}
      className="absolute inset-0 rounded-full bg-surface ring-1 ring-border/60"
      aria-hidden="true"
    />
  );
};
