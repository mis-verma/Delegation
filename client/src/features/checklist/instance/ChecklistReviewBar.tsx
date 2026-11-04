import { useMemo } from 'react';
import { PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';
import { useSendBackChecklistInstanceMutation, useVerifyChecklistInstanceMutation } from '../hook';
import { ReviewActions } from './ReviewActions';
import { CorrectionDialog } from '../../verification/CorrectionDialog';
import { runCorrectionItems, type SendBackPayload } from '../../verification/correctionItems';
import type { ReviewDraft } from '../../verification/useReviewDraft';
import type { ChecklistInstance } from '../../../api/checklistInstances';

type Props = {
  instance: ChecklistInstance;
  draft: ReviewDraft;
  onDecided?: () => void;
};

export const ChecklistReviewBar = ({ instance, draft, onDecided }: Props) => {
  const verifyMut = useVerifyChecklistInstanceMutation();
  const sendBackMut = useSendBackChecklistInstanceMutation();
  const busy = verifyMut.isPending || sendBackMut.isPending;
  const items = useMemo(() => runCorrectionItems(instance.items), [instance.items]);
  const count = draft.pickedIds.length;

  const done = () => {
    draft.reset();
    onDecided?.();
  };

  const send = ({ itemIds, note, fixByHours, photoOnlyItemIds }: SendBackPayload) => {
    if (itemIds.length) {
      sendBackMut.mutate(
        { id: instance.id, payload: { itemIds, note, ...(fixByHours ? { fixByHours } : {}), ...(photoOnlyItemIds?.length ? { photoOnlyItemIds } : {}) } },
        { onSuccess: done },
      );
    } else {
      verifyMut.mutate({ id: instance.id, payload: { action: 'REJECT', note, ...(fixByHours ? { fixByHours } : {}) } }, { onSuccess: done });
    }
  };

  return (
    <div className={cn(PANEL_CLASS, 'sticky bottom-3 z-20 flex flex-col gap-3 p-3.5 sm:p-4 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85')}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="t-meta font-display text-text-secondary">
          {count > 0
            ? `${count} ${count === 1 ? 'question' : 'questions'} picked. Send them for correction, or untick them to approve.`
            : 'Approve it, or send it for correction.'}
        </p>
        <ReviewActions
          pickedCount={count}
          onSendBack={() => draft.setSending(true)}
          onApprove={() => verifyMut.mutate({ id: instance.id, payload: { action: 'APPROVE' } }, { onSuccess: onDecided })}
          busy={busy}
          approving={verifyMut.isPending}
        />
      </div>
      <CorrectionDialog
        items={items}
        assigneeNames={instance.submittedByName ? [instance.submittedByName] : []}
        draft={draft}
        onSend={send}
        busy={sendBackMut.isPending || (verifyMut.isPending && draft.sending)}
      />
    </div>
  );
};
