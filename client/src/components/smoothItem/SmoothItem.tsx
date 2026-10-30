import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface SmoothItemProps {
  active: boolean;
  children: ReactNode;
}

export const SmoothItem = ({ active, children }: SmoothItemProps) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div layout={active && !reduceMotion ? 'position' : false} transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }}>
      {children}
    </motion.div>
  );
};
