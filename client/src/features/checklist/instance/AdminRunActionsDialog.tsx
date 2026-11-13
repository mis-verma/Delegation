import { useId, useState } from 'react';
import { Ban, Check, CornerUpLeft, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { Button, Modal, Textarea, ToggleChip } from '../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { useDeleteChecklistRunMutation, useRevokeChecklistSubmissionMutation, useSendBackChecklistInstanceMutation } from '../hook';
import { answerText } from './answerText';
import { QUICK_REASONS, hasReason, toggleReason } from './sendBackNote';
import { RunVerificationChip } from './RunVerificationChip';
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
  const count = picked.size;
  const recorrecting = count > 0;
  const ready = trimmed.length > 0 && !busy;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const recorrect = () => {
    if (!ready || !recorrecting) return;
    sendBack.mutate({ id: instance.id, payload: { itemIds: [...picked], note: trimmed } }, { onSuccess: onClose });
  };

  const revokeAll = async () => {
    if (!ready) return;
    const ok = await confirm({
      title: 'Revoke the whole checklist?',
      description: `Every answer is cleared and it goes back to the team${approved ? ', even though it was approved' : ''}. Your note is saved in the audit log.`,
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) revoke.mutate({ id: instance.id, note: trimmed }, { onSuccess: onClose });
  };

  const deleteRun = async () => {
    if (!ready) return;
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
  const hint = !trimmed ? 'Add a note so the team knows what to fix.' : recorrecting ? `Only the ${count} ticked ${count === 1 ? 'question goes' : 'questions go'} back.` : 'Nothing ticked, so the whole checklist goes back.';

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title={instance.title}
      icon={<ShieldCheck size={18} aria-hidden="true" />}
      size="lg"
      dirty={count > 0 || trimmed.length > 0}
      bodyClassName="flex flex-col gap-5"
      footer={(
        <div className="flex w-full flex-col gap-2">
          <p className={cn('t-meta font-medium', trimmed ? 'text-text-muted' : 'text-warning')} aria-live="polite">{hint}</p>
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="h-11 sm:h-9">Close</Button>
            {recorrecting ? (
              <Button type="button" disabled={!ready} isLoading={sendBack.isPending} onClick={recorrect} className="h-11 sm:h-9">
                {!sendBack.isPending && <CornerUpLeft size={15} aria-hidden="true" />}
                Send {count} back
              </Button>
            ) : (
              <Button type="button" variant="danger" disabled={!ready} isLoading={revoke.isPending} onClick={() => void revokeAll()} className="h-11 sm:h-9">
                {!revoke.isPending && <Undo2 size={15} aria-hidden="true" />}
                Revoke all
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RunVerificationChip instance={instance} />
        {instance.submittedByName && <span className="t-meta text-text-muted">Submitted by {instance.submittedByName}</span>}
      </div>

      <section aria-labelledby={`${noteId}-questions`} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`${noteId}-questions`} className="t-card font-display font-bold text-text">Tick what needs fixing</h3>
          <span className="t-meta font-display font-semibold tabular-nums text-text-muted">{count} of {instance.items.length}</span>
        </div>
        <ul className="flex flex-col gap-2" aria-label="Submitted answers">
          {instance.items.map((item) => {
            const on = picked.has(item.id);
            const answer = item.isNotApplicable ? 'Not applicable' : answerText(item) ?? (item.isDone ? 'Done' : 'No answer');
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    'flex min-h-14 w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors duration-150 ease-out touch-manipulation focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60',
                    on ? 'border-danger/45 bg-danger/[0.05]' : 'border-border/60 bg-surface hover:border-border-hover',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150', on ? 'border-danger bg-danger text-white' : 'border-border-hover text-transparent')}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-card font-display font-semibold leading-snug text-text break-words">{item.label}</span>
                    <span className="flex flex-wrap items-center gap-1.5 t-meta text-text-secondary break-words">
                      {item.isNotApplicable && <Ban size={12} className="shrink-0" aria-hidden="true" />}
                      {answer}
                    </span>
                    {item.remarks && <span className="t-meta text-text-muted break-words">"{item.remarks}"</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={`${noteId}-note`} className="flex flex-col gap-2">
        <h3 id={`${noteId}-note`} className="t-card font-display font-bold text-text">Note for the team</h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((reason) => (
            <ToggleChip key={reason} on={hasReason(note, reason)} disabled={busy} onClick={() => setNote(toggleReason(note, reason))} className="min-h-9 rounded-full px-3 sm:min-h-8">
              {reason}
            </ToggleChip>
          ))}
        </div>
        <Textarea
          id={noteId}
          label="Note for the team"
          labelClassName="sr-only"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={NOTE_MAX}
          placeholder="Say what needs fixing"
          className="min-h-0 resize-none rounded-xl px-3 py-2.5"
        />
      </section>

      {errorText && <p role="alert" className="t-meta font-display font-semibold text-danger">{errorText}</p>}

      <div className="flex flex-col gap-1 border-t border-border/50 pt-4">
        <button
          type="button"
          disabled={!ready}
          onClick={() => void deleteRun()}
          className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1.5 rounded-lg px-2 t-meta font-display font-semibold text-danger outline-none transition-colors duration-150 hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger/40 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8"
        >
          <Trash2 size={14} aria-hidden="true" />
          {removeRun.isPending ? 'Deleting…' : 'Delete this run for good'}
        </button>
        <p className="px-2 t-meta text-text-muted">For test runs only. Needs a note too.</p>
      </div>
    </Modal>
  );
};
