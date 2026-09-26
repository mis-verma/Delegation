import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowRightLeft, MessageSquareText, PenLine } from 'lucide-react';
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
  onCancel, onConfirm, isSubmitting = false, nested = false, history, attachments,
}: StatusRemarkDialogProps) => {
  const [remark, setRemark] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = remark.trim();
  const isEmpty = trimmed.length === 0;
  const showError = touched && isEmpty;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (isEmpty || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      modal={!nested}
      size="lg"
      icon={<MessageSquareText className="w-5 h-5 text-primary-600" />}
      title="Add a remark"
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
            disabled={isEmpty}
            className="max-sm:w-full"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <form id="status-remark-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-text-secondary tracking-tight">
            <ArrowRightLeft size={13} className="text-primary-500" /> Status change
          </span>
          {/* States the exact move being made, so the remark is written about the right thing —
              especially from a board drag, where the columns may already have scrolled away. A
              stronger border + tint than a plain neutral box, so this reads as the one thing the
              whole dialog is about rather than a quiet caption line. */}
          {/* Opacity tints, not raw swatches: `dark:bg-primary-950/20` named a shade the palette
              doesn't have (it stops at 900), so dark mode fell back to the light `bg-primary-50/40`
              — a near-white wash over a dark sheet that made the chips on it unreadable. The title
              gets its own line on phones instead of truncating beside the chips. */}
          <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl border border-primary-500/20 dark:border-primary-400/20 bg-primary-500/5 dark:bg-primary-500/10">
            {from}
            <ArrowRight size={13} strokeWidth={3} className="text-text-light shrink-0" />
            {to}
            <span className="basis-full sm:basis-auto text-[11px] font-medium text-text-muted truncate min-w-0">{itemTitle}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status-remark" className="flex items-center gap-1.5 text-xs font-bold text-text-secondary tracking-tight">
            <PenLine size={13} className="text-primary-500" /> What changed?
          </label>
          <textarea
            id="status-remark"
            autoFocus
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            maxLength={MAX_REMARK}
            aria-invalid={showError}
            aria-describedby={showError ? 'status-remark-error' : 'status-remark-hint'}
            placeholder={placeholder ?? 'e.g. Vendor confirmed the parts are shipping Friday — starting the fit-out now.'}
            className={`w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-light transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
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
            <span className="shrink-0 ml-auto text-[11px] font-semibold text-text-light tabular-nums">
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
