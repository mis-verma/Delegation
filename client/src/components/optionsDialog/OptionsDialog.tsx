import type { ReactNode } from 'react';
import { FileDown, SlidersHorizontal, X } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '../button';
import { useDraggableDialog } from '../modal/useDraggableDialog';

/**
 * The "one Options button" dialog shell used by the Delegation and Tickets list pages.
 *
 * Both had their own copy: the same trigger button with the same active-filter count badge, the
 * same `sm:max-w-2xl` content with a `gap-5` column, and the same footer — "Clear filters" on the
 * left when any are active, Export and Done on the right, with Export closing the dialog first.
 * All of that was byte-identical; only the rows in between differ, so those stay with the module
 * and arrive as `children`.
 */
interface OptionsDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  /** e.g. "Delegation options" — names what's being configured. */
  title: string;
  /** Number of active filters; drives the trigger badge and whether "Clear filters" shows. */
  activeCount: number;
  onClearAll: () => void;
  canExport: boolean;
  onExport: () => void;
  children: ReactNode;
}

export const OptionsDialog = ({
  isOpen,
  setIsOpen,
  title,
  activeCount,
  onClearAll,
  canExport,
  onExport,
  children,
}: OptionsDialogProps) => {
  // Draggable by its header, same as Modal.tsx's own `draggable` opt-in — this panel gets flipped
  // open constantly while working the list behind it, so being able to drag it aside instead of it
  // permanently covering the middle of the page is worth more here than on a one-shot form dialog.
  const { contentRef, isDragging, style: dragStyle, handleProps: dragHandleProps } = useDraggableDialog(isOpen, true);

  return (
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogTrigger asChild>
      {/* Sits directly beside the page's primary create button, so it matches its pill shape and
          height instead of being a squared-off `rounded` box next to a `rounded-full` one. The
          slider glyph says what the button does before you read the word. */}
      <Button
        variant="secondary"
        size="sm"
        className="group gap-2 font-display font-semibold tracking-tight rounded-full text-xs sm:text-sm px-4 py-2 border border-border hover:border-primary-400 transition-all duration-200 ease-in-out"
      >
        <SlidersHorizontal
          size={15}
          strokeWidth={2.5}
          className="text-text-muted group-hover:text-primary-600 transition-colors duration-200"
        />
        <span>Options</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[0.625rem] font-bold rounded-full bg-primary-600 text-white tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>
    </DialogTrigger>

    <DialogContent
      ref={contentRef}
      style={dragStyle}
      // No separate top-right X — the footer's "Done" button is already a dedicated close action
      // (DialogClose below), so a second close control was pure redundancy, not a second affordance.
      showCloseButton={false}
      // Half the default dimming (bg-black/40 -> /20) — this dialog is a filter panel you flip
      // open and shut constantly, not a document you read, so the rest of the page going dark
      // every time reads as heavier than the moment warrants. Blur stays as-is; brightness is an
      // opacity thing, not a blur one.
      overlayClassName="bg-black/30"
      className={
        'bg-surface sm:max-w-2xl ' +
        // Phones: header / scrolling body / footer as three flex rows, with only the body scrolling.
        // The whole sheet used to be the scroller with a sticky footer — content kept scrolling in
        // the sheet's bottom padding, so option rows (e.g. the Assignee avatars) showed up again
        // *below* the Done bar.
        'max-sm:flex max-sm:flex-col max-sm:gap-0 max-sm:p-0 max-sm:overflow-hidden ' +
        // The shared Dialog only tunes the *open* direction (200ms, a settle-in bezier) and
        // leaves close on the browser's default ease — fine for a dialog you read, wrong for one
        // you open and close constantly to toggle a filter. will-change promotes this to its own
        // compositor layer before the very first frame, so the animation doesn't pay a layer-
        // promotion cost mid-transition. Faster on both ends (open 150ms, close 100ms — closing
        // stays the shorter of the two, matching the enter/exit-speed convention used elsewhere in
        // this app), and closing now gets a real accelerate curve mirroring the open curve's
        // decelerate, instead of reading like a different, mushier animation.
        'will-change-transform ' +
        'data-[state=open]:duration-150 data-[state=closed]:duration-100 ' +
        'data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.7,0,0.84,0)]' +
        (isDragging ? ' select-none' : '')
      }
    >
      {/* Grip bar — same "this panel moves" cue Modal.tsx uses, sitting above the title rather
          than replacing its hit area. Desktop-only, matching drag itself. */}
      <span aria-hidden="true" className="hidden sm:block absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-border-hover" />
      <DialogHeader
        {...dragHandleProps}
        className={`shrink-0 flex-row items-center justify-between sm:block max-sm:px-5 max-sm:pt-5 max-sm:pb-3 max-sm:border-b max-sm:border-border/60 ${isDragging ? 'sm:cursor-grabbing sm:touch-none' : 'sm:cursor-grab sm:touch-none'}`}
      >
        <DialogTitle className="text-base text-left">{title}</DialogTitle>
        {/* Phones get a top-right close: the sheet scrolls, and Done is at its bottom. */}
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Close"
            className="sm:hidden flex items-center justify-center size-9 -mr-2 rounded-full text-text-muted active:bg-surface-hover cursor-pointer [-webkit-tap-highlight-color:transparent]"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </DialogClose>
      </DialogHeader>

      <div className="flex flex-col gap-5 sm:gap-4 max-sm:flex-1 max-sm:min-h-0 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:px-5 max-sm:py-4">
        {children}
      </div>

      {/* Phones: its own row under the scrolling body, so Clear/Export/Done are always in reach
          without anything scrolling beneath them. */}
      <DialogFooter className="shrink-0 flex-row items-center justify-between max-sm:mt-0 max-sm:px-5 max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:border-t max-sm:border-border/60">
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-display font-bold text-text-muted hover:text-danger transition-colors cursor-pointer px-2 py-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
          >
            Clear filters
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-row gap-2 sm:gap-3">
          {canExport && (
            // Closes the dialog before opening the export modal — two stacked overlays would
            // otherwise fight for focus.
            <Button variant="secondary" size="sm" onClick={() => { setIsOpen(false); onExport(); }}>
              <FileDown size={14} /> Export
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="primary" size="sm">Done</Button>
          </DialogClose>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
};
