import { useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Ticket } from '../../../api/ticket';

interface TicketDetailHeaderProps {
  ticket: Ticket;
}

// Robust date formatter to prevent locale inconsistencies or invalid date crashes
const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
};

export const TicketDetailHeader = ({ ticket }: TicketDetailHeaderProps) => {
  const [copied, setCopied] = useState(false);

  // Safely format ticket reference code
  const ticketCode = `TICK-${ticket.id ? ticket.id.slice(0, 6).toUpperCase() : '------'}`;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(ticketCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard permissions are restricted
    }
  };

  return (
    <SheetHeader className="p-6 pb-5 border-b border-border bg-surface/95 backdrop-blur-xl text-left z-20">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {/* Interactive Ticket ID Badge */}
            <button
              type="button"
              onClick={handleCopyId}
              className="group inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary-500/10 hover:bg-primary-500/20 text-primary-700 dark:text-primary-400 text-xs font-mono font-bold border border-primary-500/20 transition-all cursor-pointer shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              title="Click to copy ticket ID"
              aria-label={`Copy ticket code ${ticketCode}`}
            >
              <span>{ticketCode}</span>
              {copied ? (
                <Check size={14} className="text-success" strokeWidth={2.5} />
              ) : (
                <Copy size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
              )}
            </button>

            {/* Created Date */}
            <span className="text-xs text-text-muted flex items-center gap-1.5 font-semibold">
              <Calendar size={14} className="shrink-0 text-text-light" strokeWidth={2.5} />
              <span>Created {formatDate(ticket.createdAt)}</span>
            </span>
          </div>
        </div>

        {/* Title */}
        <SheetTitle className="text-xl font-bold text-text leading-tight break-words select-text mt-1">
          {ticket.title}
        </SheetTitle>
      </div>
    </SheetHeader>
  );
};