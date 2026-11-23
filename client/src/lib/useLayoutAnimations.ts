import { useReducedMotion } from 'framer-motion';
import { useMediaQuery } from './useMediaQuery';

/**
 * Whether rows may slide to a new position when a list reorders.
 *
 * Layout projection measures every animated row and its scroll container on each change. On a
 * phone that is the largest cost of answering a question, and the sliding is the part worth
 * least there, so it is off below sm. Both the rows and the scroll container that corrects them
 * read this, so the measuring never runs for animations that cannot happen.
 */
export const useLayoutAnimations = (): boolean => {
  const reduceMotion = useReducedMotion();
  const isPhone = useMediaQuery('(max-width: 639px)');
  return !reduceMotion && !isPhone;
};
