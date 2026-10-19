import type { ComponentProps } from 'react';
import { Button } from '../../../components';
import { cn } from '@/lib/utils';

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
