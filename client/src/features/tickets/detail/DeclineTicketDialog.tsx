import { useState } from 'react';
import { Ban, Building2, CheckCheck, Copy, FileQuestion } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { haptic } from '../../../lib/haptics';

const MIN_REASON = 5;
const QUICK_REASONS = [
  { label: 'Not our department', icon: Building2 },
  { label: 'Already done', icon: CheckCheck },
  { label: 'Not enough detail', icon: FileQuestion },
  { label: 'Duplicate ticket', icon: Copy },
];

interface DeclineTicketDialogProps {
  noun?: string;
  open: boolean;
  ticketTitle: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export const DeclineTicketDialog = ({ noun = 'ticket', open, ticketTitle, isPending, onCancel, onConfirm }: DeclineTicketDialogProps) => {
  const [reason, setReason] = useState('');
  const quickReasons = QUICK_REASONS.map((r) => (r.label === 'Duplicate ticket' ? { ...r, label: `Duplicate ${noun}` } : r));
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
      title={`Decline this ${noun}`}
      description="It closes and goes back to the person who raised it with your reason. It does not count in anyone's score."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={isPending}>Cancel</Button>
          <Button variant="danger" onClick={() => { haptic('warning'); onConfirm(trimmed); }} isLoading={isPending} disabled={trimmed.length < MIN_REASON}>
            {`Decline ${noun}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-3 py-2 t-card font-display font-semibold text-text line-clamp-2 break-words">{ticketTitle}</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick reasons">
          {quickReasons.map(({ label, icon: Icon }) => {
            const active = trimmed === label;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setReason(label)}
                className={`inline-flex h-8 pointer-coarse:h-10 items-center gap-1.5 px-2.5 rounded-lg border t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                  active
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-border/60 bg-surface text-text-secondary hover:border-border-hover'
                }`}
              >
                <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
                {label}
              </button>
            );
          })}
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
