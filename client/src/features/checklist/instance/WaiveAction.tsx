import { useState } from 'react';
import { ShieldCheck, Undo2 } from 'lucide-react';
import { Button, Modal } from '../../../components';
import { useUnwaiveChecklistItemMutation, useWaiveChecklistItemMutation } from '../hook';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

const MIN_REASON = 5;

/**
 * For a reviewer: excuse a question that counts against compliance (a bad answer or a send-back), with a
 * written reason, or take that waiver back. A waived question leaves compliance entirely. The person it
 * was scored against sees the reason on the question, and it is written to the audit log.
 */
export const WaiveAction = ({ instanceId, item }: { instanceId: string; item: Pick<ChecklistInstanceItem, 'id' | 'label' | 'waivedAt'> }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const waive = useWaiveChecklistItemMutation();
  const unwaive = useUnwaiveChecklistItemMutation();
  const trimmed = reason.trim();

  if (item.waivedAt) {
    return (
      <Button variant="ghost" size="sm" onClick={() => unwaive.mutate({ id: instanceId, itemId: item.id })} disabled={unwaive.isPending} className="pointer-coarse:min-h-11">
        <Undo2 size={14} aria-hidden="true" />
        {unwaive.isPending ? 'Taking back' : 'Take the waiver back'}
      </Button>
    );
  }

  const close = () => { if (!waive.isPending) { setOpen(false); setReason(''); } };
  const submit = () => {
    if (trimmed.length < MIN_REASON) return;
    waive.mutate({ id: instanceId, itemId: item.id, reason: trimmed }, { onSuccess: () => { setOpen(false); setReason(''); } });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="pointer-coarse:min-h-11">
        <ShieldCheck size={14} aria-hidden="true" />
        Waive
      </Button>
      <Modal
        open={open}
        onClose={close}
        size="md"
        icon={<ShieldCheck className="size-5" />}
        title="Waive this question"
        description="It will no longer count against compliance. The reason is shown to the person and kept in the audit log."
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={waive.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={waive.isPending || trimmed.length < MIN_REASON}>{waive.isPending ? 'Waiving' : 'Waive it'}</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-3 py-2 text-sm font-display font-semibold text-text">{item.label}</p>
          <label htmlFor="waive-reason" className="text-xs font-display font-semibold text-text-secondary">Why is it being waived?</label>
          <textarea
            id="waive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="For example: store was closed for stock-taking"
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:text-sm"
          />
          <p className="text-xs font-medium text-text-muted">{trimmed.length < MIN_REASON ? `At least ${MIN_REASON} characters.` : `${trimmed.length} of 500`}</p>
        </div>
      </Modal>
    </>
  );
};
