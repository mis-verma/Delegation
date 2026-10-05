import { ShieldCheck, ShieldX, Loader2, X, Send } from 'lucide-react';
import { Button } from '../../components';
import { useVerifyDecision } from '../../lib/useVerifyDecision';
import { useVerifyTaskMutation } from './hook';
import type { Task } from '../../api/task';

interface TaskVerifyActionsProps {
  task: Task;
  /** Icon-only, no labels — for tight spots like TaskCard's board footer, where full-text
   *  buttons crowd out the assignee info next to them. TaskDetail's sheet footer has plenty
   *  of room, so it keeps the labeled default. */
  compact?: boolean;
  /** Runs after an approve or send-back went through, so a detail sheet can close and drop the
   *  reviewer back on the list they came from. */
  onDecided?: () => void;
}

const iconButtonClass = (tone: 'success' | 'danger') =>
  `flex items-center justify-center size-7 rounded-full transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 shrink-0 ${
    tone === 'success'
      ? 'bg-success/10 text-success hover:bg-success hover:text-white focus-visible:ring-success/40'
      : 'bg-danger/10 text-danger hover:bg-danger hover:text-white focus-visible:ring-danger/40'
  }`;

// Shared by TaskBoard's card footer and TaskDetail's sheet footer — PC/Admin/manager/reviewer
// approve/reject controls shown once a task is pending_approval. Reject requires a short note
// (enforced server-side), so it expands into a small textarea instead of firing immediately.
export const TaskVerifyActions = ({ task, compact = false, onDecided }: TaskVerifyActionsProps) => {
  const verifyMut = useVerifyTaskMutation();
  // Shared with TicketVerificationActions — same two-phase flow and same "a reason is required"
  // rule, which the server enforces too. Rendering below is unchanged.
  const { isRejecting, note, setNote, startReject, cancelReject, trimmedNote, canSubmitReject } = useVerifyDecision();

  if (isRejecting) {
    return (
      <div
        className={compact
          ? 'flex flex-col gap-2.5 p-3 bg-danger/10 border border-danger/20 rounded-lg animate-in fade-in zoom-in-95 duration-200'
          : 'flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200'}
        onClick={e => e.stopPropagation()}
      >
        <textarea
          autoFocus
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={compact ? 'Reason for rejection...' : 'What needs to be fixed before this can be approved?'}
          rows={compact ? 2 : 3}
          className={compact
            ? 'w-full px-3 py-2 text-sm text-text bg-surface border border-danger/30 rounded-md placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger transition-all resize-none shadow-sm'
            : 'w-full px-4 py-3 text-sm font-medium text-text bg-surface border border-border rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-danger/40 focus:border-danger placeholder:text-text-light transition-all resize-none'}
        />
        <div className="flex items-center gap-2 justify-end">
          {compact ? (
            <>
              <button
                type="button"
                aria-label="Cancel"
                title="Cancel"
                disabled={verifyMut.isPending}
                onClick={cancelReject}
                className="flex items-center justify-center size-7 rounded-full text-text-muted hover:bg-surface-hover transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-border-hover shrink-0"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                aria-label="Send back"
                title="Send back"
                disabled={verifyMut.isPending || !canSubmitReject}
                onClick={() => verifyMut.mutate({ id: task.id, payload: { action: 'REJECT', note: trimmedNote } }, { onSuccess: onDecided })}
                className={iconButtonClass('danger')}
              >
                {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} strokeWidth={2.5} />}
              </button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                className="flex-1 bg-danger hover:bg-danger/90 text-white font-bold shadow-md shadow-danger/20 py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={verifyMut.isPending || !canSubmitReject}
                onClick={() => verifyMut.mutate({ id: task.id, payload: { action: 'REJECT', note: trimmedNote } }, { onSuccess: onDecided })}
              >
                {verifyMut.isPending ? <Loader2 size={18} className="animate-spin" /> : 'Send back'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 py-2.5 rounded-xl font-bold border-border text-text-secondary bg-surface hover:bg-surface-hover shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
                disabled={verifyMut.isPending}
                onClick={cancelReject}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Approve"
          title="Approve"
          disabled={verifyMut.isPending}
          onClick={() => verifyMut.mutate({ id: task.id, payload: { action: 'APPROVE' } }, { onSuccess: onDecided })}
          className={iconButtonClass('success')}
        >
          {verifyMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          aria-label="Reject"
          title="Reject"
          disabled={verifyMut.isPending}
          onClick={startReject}
          className={iconButtonClass('danger')}
        >
          <ShieldX size={13} strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
      <Button
        variant="primary"
        className="flex-1 gap-2 bg-success hover:bg-success/90 text-white font-bold shadow-md shadow-success/20 py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
        disabled={verifyMut.isPending}
        onClick={() => verifyMut.mutate({ id: task.id, payload: { action: 'APPROVE' } }, { onSuccess: onDecided })}
      >
        {verifyMut.isPending ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <ShieldCheck size={18} strokeWidth={2.5} />
        )}
        Approve
      </Button>
      <Button
        variant="outline"
        className="flex-1 gap-2 border-danger/30 text-danger bg-surface hover:bg-danger/10 font-bold shadow-sm py-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
        disabled={verifyMut.isPending}
        onClick={startReject}
      >
        <ShieldX size={18} strokeWidth={2.5} />
        Reject
      </Button>
    </div>
  );
};