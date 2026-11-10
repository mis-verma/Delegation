import { useState } from 'react';
import { Ban, Eye, PencilLine, Timer, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
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
  const revoke = useRevokeChecklistSubmissionMutation();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const msLeft = revokeMsLeft(instance.submittedAt, now);
  const open = canRevoke && msLeft > 0;
  const busy = revoke.isPending;

  const run = (itemId?: string) => {
    setPickedId(itemId ?? null);
    revoke.mutate({ id: instance.id, itemId }, { onSuccess: onClose });
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

  const correctOne = async (itemId: string, label: string) => {
    const ok = await confirm({
      title: 'Correct this question?',
      description: `"${label}" reopens so you can change it. The checklist goes back to you and needs to be submitted again.`,
      confirmLabel: 'Reopen it',
      cancelLabel: 'Cancel',
    });
    if (ok) run(itemId);
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye size={16} aria-hidden />
            What you submitted
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 t-meta">
            <Timer size={13} className="shrink-0" aria-hidden />
            {open
              ? `You can take it back or fix a question for ${minutesText(msLeft)} more.`
              : canRevoke
                ? `The ${REVOKE_WINDOW_MS / 60_000} minutes to take this back are over.`
                : 'Waiting for approval.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Submitted answers">
          {instance.items.map((item) => {
            const answer = item.isNotApplicable ? 'Not applicable' : answerText(item) ?? (item.isDone ? 'Done' : 'No answer');
            return (
              <li key={item.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface p-3">
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
                    onClick={() => void correctOne(item.id, item.label)}
                    aria-label={`Correct: ${item.label}`}
                    className="shrink-0 pointer-coarse:h-11"
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
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11">Close</Button>
          </DialogClose>
          {open && (
            <Button type="button" variant="danger" size="sm" disabled={busy} isLoading={busy && pickedId === null} onClick={() => void revokeAll()} className="pointer-coarse:h-11">
              <Undo2 size={14} aria-hidden />
              Revoke all answers
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
