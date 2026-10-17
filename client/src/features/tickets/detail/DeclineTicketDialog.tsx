import { useState } from 'react';
import { Ban } from 'lucide-react';
import { Button, Modal } from '../../../components';

const MIN_REASON = 5;
const QUICK_REASONS = ['Not our department', 'Already done', 'Not enough detail', 'Duplicate ticket'];

interface DeclineTicketDialogProps {
  open: boolean;
  ticketTitle: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export const DeclineTicketDialog = ({ open, ticketTitle, isPending, onCancel, onConfirm }: DeclineTicketDialogProps) => {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const close = () => {
    if (isPending) return;
    setReason('');
    onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      icon={<Ban className="size-5" />}
      title="Decline this ticket"
      description="It closes and goes back to the person who raised it with your reason. It does not count in anyone's score."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={isPending}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(trimmed)} isLoading={isPending} disabled={trimmed.length < MIN_REASON}>
            Decline ticket
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-3 py-2 t-card font-display font-semibold text-text">{ticketTitle}</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setReason(q)}
              className="h-8 pointer-coarse:h-10 px-2.5 rounded-lg border border-border/60 bg-surface t-meta font-display font-semibold text-text-secondary hover:border-border-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              {q}
            </button>
          ))}
        </div>
        <label htmlFor="decline-reason" className="t-meta font-display font-semibold text-text-secondary">Why are you declining it?</label>
        <textarea
          id="decline-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="For example: this is for the IT team, please raise it with them."
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
        />
        <p className="t-meta text-text-muted">{trimmed.length < MIN_REASON ? `At least ${MIN_REASON} characters.` : `${trimmed.length} of 1000`}</p>
      </div>
    </Modal>
  );
};
