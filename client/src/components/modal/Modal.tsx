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

/** Drag the phone handle down this far (px), or flick it, to close the sheet. */
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

// Same soft-tinted, ringed icon-tile convention every page header already uses (DirectoryPage,
// TeamOverviewPage, etc.) — the modal's `icon` used to render as a bare glyph floating next to the
// title with no tile at all, the one spot in the app that hadn't gotten it, which is exactly why it
// read as flat/generic next to everything else. `currentColor` here is a default only: an icon that
// sets its own text-* class (e.g. FormLoadError's text-danger) still wins over it.
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
  /** Tints the icon tile background/ring — leave as 'primary' unless the icon itself signals
   *  something like an error (see FormLoadError). */
  iconTone?: keyof typeof ICON_TONE_CLASS;
  size?: keyof typeof SIZE_CLASS;
  footer?: ReactNode;
  showCloseButton?: boolean;
  /** Extra classes on the header X, e.g. `sm:hidden` to show it on phones only. */
  closeButtonClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  /** Set false for a modal that's expected to open on top of another Modal (e.g. a date picker
   *  inside a form modal). Radix's default modal behavior (focus trap + body scroll-lock) isn't
   *  aware of a second Dialog also managing that same lock, and closing the inner one first can
   *  leave the outer one's body lock in a broken, unclickable state — non-modal sidesteps that
   *  since only one Dialog in the stack is then managing the lock. */
  modal?: boolean;
  /** Lets the dialog be repositioned by dragging its header — desktop only (see
   *  useDraggableDialog), off by default. Opt-in per caller rather than global: most dialogs here
   *  are short single-purpose forms with nothing behind them worth uncovering, so this is for the
   *  ones a user plausibly wants to drag aside and keep open while working with what's behind it. */
  draggable?: boolean;
  /**
   * The form inside has unsaved input. Closing by X, Escape or the phone back gesture first asks
   * "Discard changes?" (the app's confirm dialog), and taps on the overlay/outside are ignored.
   * Ignored when `confirmClose` is passed.
   */
  dirty?: boolean;
  /**
   * Custom close guard, run before every user close (X, Escape, back, swipe-down). Return true
   * (or resolve true) to let it close. Like `dirty`, it also blocks overlay/outside taps.
   */
  confirmClose?: () => boolean | Promise<boolean>;
  /** Set false to ignore overlay/outside taps even without a guard. Default true. */
  dismissOnOutsideClick?: boolean;
  /** Phone back gesture closes this sheet (the top-most one only). Default true. */
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

  /** Every user-initiated close goes through here. Returns false or a promise while the guard is
   *  deciding, so useCloseOnBack knows to restore its history entry. */
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

  // Phone swipe-down on the grab handle. Moves the sheet with the finger by writing the transform
  // straight onto the node (no re-render per move); a far enough or fast enough pull closes it.
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
      // Leave the transform in place: the exit animation then slides on down from where the finger let go.
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
        // With unsaved input an overlay tap is far more often a slip than a decision, so it does nothing.
        onInteractOutside={blockOutside ? (e) => e.preventDefault() : undefined}
        // max-h in dvh: on mobile, `vh` is measured against the viewport with browser chrome
        // retracted, so a 90vh dialog could stand taller than the screen actually shows and hide
        // its own footer. dvh tracks the visible viewport.
        className={cn('w-full sm:w-[95vw]', SIZE_CLASS[size], 'p-0 flex flex-col overflow-hidden rounded-t-2xl rounded-b-none sm:rounded max-h-[90dvh]', isDragging && 'select-none', contentClassName)}
      >
        {/* Grip bar — the same "this sheet moves" cue as a native bottom sheet or a macOS panel,
            sitting above the header rather than replacing its hit area: the whole header below
            stays the drag handle (a 34px bar is too easy to miss on a fast grab), this is purely
            the visual tell that it's there. Desktop-only, matching drag itself. */}
        {draggable && (
          <span aria-hidden="true" className="hidden sm:block absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-border-hover" />
        )}
        {/* Phone: every Modal is a bottom sheet, so it gets the native 32x4 grab handle, and pulling
            the handle down closes it. The hit strip is wider and taller than the bar, but stops
            short of the header's X on the right. */}
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
                // Satisfies Radix accessibility requirement when description is undefined
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
              // No footer tint (was bg-surface-hover/40) — that band read as an off-color smudge
              // breaking the modal's otherwise flat surface instead of a deliberate section. The
              // border-t alone still separates the footer from the scrollable body above it.
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