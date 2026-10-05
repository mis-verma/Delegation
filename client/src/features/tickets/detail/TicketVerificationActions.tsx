import { useId, useState } from 'react';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { Button } from '../../../components';
import { useVerifyDecision } from '../../../lib/useVerifyDecision';

interface TicketVerificationActionsProps {
  isPending: boolean;
  onApprove: () => void;
  onReject: (note: string) => void;
}

export const TicketVerificationActions = ({ isPending, onApprove, onReject }: TicketVerificationActionsProps) => {
  // Shared with TaskVerifyActions — same two-phase flow and same "a reason is required" rule.
  // This component's markup and props are unchanged; only the state lives elsewhere now.
  const { isRejecting, note, setNote, startReject, cancelReject, trimmedNote, canSubmitReject } = useVerifyDecision();
  const [touched, setTouched] = useState(false);
  const noteId = useId();
  const errorId = `${noteId}-error`;
  const showError = touched && !canSubmitReject;

  const handleCancel = () => {
    setTouched(false);
    cancelReject();
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {!isRejecting ? (
        // 48px buttons on a phone, 40px from sm. Approve is the primary (solid green, first).
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Button
            variant="primary"
            className="h-12 sm:h-10 gap-2 bg-success hover:bg-success/90 text-white font-bold rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
            isLoading={isPending}
            onClick={onApprove}
          >
            <ShieldCheck size={18} strokeWidth={2.5} />
            Approve
          </Button>

          <Button
            variant="outline"
            className="h-12 sm:h-10 gap-2 border-danger/30 text-danger bg-surface hover:bg-danger/10 font-bold rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
            disabled={isPending}
            onClick={startReject}
          >
            <ShieldX size={18} strokeWidth={2.5} />
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <label htmlFor={noteId} className="text-xs font-semibold text-text-secondary">
            Why is it being sent back?
          </label>
          {/* text-base on a phone: anything under 16px makes iOS zoom the page on focus. */}
          <textarea
            id={noteId}
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showError}
            aria-describedby={showError ? errorId : undefined}
            placeholder="What needs to be fixed before this can be approved?"
            rows={3}
            className={`w-full px-4 py-3 text-base sm:text-sm font-medium text-text bg-surface border rounded-xl focus:outline-none focus:ring-2 focus:ring-danger/40 focus:border-danger placeholder:text-text-light transition-all resize-none ${
              showError ? 'border-danger' : 'border-border'
            }`}
          />
          {showError && (
            <p id={errorId} className="text-xs font-semibold text-danger">
              Add a reason so the assignee knows what to fix.
            </p>
          )}
          {/* Phone: Send back on top, Cancel under it, both full width. From sm: right-aligned,
              Cancel then Send back. */}
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
            <Button
              variant="primary"
              className="h-12 sm:h-10 sm:min-w-32 bg-danger hover:bg-danger/90 text-white font-bold rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isPending || !canSubmitReject}
              onClick={() => onReject(trimmedNote)}
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : 'Send back'}
            </Button>

            <Button
              variant="outline"
              className="h-12 sm:h-10 sm:min-w-24 rounded-xl font-bold border-border text-text-secondary bg-surface hover:bg-surface-hover transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
