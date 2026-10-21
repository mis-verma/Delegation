import { useState } from 'react';
import { Copy, Check, Trash2, Loader2, X, MoreHorizontal, Pencil, History } from 'lucide-react';
import { SheetHeader, SheetDescription, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { StatusChip, type StatusChipStatus } from '../../../components';
import { ticketCode } from '../ticketDisplay';
import type { Ticket } from '../../../api/ticket';

interface TicketDetailHeaderProps {
  ticket: Ticket;
  statusLabel: string;
  raisedByName?: string | null;
  onEdit?: () => void;
  onShowActivity: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

const ICON_BUTTON =
  'relative flex items-center justify-center size-8 sm:size-9 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] disabled:opacity-50 disabled:pointer-events-none after:absolute after:-inset-1.5 sm:after:hidden';

const MENU_ITEM = 'gap-2.5 min-h-11 sm:min-h-9 t-meta font-display font-semibold cursor-pointer';

export const TicketDetailHeader = ({ ticket, statusLabel, raisedByName, onEdit, onShowActivity, onDelete, isDeleting = false }: TicketDetailHeaderProps) => {
  const [copied, setCopied] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const code = ticketCode(ticket.id);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  return (
    <SheetHeader className="gap-1.5 border-b-0 pl-4 pr-2 pt-2.5 pb-1 sm:pl-6 sm:pr-4 sm:pt-3 sm:pb-1.5 lg:pl-8 lg:pr-6 text-left">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <button
            type="button"
            onClick={handleCopyId}
            className="group relative inline-flex items-center gap-1.5 h-6 sm:h-7 px-2 rounded-md border border-border/60 bg-surface-hover/60 hover:bg-surface-active text-text-secondary t-meta font-mono font-bold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent] after:absolute after:-inset-y-2.5 after:inset-x-0"
            title="Copy ticket code"
            aria-label={`Copy ticket code ${code}`}
          >
            <span>{code}</span>
            {copied ? (
              <Check size={12} className="text-success" strokeWidth={2.75} />
            ) : (
              <Copy size={12} className="opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={2.5} />
            )}
          </button>

          <StatusChip status={(ticket.declinedAt ? 'declined' : ticket.status.toLowerCase()) as StatusChipStatus} label={statusLabel} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label="Edit title and details" title="Edit title and details" className={ICON_BUTTON}>
              <Pencil size={16} strokeWidth={2.25} />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={isDeleting} aria-label="More actions" title="More actions" className={ICON_BUTTON}>
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={18} strokeWidth={2.5} />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1.5 rounded-xl">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit} className={MENU_ITEM}>
                  <Pencil size={15} className="text-text-muted" />
                  Edit title and details
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onShowActivity} className={MENU_ITEM}>
                <History size={15} className="text-text-muted" />
                Activity and change log
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className={`${MENU_ITEM} text-danger focus:text-danger`}>
                    <Trash2 size={15} className="text-danger" />
                    Delete ticket
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <SheetClose className={ICON_BUTTON}>
            <X size={18} strokeWidth={2.5} />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
      </div>

      <SheetTitle className="text-lg sm:text-xl font-display font-bold text-text">
        <button
          type="button"
          onClick={() => setTitleOpen((o) => !o)}
          aria-expanded={titleOpen}
          className="w-full pr-2 text-left leading-snug break-words cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className={titleOpen ? '' : 'line-clamp-2'}>{ticket.title}</span>
        </button>
      </SheetTitle>

      <SheetDescription className="sr-only">
        {raisedByName ? `Raised by ${raisedByName}, ${formatDate(ticket.createdAt)}` : `Raised ${formatDate(ticket.createdAt)}`}
      </SheetDescription>
    </SheetHeader>
  );
};
