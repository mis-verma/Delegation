import { useState } from 'react';
import { Check, CornerUpLeft, Loader2, X } from 'lucide-react';
import { Button } from '../../../components';
import { useSendBackChecklistInstanceMutation, useVerifyChecklistInstanceMutation } from '../hook';

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
  const canSend = selectedCount > 0 && note.trim().length > 0 && !busy;

  const send = () => {
    sendBackMut.mutate(
      { id: instanceId, payload: { itemIds: selectedIds, note: note.trim() } },
      { onSuccess: () => { setNote(''); onSent(); } },
    );
  };

  return (
    <div className="sticky bottom-3 z-20 flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.08] bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      {selecting ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-display font-semibold text-text">
              {selectedCount === 0 ? 'Tick the questions to send back' : `${selectedCount} ${selectedCount === 1 ? 'question' : 'questions'} to send back`}
            </p>
            <button
              type="button"
              onClick={onStopSelecting}
              disabled={busy}
              aria-label="Cancel send back"
              className="inline-flex items-center justify-center size-9 -mr-1.5 rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What needs fixing? The team sees this on each question."
            rows={2}
            maxLength={1000}
            className="w-full px-3.5 py-2.5 text-sm font-display bg-surface/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger/50 resize-none transition-all placeholder:text-text-muted/50"
          />
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={onStopSelecting}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 bg-danger hover:bg-danger/90"
              disabled={!canSend}
              onClick={send}
            >
              {sendBackMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CornerUpLeft size={14} />}
              Send back{selectedCount > 0 ? ` ${selectedCount}` : ''}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-display text-text-secondary">
            Everything's ticked off. Approve it, or send back only the questions that need redoing.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              disabled={busy}
              onClick={onStartSelecting}
            >
              <CornerUpLeft size={14} />
              Send back
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 bg-success hover:bg-success/90"
              disabled={busy}
              onClick={() => verifyMut.mutate({ id: instanceId, payload: { action: 'APPROVE' } })}
            >
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
