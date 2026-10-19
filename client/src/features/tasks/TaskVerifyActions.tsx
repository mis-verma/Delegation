import { useState } from 'react';
import { ShieldCheck, Undo2, Loader2 } from 'lucide-react';
import { Button } from '../../components';
import { StatusRemarkDialog } from '../../components/statusRemarkDialog';
import { useVerifyTaskMutation } from './hook';
import { TaskStatusChip } from './TaskStatusChip';
import type { Task } from '../../api/task';

interface TaskVerifyActionsProps {
  task: Task;
  compact?: boolean;
  onDecided?: () => void;
  nested?: boolean;
}

const SEND_BACK_SUGGESTIONS = ['Photos are missing', 'Not finished yet', 'Please redo this part'];

const iconButtonClass = (tone: 'success' | 'danger') =>
  `flex items-center justify-center size-7 pointer-coarse:size-11 rounded-full transition-colors duration-150 ease-out disabled:opacity-50 outline-none focus-visible:ring-2 shrink-0 cursor-pointer ${
    tone === 'success'
      ? 'bg-success/10 text-success hover:bg-success hover:text-white focus-visible:ring-success/40'
      : 'bg-danger/10 text-danger hover:bg-danger hover:text-white focus-visible:ring-danger/40'
  }`;

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
