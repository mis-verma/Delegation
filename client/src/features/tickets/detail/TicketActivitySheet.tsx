import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { ActivityFeed, FullChangeLog } from '../../../components';
import { ticketCode } from '../ticketDisplay';

interface TicketActivitySheetProps {
  ticketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Activity and the full change log, opened from the ticket sheet's More menu. Kept off the ticket sheet itself so
 * that page stays about the work: details, photos and status history. Mounted only while open, so the feeds load
 * when someone asks for them.
 */
export const TicketActivitySheet = ({ ticketId, open, onOpenChange }: TicketActivitySheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent showCloseButton={false} className="w-full sm:max-w-[560px] p-0 flex flex-col h-full overflow-hidden font-sans shadow-none">
      <SheetHeader className="flex-row items-center gap-2 border-b border-border/60 pl-4 pr-2 py-2.5 sm:pl-6 sm:pr-4 sm:py-3 text-left">
        <div className="flex min-w-0 flex-1 flex-col">
          <SheetTitle className="t-card font-display font-semibold text-text">Activity and change log</SheetTitle>
          <SheetDescription className="t-meta font-mono font-bold text-text-muted">{ticketCode(ticketId)}</SheetDescription>
        </div>
        <SheetClose className="relative flex items-center justify-center size-8 sm:size-9 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-1.5 sm:after:hidden">
          <X size={18} strokeWidth={2.5} />
          <span className="sr-only">Close</span>
        </SheetClose>
      </SheetHeader>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar">
        {open && (
          <div className="flex flex-col gap-5">
            <ActivityFeed entityType="Ticket" entityId={ticketId} />
            <FullChangeLog entityType="Ticket" entityId={ticketId} />
          </div>
        )}
      </div>
    </SheetContent>
  </Sheet>
);
