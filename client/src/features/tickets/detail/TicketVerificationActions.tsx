import { useState } from 'react';
import { CheckCircle2, ShieldCheck, Undo2 } from 'lucide-react';
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

export const TicketVerificationActions = ({ ticketTitle, isPending, onApprove, onSendBack }: TicketVerificationActionsProps) => {
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2.5 rounded-xl border border-status-verify/25 bg-status-verify/5 p-2.5 sm:p-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-status-verify to-primary-700 text-white" aria-hidden="true">
            <ShieldCheck size={16} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="t-meta font-display font-semibold text-text">Waiting for your approval</p>
            <p className="t-meta text-text-muted">Check the work and photos, then decide.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            className="h-11 sm:h-10 gap-1.5 rounded-lg border-0 bg-linear-to-br from-success to-success-strong text-white t-meta font-display font-semibold hover:opacity-95 focus-visible:ring-success"
            isLoading={isPending && !sendingBack}
            disabled={isPending}
            onClick={onApprove}
          >
            <CheckCircle2 size={16} strokeWidth={2.5} aria-hidden />
            Approve
          </Button>

          <Button
            variant="outline"
            className="h-11 sm:h-10 gap-1.5 rounded-lg border-warning/35 bg-warning/10 text-warning t-meta font-display font-semibold hover:bg-warning/15 hover:text-warning focus-visible:ring-warning"
            disabled={isPending}
            onClick={() => setSendingBack(true)}
          >
            <Undo2 size={16} strokeWidth={2.5} aria-hidden />
            Send back
          </Button>
        </div>
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
