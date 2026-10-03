import type { ComponentProps } from 'react';
import { Button } from '../../../components';
import { cn } from '@/lib/utils';

// The tinted-primary "Save / Mark complete / Confirm" action on an item card. It is the shared Button
// (outline, sm: 44px tall on touch, focus ring, isLoading spinner) with the primary tint on top, so a
// card full of neutral controls still shows which one commits the answer.
export const ItemActionButton = ({ className, ...props }: ComponentProps<typeof Button>) => (
  <Button
    size="sm"
    variant="outline"
    className={cn(
      'border-primary-500/50 text-primary-700 dark:text-primary-300 hover:border-primary-500 hover:bg-primary-500/10',
      className,
    )}
    {...props}
  />
);
