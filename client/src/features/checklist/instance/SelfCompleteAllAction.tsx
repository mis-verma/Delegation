import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { useCompleteAllMutation } from '../hook';

const MIN_REASON = 5;

export const SelfCompleteAllAction = ({ instanceId, openCount, onDone }: { instanceId: string; openCount: number; onDone?: () => void }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const completeAll = useCompleteAllMutation();
  const trimmed = reason.trim();

  if (openCount === 0) return null;

  const close = () => { if (!completeAll.isPending) { setOpen(false); setReason(''); } };
  const submit = () => {
    if (trimmed.length < MIN_REASON) return;
    completeAll.mutate({ id: instanceId, reason: trimmed }, { onSuccess: () => { setOpen(false); setReason(''); onDone?.(); } });
  };

  return (
    <>
      <Button variant="outline" size="md" onClick={() => setOpen(true)} className="h-11 w-full font-display pointer-coarse:h-11">
        <ListChecks size={15} aria-hidden="true" />
        Close the rest &amp; submit
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="md"
        icon={<ListChecks className="size-5" />}
        title={`Close ${openCount} remaining ${openCount === 1 ? 'question' : 'questions'}?`}
        description="Each one is answered the way this checklist says is good, critical questions included, so they count towards your compliance. A question still waiting on a photo is marked done but left out of the score, because nobody can take that photo for you. The checklist then goes for approval, and your reason is kept in the audit log."
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={completeAll.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={completeAll.isPending || trimmed.length < MIN_REASON}>
              {completeAll.isPending ? 'Closing' : `Close ${openCount} & submit`}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label htmlFor="self-complete-all-reason" className="t-meta font-display font-semibold text-text-secondary">Why are you closing them?</label>
          <textarea
            id="self-complete-all-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="For example: checked everything in person, no issues"
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
          />
          <p className="t-meta font-medium text-text-muted">{trimmed.length < MIN_REASON ? `At least ${MIN_REASON} characters.` : `${trimmed.length} of 500`}</p>
        </div>
      </Modal>
    </>
  );
};
