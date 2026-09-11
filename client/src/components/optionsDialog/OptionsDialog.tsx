import type { ReactNode } from 'react';
import { FileDown, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '../button';

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
}: OptionsDialogProps) => (
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogTrigger asChild>
      {/* Sits directly beside the page's primary create button, so it matches its pill shape and
          height instead of being a squared-off `rounded` box next to a `rounded-full` one. The
          slider glyph says what the button does before you read the word. */}
      <Button
        variant="secondary"
        size="sm"
        className="group gap-2 font-semibold tracking-tight rounded-full text-xs sm:text-sm px-4 py-2 border border-border hover:border-primary-400 transition-all duration-200 ease-in-out"
      >
        <SlidersHorizontal
          size={15}
          strokeWidth={2.5}
          className="text-text-muted group-hover:text-primary-600 transition-colors duration-200"
        />
        <span>Options</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-bold rounded-full bg-primary-600 text-white tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>
    </DialogTrigger>

    <DialogContent
      // Half the default dimming (bg-black/40 -> /20) — this dialog is a filter panel you flip
      // open and shut constantly, not a document you read, so the rest of the page going dark
      // every time reads as heavier than the moment warrants. Blur stays as-is; brightness is an
      // opacity thing, not a blur one.
      overlayClassName="bg-black/20 backdrop-blur-sm"
      className={
        'bg-surface sm:max-w-2xl ' +
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
        'data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.7,0,0.84,0)]'
      }
    >
      <DialogHeader>
        <DialogTitle className="text-base">{title}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-5">{children}</div>

      <DialogFooter className="sm:justify-between">
        {activeCount > 0 ? (
          <button onClick={onClearAll} className="text-xs font-bold text-text-muted hover:text-danger px-2 py-2 rounded-lg">
            Clear filters
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
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
