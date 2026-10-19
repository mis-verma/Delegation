import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../ui/dialog';
import { useDraggableDialog } from './useDraggableDialog';
import { useOptionalConfirm } from '../confirmDialog/ConfirmDialog';
import { useCloseOnBack } from '../../lib/useCloseOnBack';

const SWIPE_CLOSE_PX = 96;
const SWIPE_FLICK_PX_PER_MS = 0.5;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SIZE_CLASS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-4xl',
  '3xl': 'sm:max-w-5xl',
  '4xl': 'sm:max-w-6xl',
} as const;

const ICON_TONE_CLASS = {
  primary: 'bg-gradient-to-br from-primary-500/10 to-primary-700/10 dark:from-primary-500/20 dark:to-primary-700/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20',
  danger: 'bg-danger/10 text-danger ring-1 ring-danger/20',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconTone?: keyof typeof ICON_TONE_CLASS;
  size?: keyof typeof SIZE_CLASS;
  footer?: ReactNode;
  showCloseButton?: boolean;
  closeButtonClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  modal?: boolean;
  draggable?: boolean;
  dirty?: boolean;
  confirmClose?: () => boolean | Promise<boolean>;
  dismissOnOutsideClick?: boolean;
  closeOnBack?: boolean;
  children: ReactNode;
}

export const Modal = ({
  open,
  onClose,
  title,
  description,
  icon,
  iconTone = 'primary',
  size = 'md',
  footer,
  showCloseButton = true,
  closeButtonClassName = '',
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  modal = true,
  draggable = false,
  dirty = false,
  confirmClose,
  dismissOnOutsideClick = true,
  closeOnBack = true,
  children,
}: ModalProps) => {
  const { contentRef, isDragging, style: dragStyle, handleProps: dragHandleProps } = useDraggableDialog(open, draggable);
  const confirm = useOptionalConfirm();
  const guardPending = useRef(false);

  const guard: (() => boolean | Promise<boolean>) | undefined = confirmClose ?? (dirty
    ? () => confirm
      ? confirm({
          title: 'Discard changes?',
          description: 'What you entered here will be lost.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
          variant: 'danger',
        })
      : window.confirm('Discard changes? What you entered here will be lost.')
    : undefined);

  const requestClose = (): boolean | Promise<boolean> => {
    if (!guard) {
      onClose();
      return true;
    }
    if (guardPending.current) return false;
    const result = guard();
    if (result === true) {
      onClose();
      return true;
    }
    if (result === false) return false;
    guardPending.current = true;
    return result.then(
      (ok) => {
        guardPending.current = false;
        if (ok) onClose();
        return ok;
      },
      () => {
        guardPending.current = false;
        return false;
      },
    );
  };

  useCloseOnBack(open && closeOnBack, requestClose);

  const swipe = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onSwipeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    swipe.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (contentRef.current) contentRef.current.style.transition = 'none';
  };
  const onSwipeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    const node = contentRef.current;
    if (!s || !node) return;
    s.dy = Math.max(0, e.clientY - s.y);
    node.style.transform = `translateY(${s.dy}px)`;
  };
  const onSwipeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const node = contentRef.current;
    if (!s || !node) return;
    const fast = s.dy > 40 && s.dy / Math.max(1, performance.now() - s.t) > SWIPE_FLICK_PX_PER_MS;
    const shouldClose = s.dy > SWIPE_CLOSE_PX || fast;
    if (shouldClose && !guard) {
      onClose();
      return;
    }
    node.style.transition = 'transform 200ms ease-out';
    node.style.transform = '';
    if (shouldClose) void requestClose();
  };

  const blockOutside = !!guard || !dismissOnOutsideClick;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose();
      }}
      modal={modal}
    >
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        style={dragStyle}
        onInteractOutside={blockOutside ? (e) => e.preventDefault() : undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const content = contentRef.current;
          const active = document.activeElement;
          if (content && active && active !== content && content.contains(active)) return;
          content?.focus({ preventScroll: true });
        }}
        className={cn('w-full sm:w-[95vw]', SIZE_CLASS[size], 'p-0 flex flex-col overflow-hidden outline-none rounded-t-2xl rounded-b-none sm:rounded max-h-[90dvh]', isDragging && 'select-none', contentClassName)}
      >
        {draggable && (
          <span aria-hidden="true" className="hidden sm:block absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-border-hover" />
        )}
        <div
          aria-hidden="true"
          onPointerDown={onSwipeDown}
          onPointerMove={onSwipeMove}
          onPointerUp={onSwipeEnd}
          onPointerCancel={onSwipeEnd}
          className="sm:hidden absolute top-0 inset-x-16 z-10 h-6 flex justify-center pt-2 touch-none cursor-grab"
        >
          <span className="w-8 h-1 rounded-full bg-border-hover" />
        </div>
        <div
          {...dragHandleProps}
          className={cn(
            'flex items-start justify-between gap-3 shrink-0 px-5 py-3.5 max-sm:pt-6 border-b border-border/40',
            draggable && 'sm:pt-5',
            draggable && (isDragging ? 'sm:cursor-grabbing sm:touch-none' : 'sm:cursor-grab sm:touch-none'),
            headerClassName,
          )}
        >
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div className={cn('shrink-0 flex items-center justify-center size-9 sm:size-10 rounded-xl', ICON_TONE_CLASS[iconTone])}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="line-clamp-2 break-words text-base sm:text-lg font-semibold">{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only" />
              )}
            </div>
          </div>

          {showCloseButton && (
            <DialogClose
              className={cn(
                'shrink-0 flex items-center justify-center size-9 pointer-coarse:size-11 -m-1 rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer active:scale-90',
                closeButtonClassName,
              )}
              aria-label="Close modal"
            >
              <X size={17} />
            </DialogClose>
          )}
        </div>

        <div
          className={cn(
            'flex flex-col gap-5 px-5 py-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 custom-scrollbar',
            !footer && 'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              'shrink-0 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-border/40',
              footerClassName,
            )}
          >
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};