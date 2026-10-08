import { useId } from 'react';
import { Check, CornerUpLeft } from 'lucide-react';
import { Button, Textarea, ToggleChip } from '../../../components';
import { cn } from '@/lib/utils';
import { QUICK_REASONS, hasReason, toggleReason } from './sendBackNote';

// The approve / send-back controls a reviewer sees on a checklist waiting for approval. The review
// queue (ChecklistApprovals) and the detail page's review bar (ChecklistReviewBar) used to carry two
// hand-built copies of this with different labels, shadows and spinners; both render these now.

interface ReviewActionsProps {
  /** Send back opens whatever the caller uses to collect a note (inline form, or pick mode). */
  onSendBack: () => void;
  onApprove: () => void;
  /** Any review request in flight: both buttons lock so a reviewer can't fire two at once. */
  busy: boolean;
  /** Specifically the approve request, which puts the spinner on the Approve button. */
  approving: boolean;
  /** Number of questions the reviewer ticked to send back on their own. */
  pickedCount?: number;
  /** Shows the keyboard keys (S, A) next to the labels, on screens with a keyboard. */
  showKeys?: boolean;
  /** Buttons share the row equally on a phone (a thumb-wide target) and shrink back from sm up. */
  stretch?: boolean;
}

const Key = ({ children }: { children: string }) => (
  <kbd className="hidden lg:inline-flex items-center justify-center min-w-4 px-1 rounded border border-current/30 text-[0.625rem] font-display font-semibold leading-4 opacity-70" aria-hidden>
    {children}
  </kbd>
);

export const ReviewActions = ({ onSendBack, onApprove, busy, approving, pickedCount = 0, showKeys = false, stretch = false }: ReviewActionsProps) => (
  <div className={cn('flex items-center gap-2', stretch ? 'w-full sm:w-auto' : 'shrink-0')}>
    <Button
      size="sm"
      variant="outline"
      className={cn('border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger', stretch && 'flex-1 sm:flex-none')}
      disabled={busy}
      onClick={onSendBack}
    >
      <CornerUpLeft size={14} aria-hidden />
      {pickedCount > 0 ? `Send back ${pickedCount} ${pickedCount === 1 ? 'question' : 'questions'}` : 'Send back'}
      {showKeys && <Key>S</Key>}
    </Button>
    <Button
      size="sm"
      className={cn('bg-success text-white hover:bg-success/90 hover:text-white', stretch && 'flex-1 sm:flex-none')}
      disabled={busy || pickedCount > 0}
      title={pickedCount > 0 ? 'Untick the questions first, or send them back' : undefined}
      isLoading={approving}
      onClick={onApprove}
    >
      {!approving && <Check size={14} aria-hidden />}
      Approve
      {showKeys && !approving && <Key>A</Key>}
    </Button>
  </div>
);

interface SendBackFormProps {
  note: string;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  /** Whether the send button is enabled (caller decides what "enough" is: a note, a picked question...). */
  canSubmit: boolean;
  /** The send-back request is in flight. */
  isSending: boolean;
  /** Any review request in flight, so Cancel locks too. */
  busy: boolean;
  submitLabel: string;
  placeholder: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Shows the one-tap reasons ("Photo unclear", ...) above the note box. */
  quickReasons?: boolean;
  /** Small line under the note box, e.g. how many question notes will be added. */
  helper?: string;
}

// Note box plus Cancel / confirm, the second half of the send-back flow in both places.
export const SendBackForm = ({
  note, onNoteChange, onCancel, onSubmit, canSubmit, isSending, busy, submitLabel, placeholder, maxLength, autoFocus, quickReasons = false, helper,
}: SendBackFormProps) => {
  const id = useId();
  return (
    <>
      {quickReasons && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((reason) => (
            <ToggleChip key={reason} on={hasReason(note, reason)} disabled={busy} onClick={() => onNoteChange(toggleReason(note, reason))}>
              {reason}
            </ToggleChip>
          ))}
        </div>
      )}
      <Textarea
        id={id}
        label="What needs fixing"
        labelClassName="sr-only"
        autoFocus={autoFocus}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={maxLength}
        className="min-h-0 py-2.5 resize-none"
      />
      {helper && <p className="text-xs font-display text-text-muted">{helper}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="danger" disabled={!canSubmit || busy} isLoading={isSending} onClick={onSubmit}>
          {!isSending && <CornerUpLeft size={14} aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </>
  );
};
