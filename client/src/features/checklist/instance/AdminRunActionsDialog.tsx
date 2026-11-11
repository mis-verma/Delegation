import { useId, useState } from 'react';
import { Ban, Eye, PencilLine, Trash2, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { Button, Pill, Textarea } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useDeleteChecklistRunMutation, useRevokeChecklistSubmissionMutation, useSendBackChecklistInstanceMutation } from '../hook';
import { answerText } from './answerText';
import type { ChecklistInstance } from '../../../api/checklistInstances';

interface AdminRunActionsDialogProps {
  instance: ChecklistInstance;
  onClose: () => void;
}

const NOTE_MAX = 1000;

export const AdminRunActionsDialog = ({ instance, onClose }: AdminRunActionsDialogProps) => {
  const confirm = useConfirm();
  const noteId = useId();
  const revoke = useRevokeChecklistSubmissionMutation();
  const sendBack = useSendBackChecklistInstanceMutation();
  const removeRun = useDeleteChecklistRunMutation();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const busy = revoke.isPending || sendBack.isPending || removeRun.isPending;
  const approved = instance.verificationStatus === 'APPROVED';
  const trimmed = note.trim();
  const canRecorrect = trimmed.length > 0 && picked.size > 0 && !busy;
  const canRevoke = trimmed.length > 0 && !busy;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const recorrect = () => {
    if (!canRecorrect) return;
    sendBack.mutate({ id: instance.id, payload: { itemIds: [...picked], note: trimmed } }, { onSuccess: onClose });
  };

  const doRevoke = async () => {
    if (!canRevoke) return;
    const ok = await confirm({
      title: 'Revoke this checklist?',
      description: `Every answer is cleared and the checklist goes back to the team${approved ? ', even though it was approved' : ''}. Your note is saved in the audit log.`,
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) revoke.mutate({ id: instance.id, note: trimmed }, { onSuccess: onClose });
  };

  const doDelete = async () => {
    if (!canRevoke) return;
    const ok = await confirm({
      title: 'Delete this run for good?',
      description: 'The answers, photos and its score are removed for everyone, as if it never ran. Use this for test runs only. It cannot be undone. Your note is kept in the audit log.',
      confirmLabel: 'Delete run',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) removeRun.mutate({ id: instance.id, reason: trimmed }, { onSuccess: onClose });
  };

  const failure = revoke.error ?? sendBack.error ?? removeRun.error;
  const errorText = failure ? (failure instanceof Error ? failure.message : 'Something went wrong. Try again.') : null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye size={16} aria-hidden />
            {instance.title}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 t-meta">
            <Pill tone={approved ? 'success' : 'info'}>{approved ? 'Approved' : 'Pending approval'}</Pill>
            Tick the questions to send back for a correction, or revoke the whole checklist.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" aria-label="Submitted answers">
          {instance.items.map((item) => {
            const on = picked.has(item.id);
            const answer = item.isNotApplicable ? 'Not applicable' : answerText(item) ?? (item.isDone ? 'Done' : 'No answer');
            return (
              <li key={item.id}>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 transition-colors duration-150', on ? 'border-primary-500/60 bg-primary-500/5' : 'border-border/60 hover:border-border-hover')}>
                  <input type="checkbox" checked={on} onChange={() => toggle(item.id)} disabled={busy} className="mt-1 size-4 shrink-0 accent-primary-700 pointer-coarse:size-5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-card font-display font-semibold leading-snug text-text break-words">{item.label}</span>
                    <span className="flex flex-wrap items-center gap-1.5 t-meta font-display text-text-secondary break-words">
                      {item.isNotApplicable && <Ban size={12} className="shrink-0" aria-hidden="true" />}
                      {answer}
                    </span>
                    {item.remarks && <span className="t-meta text-text-muted break-words">"{item.remarks}"</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <Textarea
          id={noteId}
          label="Note for the team"
          labelClassName="font-display font-medium"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder="Say what needs fixing. Needed for every button below."
          className="min-h-0 resize-none rounded-lg px-3 py-2"
        />

        {errorText && (
          <p role="alert" className="t-meta font-display font-semibold text-danger">{errorText}</p>
        )}

        <button
          type="button"
          disabled={!canRevoke}
          onClick={() => void doDelete()}
          className="inline-flex w-fit items-center gap-1.5 min-h-11 sm:min-h-8 rounded-lg px-2 t-meta font-display font-semibold text-danger transition-colors duration-150 hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <Trash2 size={14} aria-hidden />
          {removeRun.isPending ? 'Deleting…' : 'Delete this run for good (test runs)'}
        </button>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11">Close</Button>
          </DialogClose>
          <Button type="button" variant="outline" size="sm" disabled={!canRecorrect} isLoading={sendBack.isPending} onClick={recorrect} className="pointer-coarse:h-11">
            <PencilLine size={14} aria-hidden />
            Recorrection{picked.size > 0 ? ` (${picked.size})` : ''}
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={!canRevoke} isLoading={revoke.isPending} onClick={() => void doRevoke()} className="pointer-coarse:h-11">
            <Undo2 size={14} aria-hidden />
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
