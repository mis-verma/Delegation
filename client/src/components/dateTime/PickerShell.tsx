import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../ui/dialog';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useCloseOnBack } from '../../lib/useCloseOnBack';
import { cn } from '@/lib/utils';

interface PickerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  triggerAside?: ReactNode;
  wrapperClassName?: string;
  bare?: boolean;
  title: string;
  sheetFooter?: ReactNode;
  popoverClassName?: string;
  popoverContainer?: HTMLElement | null;
  children: ReactNode;
}

export const PickerShell = ({
  open, onOpenChange, trigger, triggerAside, wrapperClassName, bare = false, title, sheetFooter, popoverClassName, popoverContainer, children,
}: PickerShellProps) => {
  const isPhone = useMediaQuery('(max-width: 639px)');
  useCloseOnBack(open && isPhone, () => onOpenChange(false));

  if (isPhone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {bare ? (
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : (
          <div className={cn('relative', wrapperClassName)}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            {triggerAside}
          </div>
        )}
        <DialogContent
          showCloseButton={false}
          className="p-0 gap-0 flex flex-col rounded-t-2xl max-h-[92dvh] overflow-hidden"
        >
          <div className="shrink-0 flex items-center justify-between gap-3 pl-5 pr-2 pt-3 pb-1">
            <DialogTitle className="text-base font-display font-semibold text-text">{title}</DialogTitle>
            <DialogClose
              aria-label="Close"
              className="flex items-center justify-center size-11 rounded-full text-text-muted hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <X size={18} strokeWidth={2.5} />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">Make your choice below.</DialogDescription>
          <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 flex flex-col gap-3', sheetFooter ? 'pb-4' : 'pb-[max(1rem,env(safe-area-inset-bottom))]')}>{children}</div>
          {sheetFooter && (
            <div className="shrink-0 border-t border-border/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{sheetFooter}</div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} modal onOpenChange={onOpenChange}>
      {bare ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        <div className={cn('relative', wrapperClassName)}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          {triggerAside}
        </div>
      )}
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        container={popoverContainer}
        className={cn(
          'w-auto max-w-[calc(100vw-1.5rem)] max-h-[min(36rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain custom-scrollbar p-3',
          popoverClassName,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
};

export type { PickerShellProps };
