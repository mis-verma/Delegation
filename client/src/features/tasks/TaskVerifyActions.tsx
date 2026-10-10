import { useState } from 'react';
import { ShieldCheck, Undo2, Loader2 } from 'lucide-react';
import { Button } from '../../components';
import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { useVerifyTaskMutation } from './hook';
import { TaskStatusChip } from './TaskStatusChip';
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
  /** True when rendered inside another Modal (the detail sheet), so the send-back sheet opens
   *  nested. See StatusRemarkDialog's `nested`. */
  nested?: boolean;
}

const SEND_BACK_SUGGESTIONS = ['Photos are missing', 'Not finished yet', 'Please redo this part'];

const iconButtonClass = (tone: 'success' | 'danger') =>
  `flex items-center justify-center size-7 pointer-coarse:size-11 rounded-full transition-colors duration-150 ease-out disabled:opacity-50 outline-none focus-visible:ring-2 shrink-0 cursor-pointer ${
    tone === 'success'
      ? 'bg-success/10 text-success hover:bg-success hover:text-white focus-visible:ring-success/40'
      : 'bg-danger/10 text-danger hover:bg-danger hover:text-white focus-visible:ring-danger/40'
  }`;

// Shared by TaskBoard's card footer and TaskDetail's sheet footer: the Approve and Send back
// controls shown once a delegation is waiting for approval. Send back needs a note (the server
// enforces it too), so it opens its own sheet with a required note instead of firing at once.
// The verify endpoint has no undo, so Approve is a plain action with a plain toast.
export const TaskVerifyActions = ({ task, compact = false, onDecided, nested = false }: TaskVerifyActionsProps) => {
  const verifyMut = useVerifyTaskMutation();
  const [sendingBack, setSendingBack] = useState(false);

  const approve = () => verifyMut.mutate({ id: task.id, payload: { action: 'APPROVE' } }, { onSuccess: onDecided });

  const sendBackDialog = sendingBack && (
    <StatusRemarkDialog
      nested={nested}
      title="Send back for changes"
      itemTitle={task.title}
      from={<TaskStatusChip status={task.status} />}
      to={<TaskStatusChip status="in_progress" />}
      confirmLabel="Send back"
      description="Say what needs to change. The people on this delegation see your note."
      placeholder="e.g. The second counter's photos are missing. Please add them and mark it completed again."
      suggestions={SEND_BACK_SUGGESTIONS}
      isSubmitting={verifyMut.isPending}
      onCancel={() => setSendingBack(false)}
      onConfirm={(note) => verifyMut.mutate(
        { id: task.id, payload: { action: 'REJECT', note } },
        { onSuccess: () => { setSendingBack(false); onDecided?.(); } },
      )}
    />
  );

  if (compact) {
    return (
      // The send-back sheet is portalled but still a React child of this div, so its key presses
      // bubble here: stopped, or a space typed in the note would reach the card's Enter/Space handler.
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Approve"
          title="Approve"
          disabled={verifyMut.isPending}
          onClick={approve}
          className={iconButtonClass('success')}
        >
          {verifyMut.isPending && !sendingBack ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} strokeWidth={2.5} />}
        </button>
        <button
          type="button"
          aria-label="Send back"
          title="Send back"
          disabled={verifyMut.isPending}
          onClick={() => setSendingBack(true)}
          className={iconButtonClass('danger')}
        >
          <Undo2 size={13} strokeWidth={2.5} />
        </button>
        {sendBackDialog}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <Button
        className="flex-1 gap-2 h-11 bg-success hover:bg-success/90 text-white font-display font-semibold focus-visible:ring-success"
        disabled={verifyMut.isPending}
        isLoading={verifyMut.isPending && !sendingBack}
        onClick={approve}
      >
        {!(verifyMut.isPending && !sendingBack) && <ShieldCheck size={16} strokeWidth={2.5} />}
        Approve
      </Button>
      <Button
        variant="outline"
        className="flex-1 gap-2 h-11 border-danger/30 text-danger hover:border-danger/50 hover:bg-danger/10 font-display font-semibold focus-visible:ring-danger"
        disabled={verifyMut.isPending}
        onClick={() => setSendingBack(true)}
      >
        <Undo2 size={16} strokeWidth={2.5} />
        Send back
      </Button>
      {sendBackDialog}
    </div>
  );
};
