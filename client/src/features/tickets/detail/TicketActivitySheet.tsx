import { ActivitySheet } from '../../../components/activitySheet';
import { ticketCode } from '../ticketDisplay';

interface TicketActivitySheetProps {
  ticketId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TicketActivitySheet = ({ ticketId, open, onOpenChange }: TicketActivitySheetProps) => (
  <ActivitySheet entityType="Ticket" entityId={ticketId} code={ticketCode(ticketId)} open={open} onOpenChange={onOpenChange} />
);
