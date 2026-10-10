import { useState } from 'react';
import { Calendar, Copy, Check, Trash2, Loader2, X, MoreHorizontal } from 'lucide-react';
import { SheetHeader, SheetDescription, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { StatusChip, type StatusChipStatus } from '../../../components';
import { ticketCode } from '../ticketDisplay';
import type { Ticket } from '../../../api/ticket';

interface TicketDetailHeaderProps {
  ticket: Ticket;
  /** Status wording, already resolved by the caller. */
  statusLabel: string;
  /** Who raised it ("You", "Ravi"), for the phone's line under the title. Null when unknown. */
  raisedByName?: string | null;
  /** Pass to offer "Delete ticket" in the header's More menu (admins only). */
  onDelete?: () => void;
  isDeleting?: boolean;
}

const formatDate = (dateString: string, withYear = true) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
};

// 36px visible on a phone, 40px from sm; the after: layer pads the tap area out to 44px on a phone.
const ICON_BUTTON =
  'relative flex items-center justify-center size-9 sm:size-10 rounded-full text-text-muted transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 [-webkit-tap-highlight-color:transparent] disabled:opacity-50 disabled:pointer-events-none after:absolute after:-inset-1 sm:after:hidden';

/**
 * The sheet's sticky top bar. Row one: ticket code (tap to copy), the live status chip (so the
 * state is still visible after the body has scrolled), when it was raised (sm to lg; lg moves it
 * into the properties rail), then a More menu (Delete, admins only) and close on the right, 8px
 * apart so a thumb can't hit the wrong one. Row two: the title, clamped to two lines on a phone
 * (tap it to read all of it). A phone gets "Raised by Ravi, 10 Oct" under it.
 */
export const TicketDetailHeader = ({ ticket, statusLabel, raisedByName, onDelete, isDeleting = false }: TicketDetailHeaderProps) => {
  const [copied, setCopied] = useState(false);
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

  const raisedLine = raisedByName
    ? `Raised by ${raisedByName}, ${formatDate(ticket.createdAt, false)}`
    : `Raised ${formatDate(ticket.createdAt, false)}`;

  return (
    <SheetHeader className="gap-1.5 border-b-0 pl-4 pr-2 pt-2 pb-1 sm:pl-6 sm:pr-4 sm:pt-3 sm:pb-4 lg:pl-8 lg:pr-6 text-left">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {/* after: widens the tap area to 44px high without making the pill itself chunky. */}
          <button
            type="button"
            onClick={handleCopyId}
            className="group relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-surface-hover hover:bg-surface-active text-text-secondary t-meta font-mono font-bold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] after:absolute after:-inset-y-2 after:inset-x-0"
            title="Copy ticket code"
            aria-label={`Copy ticket code ${code}`}
          >
            <span>{code}</span>
            {copied ? (
              <Check size={14} className="text-success" strokeWidth={2.5} />
            ) : (
              <Copy size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
            )}
          </button>

          <StatusChip status={ticket.status.toLowerCase() as StatusChipStatus} label={statusLabel} />

          <SheetDescription asChild>
            <span className="hidden sm:inline-flex lg:hidden items-center gap-1.5 t-meta font-medium text-text-muted">
              <Calendar size={14} className="shrink-0 text-text-light" strokeWidth={2.25} />
              Raised {formatDate(ticket.createdAt)}
            </span>
          </SheetDescription>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isDeleting}
                  aria-label="More actions"
                  title="More actions"
                  className={`${ICON_BUTTON} hover:text-text hover:bg-surface-hover focus-visible:ring-primary-500/40`}
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} strokeWidth={2.5} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 p-1.5 rounded-xl">
                <DropdownMenuItem
                  onClick={onDelete}
                  className="gap-2.5 min-h-11 sm:min-h-9 text-sm font-medium text-danger focus:text-danger cursor-pointer"
                >
                  <Trash2 size={16} className="text-danger" />
                  Delete ticket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <SheetClose className={`${ICON_BUTTON} hover:text-text hover:bg-surface-hover focus-visible:ring-primary-500/40`}>
            <X size={18} strokeWidth={2.5} />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
      </div>

      <SheetTitle className="t-title font-display font-semibold text-text tracking-tight">
        {/* A real button so the tap-to-read-all works from a keyboard and says what it does. */}
        <button
          type="button"
          onClick={() => setTitleOpen((o) => !o)}
          aria-expanded={titleOpen}
          className="w-full pr-2 text-left leading-snug break-words cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className={titleOpen ? '' : 'line-clamp-2 sm:line-clamp-3'}>{ticket.title}</span>
        </button>
      </SheetTitle>

      <p className="sm:hidden t-meta font-medium text-text-muted">{raisedLine}</p>
    </SheetHeader>
  );
};
