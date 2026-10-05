import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, MessageSquareText, PenLine } from 'lucide-react';
import { Modal } from '../modal';
import { Button } from '../button';

export const MAX_REMARK = 1000;

interface StatusRemarkDialogProps {
  /** Name of the thing being moved, shown beside the from → to chips. */
  itemTitle: string;
  /** The current and target status, already rendered as this module's own chips. */
  from: ReactNode;
  to: ReactNode;
  /** Confirm button text, e.g. "Move to In Review". */
  confirmLabel: string;
  /** One line under the title saying where the remark ends up. */
  description: string;
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  /**
   * Pass `true` when this opens on top of another Modal (a detail sheet does; a board drag
   * doesn't). Modal.tsx documents why: two Radix Dialogs in modal mode both try to own the body
   * scroll-lock, and dismissing the inner one first can leave the outer sheet unclickable.
   *
   * NOT safe on top of a shadcn/ui Sheet (as opposed to this module's own Modal) — the Sheet's
   * Radix Dialog portals outside the Sheet's own DOM subtree, so with `nested` (modal={false})
   * the Sheet's dismissable-layer reads a click inside this dialog as an outside click and closes
   * the Sheet before the click reaches the submit button. See tickets/TicketDetail.tsx's own
   * comment on its TicketStatusRemarkDialog for the concrete case this bit.
   */
  nested?: boolean;
  /** Optional compact history list, rendered below the remark field — a caller-built block (this
   *  component doesn't know what a "status" looks like for any particular module) so whoever's
   *  about to explain a change can see recent ones without leaving the dialog. */
  history?: ReactNode;
  /** Optional caller-built attachments block (e.g. a photo picker + thumbnails), rendered inside
   *  the form below the remark field. Kept as a plain node for the same reason as `history` — this
   *  component doesn't know what a module's evidence/proof capture looks like, only that there's
   *  room for one next to the remark that explains it. */
  attachments?: ReactNode;
  /** Optional one-tap remark starters shown above the text box (tap fills it, still editable). */
  suggestions?: string[];
  /**
   * The note is the person's choice: the dialog can be confirmed with the box empty (onConfirm then
   * gets ''), the title and label say "optional", and the button reads `confirmLabel` until
   * something is typed, then `confirmWithNoteLabel`. Leave off for a status that must be explained.
   */
  optional?: boolean;
  /** Confirm text once a note is typed, in optional mode. Defaults to `${confirmLabel} with note`. */
  confirmWithNoteLabel?: string;
}

/**
 * The gate for a status change that has to be explained.
 *
 * Both Delegation and Tickets require a remark on every status change, and each has more than one
 * way to start one — a detail sheet's advance button, a board drag, a card's "Move to" menu. Every
 * one of those routes through this dialog, so no surface can be used as a way around the
 * requirement and the paths can't drift into asking for different things. Modules supply their own
 * status chips and wording; the form, validation and copy limits live here once.
 */
export const StatusRemarkDialog = ({
  itemTitle, from, to, confirmLabel, description, placeholder,
  onCancel, onConfirm, isSubmitting = false, nested = false, history, attachments, suggestions,
  optional = false, confirmWithNoteLabel,
}: StatusRemarkDialogProps) => {
  const [remark, setRemark] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [touched, setTouched] = useState(false);

  const trimmed = remark.trim();
  const isEmpty = trimmed.length === 0;
  const showError = !optional && touched && isEmpty;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if ((isEmpty && !optional) || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      modal={!nested}
      size="lg"
      icon={<MessageSquareText className="w-5 h-5 text-primary-600" />}
      title={optional ? 'Add a note?' : 'Add a remark'}
      // Desktop-only: three lines of header on a phone for something the form itself makes clear.
      description={<span className="hidden sm:inline">{description}</span>}
      // Phones: header X instead of the footer Cancel, and the confirm button spans the sheet —
      // same pattern as the New Delegation form.
      closeButtonClassName="sm:hidden"
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} className="hidden sm:inline-flex">
            Cancel
          </Button>
          <Button
            type="submit"
            form="status-remark-form"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={isEmpty && !optional}
            className="max-sm:w-full"
          >
            {optional && !isEmpty ? (confirmWithNoteLabel ?? `${confirmLabel} with note`) : confirmLabel}
          </Button>
        </div>
      }
    >
      <form id="status-remark-form" onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* The move itself, as one card: what's moving (title) and from → to, in the same status
            chips the list cards use. States the exact change so the remark is written about the
            right thing — especially from a board drag, where the columns may have scrolled away.
            Opacity tints so it reads in both themes (see git history: a raw primary-950 swatch
            here silently fell back to a near-white wash in dark mode). */}
        <section
          aria-label="Status change"
          className="flex flex-col gap-3 p-3.5 rounded-2xl border border-primary-500/20 dark:border-primary-400/20 bg-primary-500/5 dark:bg-primary-500/10"
        >
          <p className="text-sm font-display font-semibold text-text leading-snug line-clamp-2">{itemTitle}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {from}
            <span aria-hidden="true" className="flex items-center justify-center size-6 rounded-full bg-surface border border-border/60 text-primary-600 dark:text-primary-300 shrink-0">
              <ArrowRight size={12} strokeWidth={3} />
            </span>
            {to}
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <label htmlFor="status-remark" className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
            <PenLine size={13} className="text-text-light" /> {optional ? 'Note (optional)' : 'What changed?'}
          </label>

          {/* One-tap starting points for the common remarks — typing a sentence on a phone keyboard
              is the slowest part of moving a delegation forward. Fills the box; still editable. */}
          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setRemark(s); textareaRef.current?.focus(); }}
                  aria-pressed={remark === s}
                  className={`h-11 sm:h-8 px-3.5 sm:px-3 rounded-full border text-xs font-medium transition-colors duration-150 cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                    remark === s
                      ? 'border-transparent bg-primary-700 text-white'
                      : 'border-border/60 bg-surface text-text-secondary hover:border-primary-400 active:bg-surface-hover'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            id="status-remark"
            autoFocus
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            maxLength={MAX_REMARK}
            aria-invalid={showError}
            aria-describedby={showError ? 'status-remark-error' : 'status-remark-hint'}
            placeholder={placeholder ?? 'e.g. Vendor confirmed the parts ship on Friday. Starting the fit-out now.'}
            className={`w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-base sm:text-sm text-text placeholder:text-text-light transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
              showError ? 'border-danger focus:border-danger' : 'border-border focus:border-primary-400'
            }`}
          />
          <div className="flex items-start justify-between gap-3">
            {showError ? (
              <p id="status-remark-error" className="text-[11px] font-semibold text-danger">
                A remark is required to change the status.
              </p>
            ) : (
              <p id="status-remark-hint" className="hidden sm:block text-[11px] font-medium text-text-muted">
                Whoever picks this up next sees this on the timeline.
              </p>
            )}
            <span className="shrink-0 ml-auto px-2 py-0.5 rounded-full bg-surface-hover text-[10px] font-semibold text-text-muted tabular-nums">
              {trimmed.length}/{MAX_REMARK}
            </span>
          </div>
        </div>

        {attachments}
      </form>

      {history && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
          {history}
        </div>
      )}
    </Modal>
  );
};
