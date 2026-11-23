import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLayoutAnimations } from '../../lib/useLayoutAnimations';

interface SmoothItemProps {
  active: boolean;
  children: ReactNode;
}

const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } as const;

/** Slides a row to its new place when a list reorders. Plain markup where that is turned off. */
export const SmoothItem = ({ active, children }: SmoothItemProps) => {
  const animated = useLayoutAnimations();
  if (!active || !animated) return <div>{children}</div>;
  return <motion.div layout="position" transition={SPRING}>{children}</motion.div>;
};
