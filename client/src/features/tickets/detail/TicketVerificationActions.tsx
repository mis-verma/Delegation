import { useState } from 'react';
import { ShieldCheck, Undo2 } from 'lucide-react';
import { Button, StatusChip } from '../../../components';
import { StatusRemarkDialog } from '../../../components/statusRemarkDialog';
import { TICKET_STATUS_LABEL } from '../../../lib/ticketStatusLabel';

interface TicketVerificationActionsProps {
  ticketTitle: string;
  isPending: boolean;
  onApprove: () => void;
  onSendBack: (note: string) => void;
}

const SEND_BACK_SUGGESTIONS = ['Photo missing', 'Not fixed yet', 'Wrong item'];

/**
 * The reviewer's two buttons. Approve is one tap. Send back opens its own sheet with a required
 * note (what needs fixing), instead of a text box squeezed into the sticky footer.
 */
export const TicketVerificationActions = ({ ticketTitle, isPending, onApprove, onSendBack }: TicketVerificationActionsProps) => {
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <>
      {/* 44px buttons on a phone, 40px from sm. Approve first. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Button
          variant="primary"
          className="h-11 sm:h-10 gap-2 bg-success hover:bg-success/90 text-white font-semibold rounded-lg focus-visible:ring-success"
          isLoading={isPending && !sendingBack}
          disabled={isPending}
          onClick={onApprove}
        >
          <ShieldCheck size={16} strokeWidth={2.5} aria-hidden />
          Approve
        </Button>

        <Button
          variant="outline"
          className="h-11 sm:h-10 gap-2 border-danger/30 text-danger bg-surface hover:bg-danger/10 hover:text-danger font-semibold rounded-lg focus-visible:ring-danger"
          disabled={isPending}
          onClick={() => setSendingBack(true)}
        >
          <Undo2 size={16} strokeWidth={2.5} aria-hidden />
          Send back
        </Button>
      </div>

      {sendingBack && (
        <StatusRemarkDialog
          title="Send back for changes"
          itemTitle={ticketTitle}
          from={<StatusChip status="pending_approval" label={TICKET_STATUS_LABEL.PENDING_APPROVAL} />}
          to={<StatusChip status="in_progress" label={TICKET_STATUS_LABEL.IN_PROGRESS} />}
          confirmLabel="Send back"
          description="Say what needs fixing. The person working on it sees this note."
          phoneNote="The person working on it sees this note."
          placeholder="e.g. The photo of the fixed counter is missing."
          suggestions={SEND_BACK_SUGGESTIONS}
          isSubmitting={isPending}
          onCancel={() => setSendingBack(false)}
          onConfirm={(note) => onSendBack(note.trim())}
        />
      )}
    </>
  );
};
