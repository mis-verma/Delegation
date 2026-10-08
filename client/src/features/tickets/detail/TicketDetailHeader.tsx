import { useState } from 'react';
import { Calendar, Copy, Check, Trash2, Loader2, X } from 'lucide-react';
import { SheetHeader, SheetDescription, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { StatusChip, type StatusChipStatus } from '../../../components';
import { ticketCode } from '../ticketDisplay';
import type { Ticket } from '../../../api/ticket';

interface TicketDetailHeaderProps {
  ticket: Ticket;
  /** Role-aware status wording, already resolved by the caller. */
  statusLabel: string;
  /** Pass to show the round delete button (admins only). */
  onDelete?: () => void;
  isDeleting?: boolean;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// 36px visible on a phone, 40px from sm; the after: layer pads the tap area out to 44px on a phone.
const ICON_BUTTON =
  'relative flex items-center justify-center size-9 sm:size-10 rounded-full text-text-muted transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 [-webkit-tap-highlight-color:transparent] disabled:opacity-50 disabled:pointer-events-none after:absolute after:-inset-1 sm:after:hidden';

/**
 * The sheet's sticky top bar. Row one: ticket code (tap to copy), the live status chip (so the
 * state is still visible after the body has scrolled), when it was raised (sm and up; lg moves it
 * into the properties rail), then delete and close on the right, both with 44px touch targets.
 * Row two: the title, clamped to two lines on a phone and free to wrap from sm up. The shared
 * sheet's own absolute close button is switched off because it is only 40px and floats over the
 * wrapping chips; this one sits in the row instead.
 */
export const TicketDetailHeader = ({ ticket, statusLabel, onDelete, isDeleting = false }: TicketDetailHeaderProps) => {
  const [copied, setCopied] = useState(false);
  // Tap the title to read all of it; it is clamped to two lines on a phone.
  const [titleOpen, setTitleOpen] = useState(false);
  const code = ticketCode(ticket.id);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the button just won't confirm.
    }
  };

  return (
    <SheetHeader className="gap-1.5 border-b-0 pl-4 pr-2 pt-2 pb-1 sm:pl-6 sm:pr-4 sm:pt-3 sm:pb-4 lg:pl-8 lg:pr-6 text-left">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* after: widens the tap area to 44px high without making the pill itself chunky. */}
          <button
            type="button"
            onClick={handleCopyId}
            className="group relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-primary-500/10 hover:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-mono font-bold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-95 [-webkit-tap-highlight-color:transparent] after:absolute after:-inset-y-2 after:inset-x-0"
            title="Copy ticket code"
            aria-label={`Copy ticket code ${code}`}
          >
            <span>{code}</span>
            {copied ? (
              <Check size={13} className="text-success" strokeWidth={2.5} />
            ) : (
              <Copy size={13} className="opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
            )}
          </button>

          <StatusChip status={ticket.status.toLowerCase() as StatusChipStatus} label={statusLabel} />

          <SheetDescription asChild>
            <span className="hidden sm:inline-flex lg:hidden items-center gap-1.5 text-xs font-medium text-text-muted">
              <Calendar size={13} className="shrink-0 text-text-light" strokeWidth={2.25} />
              Raised {formatDate(ticket.createdAt)}
            </span>
          </SheetDescription>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onDelete && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={onDelete}
              aria-label="Delete ticket"
              title="Delete ticket"
              className={`${ICON_BUTTON} hover:text-danger hover:bg-danger/10 active:bg-danger/10 focus-visible:ring-danger/40`}
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          )}
          <SheetClose className={`${ICON_BUTTON} hover:text-text hover:bg-surface-hover active:scale-90 focus-visible:ring-primary-500/40`}>
            <X size={18} strokeWidth={2.5} />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
      </div>

      <SheetTitle
        onClick={() => setTitleOpen((o) => !o)}
        className={`pr-2 text-lg sm:text-xl lg:text-2xl font-display font-semibold text-text tracking-tight leading-snug break-words select-text ${titleOpen ? '' : 'line-clamp-2 sm:line-clamp-3'}`}
      >
        {ticket.title}
      </SheetTitle>
    </SheetHeader>
  );
};
