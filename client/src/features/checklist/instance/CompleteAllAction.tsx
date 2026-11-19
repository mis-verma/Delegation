import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { useCompleteAllMutation } from '../hook';

const MIN_REASON = 5;

export const CompleteAllAction = ({ instanceId, openCount }: { instanceId: string; openCount: number }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const completeAll = useCompleteAllMutation();
  const trimmed = reason.trim();

  if (openCount === 0) return null;

  const close = () => { if (!completeAll.isPending) { setOpen(false); setReason(''); } };
  const submit = () => {
    if (trimmed.length < MIN_REASON) return;
    completeAll.mutate({ id: instanceId, reason: trimmed }, { onSuccess: () => { setOpen(false); setReason(''); } });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="pointer-coarse:min-h-11">
        <ListChecks size={14} aria-hidden="true" />
        Complete all
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="md"
        icon={<ListChecks className="size-5" />}
        title={`Close ${openCount} open ${openCount === 1 ? 'question' : 'questions'}`}
        description="They are marked done by you and waived, so they don't count against anyone's compliance. The checklist then goes for approval. The reason is shown on each question and kept in the audit log."
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={completeAll.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={completeAll.isPending || trimmed.length < MIN_REASON}>
              {completeAll.isPending ? 'Completing' : `Complete ${openCount}`}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label htmlFor="complete-all-reason" className="t-meta font-display font-semibold text-text-secondary">Why are you closing them?</label>
          <textarea
            id="complete-all-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="For example: checked in person during the store visit"
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
          />
          <p className="t-meta font-medium text-text-muted">{trimmed.length < MIN_REASON ? `At least ${MIN_REASON} characters.` : `${trimmed.length} of 500`}</p>
        </div>
      </Modal>
    </>
  );
};
