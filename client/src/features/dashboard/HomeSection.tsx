import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { haptic } from '../../lib/haptics';
import { useLongPress } from '../../lib/useLongPress';
import type { HomeSectionId } from './homeLayout';

interface HomeSectionProps {
  id: HomeSectionId;
  onHold: (id: HomeSectionId) => void;
  children: ReactNode;
}

export const HomeSection = ({ id, onHold, children }: HomeSectionProps) => {
  const { pressing, handlers } = useLongPress(() => {
    haptic('tap');
    onHold(id);
  });

  return (
    <div
      {...handlers}
      data-home-section={id}
      className={cn(
        'rounded-2xl transition-[transform,box-shadow] duration-300 ease-out [-webkit-touch-callout:none] pointer-coarse:select-none motion-reduce:transition-none',
        pressing && 'scale-[0.985] ring-2 ring-primary-500/40 ring-offset-2 ring-offset-background',
      )}
    >
      {children}
    </div>
  );
};
