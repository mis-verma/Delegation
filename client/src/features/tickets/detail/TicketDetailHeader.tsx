import { useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import { SheetHeader, SheetDescription } from '@/components/ui/sheet';
import { ticketCode } from '../ticketDisplay';
import type { Ticket } from '../../../api/ticket';

interface TicketDetailHeaderProps {
  ticket: Ticket;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * The sheet's top bar: ticket code (tap to copy) and when it was raised. The title itself lives in
 * the body under its own "Title" label, same layout as the delegation detail sheet. `pr-14` keeps
 * both clear of the sheet's close button, and `py-5` centres the row on it (the button sits at
 * top-4, size-10).
 */
export const TicketDetailHeader = ({ ticket }: TicketDetailHeaderProps) => {
  const [copied, setCopied] = useState(false);
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
    <SheetHeader className="flex-row items-center gap-2.5 flex-wrap px-4 py-5 pr-14 sm:px-8 text-left">
      <button
        type="button"
        onClick={handleCopyId}
        className="group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-primary-500/10 hover:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-mono font-bold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-95 [-webkit-tap-highlight-color:transparent]"
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

      <SheetDescription asChild>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Calendar size={13} className="shrink-0 text-text-light" strokeWidth={2.25} />
          Raised {formatDate(ticket.createdAt)}
        </span>
      </SheetDescription>
    </SheetHeader>
  );
};
