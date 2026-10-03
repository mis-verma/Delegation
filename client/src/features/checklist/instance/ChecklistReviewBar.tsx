import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';
import { useSendBackChecklistInstanceMutation, useVerifyChecklistInstanceMutation } from '../hook';
import { ReviewActions, SendBackForm } from './ReviewActions';

type Props = {
  instanceId: string;
  /** Questions the reviewer has ticked to send back. */
  selectedCount: number;
  selecting: boolean;
  onStartSelecting: () => void;
  onStopSelecting: () => void;
  /** Called after a successful send-back so the page can clear its selection. */
  onSent: () => void;
  selectedIds: string[];
};

// Reviewer's decision bar for a checklist waiting on approval. Approve is one tap. "Send back"
// switches the page into pick mode: tick only the questions that weren't done properly, say what to
// fix, and just those go back to whoever fills the checklist in. Everything else stays done.
export const ChecklistReviewBar = ({ instanceId, selectedCount, selecting, onStartSelecting, onStopSelecting, onSent, selectedIds }: Props) => {
  const verifyMut = useVerifyChecklistInstanceMutation();
  const sendBackMut = useSendBackChecklistInstanceMutation();
  const [note, setNote] = useState('');
  const busy = verifyMut.isPending || sendBackMut.isPending;
  const canSend = selectedCount > 0 && note.trim().length > 0;

  const send = () => {
    sendBackMut.mutate(
      { id: instanceId, payload: { itemIds: selectedIds, note: note.trim() } },
      { onSuccess: () => { setNote(''); onSent(); } },
    );
  };

  return (
    <div className={cn(PANEL_CLASS, 'sticky bottom-3 z-20 flex flex-col gap-3 p-3.5 sm:p-4 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85')}>
      {selecting ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-display font-semibold text-text">
              {selectedCount === 0 ? 'Tick the questions to send back' : `${selectedCount} ${selectedCount === 1 ? 'question' : 'questions'} to send back`}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={onStopSelecting}
              disabled={busy}
              aria-label="Cancel send back"
              className="size-11 sm:size-8 p-0 -mr-2 rounded-full"
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
          <SendBackForm
            note={note}
            onNoteChange={setNote}
            onCancel={onStopSelecting}
            onSubmit={send}
            canSubmit={canSend}
            isSending={sendBackMut.isPending}
            busy={busy}
            submitLabel={`Send back${selectedCount > 0 ? ` ${selectedCount}` : ''}`}
            placeholder="What needs fixing? The team sees this on each question."
            maxLength={1000}
          />
        </>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-display text-text-secondary">
            Everything's ticked off. Approve it, or send back only the questions that need redoing.
          </p>
          <ReviewActions
            onSendBack={onStartSelecting}
            onApprove={() => verifyMut.mutate({ id: instanceId, payload: { action: 'APPROVE' } })}
            busy={busy}
            approving={verifyMut.isPending}
          />
        </div>
      )}
    </div>
  );
};
