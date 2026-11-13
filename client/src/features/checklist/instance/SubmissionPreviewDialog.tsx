import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Ban, Eye, PencilLine, Timer, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useRevokeChecklistSubmissionMutation } from '../hook';
import { answerText } from './answerText';
import { REVOKE_WINDOW_MS, revokeMsLeft } from './revokeWindow';
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
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye size={16} aria-hidden />
            What you submitted
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 t-meta">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-display font-semibold tabular-nums',
                  open ? 'bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'bg-surface-hover text-text-muted',
                )}
              >
                <Timer size={12} className="shrink-0" aria-hidden />
                {open ? `${minutesText(msLeft)} left to change it` : canRevoke ? `${REVOKE_WINDOW_MS / 60_000} minute window is over` : 'Waiting for approval'}
              </span>
              {open && <span className="text-text-muted">Tap Correct on a question to reopen just that one.</span>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Submitted answers">
          {instance.items.map((item) => {
            const answer = item.isNotApplicable ? 'Not applicable' : answerText(item) ?? (item.isDone ? 'Done' : 'No answer');
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface p-3 transition-colors duration-150 hover:border-border-hover">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="t-card font-display font-semibold leading-snug text-text break-words">{item.label}</p>
                  <p className="flex flex-wrap items-center gap-1.5 t-meta font-display text-text-secondary break-words">
                    {item.isNotApplicable && <Ban size={12} className="shrink-0" aria-hidden />}
                    {answer}
                  </p>
                  {item.remarks && <p className="t-meta text-text-muted break-words">"{item.remarks}"</p>}
                </div>
                {open && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    isLoading={busy && pickedId === item.id}
                    onClick={() => run(item.id)}
                    aria-label={`Correct: ${item.label}`}
                    className="shrink-0 rounded-full pointer-coarse:h-11"
                  >
                    <PencilLine size={13} aria-hidden />
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

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy} className="pointer-coarse:h-11">Close</Button>
          </DialogClose>
          {open && (
            <Button type="button" variant="danger" size="sm" disabled={busy} isLoading={busy && pickedId === null} onClick={() => void revokeAll()} className="pointer-coarse:h-11">
              <Undo2 size={14} aria-hidden />
              Take all back
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
