import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Ban, Eye, PencilLine, Timer, Undo2 } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useRevokeChecklistSubmissionMutation } from '../hook';
import { answerText } from './answerText';
import { REVOKE_WINDOW_MS, revokeMsLeft } from './revokeWindow';
import { RunVerificationChip } from './RunVerificationChip';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface SubmissionPreviewDialogProps {
  instance: ChecklistInstance;
  now: number;
  canRevoke: boolean;
  onClose: () => void;
}

const minutesText = (ms: number) => {
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
};

export const SubmissionPreviewDialog = ({ instance, now, canRevoke, onClose }: SubmissionPreviewDialogProps) => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const revoke = useRevokeChecklistSubmissionMutation();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const msLeft = revokeMsLeft(instance.submittedAt, now);
  const open = canRevoke && msLeft > 0;
  const busy = revoke.isPending;

  const run = (itemId?: string) => {
    setPickedId(itemId ?? null);
    revoke.mutate({ id: instance.id, itemId }, {
      onSuccess: () => {
        onClose();
        navigate(`/checklists/${instance.id}`, { viewTransition: true });
      },
    });
  };

  const revokeAll = async () => {
    const ok = await confirm({
      title: 'Take back every answer?',
      description: 'All answers are cleared and the checklist goes back to you. Photos stay. You will need to answer and submit again.',
      confirmLabel: 'Take it back',
      cancelLabel: 'Keep it submitted',
      variant: 'danger',
    });
    if (ok) run();
  };

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title="What you submitted"
      icon={<Eye size={18} aria-hidden="true" />}
      size="lg"
      bodyClassName="flex flex-col gap-4"
      footer={(
        <div className={cn('grid w-full gap-2 sm:flex sm:justify-end', open ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')}>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="h-11 sm:h-9">Close</Button>
          {open && (
            <Button type="button" variant="danger" disabled={busy} isLoading={busy && pickedId === null} onClick={() => void revokeAll()} className="h-11 sm:h-9">
              {!(busy && pickedId === null) && <Undo2 size={15} aria-hidden="true" />}
              Take all back
            </Button>
          )}
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RunVerificationChip instance={instance} />
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 t-meta font-display font-semibold tabular-nums',
            open ? 'bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'bg-surface-hover text-text-muted',
          )}
        >
          <Timer size={12} className="shrink-0" aria-hidden="true" />
          {open ? `${minutesText(msLeft)} left to change it` : canRevoke ? `${REVOKE_WINDOW_MS / 60_000} minute window is over` : 'Waiting for approval'}
        </span>
      </div>
      {open && <p className="t-meta text-text-muted">Tap Correct on a question to reopen just that one. The rest stays as it is.</p>}

      <ul className="flex flex-col gap-2" aria-label="Submitted answers">
        {instance.items.map((item) => {
          const answer = item.isNotApplicable ? 'Not applicable' : answerText(item) ?? (item.isDone ? 'Done' : 'No answer');
          const correcting = busy && pickedId === item.id;
          return (
            <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface p-3 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="t-card font-display font-semibold leading-snug text-text break-words">{item.label}</p>
                <p className="flex flex-wrap items-center gap-1.5 t-meta text-text-secondary break-words">
                  {item.isNotApplicable && <Ban size={12} className="shrink-0" aria-hidden="true" />}
                  {answer}
                </p>
                {item.remarks && <p className="t-meta text-text-muted break-words">"{item.remarks}"</p>}
              </div>
              {open && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  isLoading={correcting}
                  onClick={() => run(item.id)}
                  aria-label={`Correct: ${item.label}`}
                  className="h-11 w-full shrink-0 rounded-full sm:h-9 sm:w-auto"
                >
                  {!correcting && <PencilLine size={13} aria-hidden="true" />}
                  Correct
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {revoke.isError && (
        <p role="alert" className="t-meta font-display font-semibold text-danger">
          {revoke.error instanceof Error ? revoke.error.message : "Couldn't take it back. Try again."}
        </p>
      )}
    </Modal>
  );
};
