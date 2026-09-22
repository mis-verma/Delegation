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

  return (
    <div className="px-6 py-5 border-t border-border bg-surface-hover/80 backdrop-blur-md flex flex-col gap-3 font-sans">
      {!isRejecting ? (
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            className="flex-1 gap-2 bg-success hover:bg-success/90 text-white font-bold shadow-md shadow-success/20 py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
            isLoading={isPending}
            onClick={onApprove}
          >
            <ShieldCheck size={18} strokeWidth={2.5} />
            Approve
          </Button>
          
          <Button
            variant="outline"
            className="flex-1 gap-2 border-danger/30 text-danger bg-surface hover:bg-danger/10 font-bold shadow-sm py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
            disabled={isPending}
            onClick={startReject}
          >
            <ShieldX size={18} strokeWidth={2.5} />
            Reject
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <textarea
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What needs to be fixed before this can be approved?"
            rows={3}
            className="w-full px-4 py-3 text-sm font-medium text-text bg-surface border border-border rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-danger/40 focus:border-danger placeholder:text-text-light transition-all resize-none"
          />
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              className="flex-1 bg-danger hover:bg-danger/90 text-white font-bold shadow-md shadow-danger/20 py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isPending || !canSubmitReject}
              onClick={() => onReject(trimmedNote)}
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : 'Send back'}
            </Button>
            
            <Button 
              variant="outline" 
              className="flex-1 py-2.5 rounded-xl font-bold border-border text-text-secondary bg-surface hover:bg-surface-hover shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
              disabled={isPending} 
              onClick={cancelReject}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};