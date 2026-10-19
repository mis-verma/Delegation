import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, MessageSquareText, PenLine } from 'lucide-react';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Modal } from '../modal';
import { Button } from '../button';

const MAX_REMARK = 1000;
const COUNTER_FROM = 800;

interface StatusRemarkDialogProps {
  itemTitle: string;
  from: ReactNode;
  to: ReactNode;
  confirmLabel: string;
  description: string;
  phoneNote?: string;
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (remark: string) => void;
  isSubmitting?: boolean;
  nested?: boolean;
  history?: ReactNode;
  attachments?: ReactNode;
  suggestions?: string[];
  optional?: boolean;
  confirmWithNoteLabel?: string;
  title?: string;
}

export const StatusRemarkDialog = ({
  itemTitle, from, to, confirmLabel, description, placeholder,
  onCancel, onConfirm, isSubmitting = false, nested = false, history, attachments, suggestions,
  optional = false, confirmWithNoteLabel, title, phoneNote,
}: StatusRemarkDialogProps) => {
  const isTouch = useMediaQuery('(pointer: coarse)');
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
      dirty={!isEmpty}
      size="lg"
      icon={<MessageSquareText className="w-5 h-5 text-primary-600" />}
      title={title ?? (optional ? 'Add a note?' : 'Add a remark')}
      description={
        <>
          <span className="hidden sm:inline">{description}</span>
          {phoneNote && <span className="sm:hidden t-meta">{phoneNote}</span>}
        </>
      }
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
      <form id="status-remark-form" onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <section
          aria-label="Status change"
          className="flex flex-col gap-2 p-3 rounded-xl border border-primary-500/20 dark:border-primary-400/20 bg-primary-500/5 dark:bg-primary-500/10"
        >
          <p className="t-meta font-display font-semibold text-text-secondary leading-snug line-clamp-1">{itemTitle}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {from}
            <span aria-hidden="true" className="flex items-center justify-center size-6 rounded-full bg-linear-to-br from-primary-500 to-primary-600 text-white shrink-0">
              <ArrowRight size={12} strokeWidth={3} />
            </span>
            {to}
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <label htmlFor="status-remark" className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
            <PenLine size={13} className="text-text-light" /> {optional ? 'Note (optional)' : 'What changed?'}
          </label>

          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setRemark(s); textareaRef.current?.focus(); }}
                  aria-pressed={remark === s}
                  className={`inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full border t-meta transition-colors duration-150 ease-out cursor-pointer [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                    remark === s
                      ? 'border-primary-500/40 bg-primary-500/10 text-primary-700 dark:text-primary-300 font-semibold'
                      : 'border-border/60 bg-surface text-text-secondary font-medium hover:border-border-hover active:bg-surface-hover'
                  }`}
                >
                  {remark === s && <Check size={13} strokeWidth={2.75} aria-hidden="true" />}
                  {s}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            id="status-remark"
            autoFocus={!isTouch}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            maxLength={MAX_REMARK}
            aria-invalid={showError}
            aria-describedby={showError ? 'status-remark-error' : 'status-remark-hint'}
            placeholder={placeholder ?? 'e.g. Vendor confirmed the parts ship on Friday. Starting the fit-out now.'}
            className={`w-full resize-none rounded-xl border bg-surface-hover/40 px-3 py-2.5 text-sm text-text leading-relaxed placeholder:text-text-light transition-colors duration-150 ease-out focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
              showError ? 'border-danger focus:border-danger' : 'border-border/60 focus:border-primary-400'
            }`}
          />
          <div className="flex items-start justify-between gap-3">
            {showError ? (
              <p id="status-remark-error" className="t-meta font-semibold text-danger">
                A remark is required to change the status.
              </p>
            ) : (
              <p id="status-remark-hint" className="hidden sm:block t-meta font-medium text-text-muted">
                Whoever picks this up next sees this on the timeline.
              </p>
            )}
            {remark.length >= COUNTER_FROM && (
              <span className="shrink-0 ml-auto px-2 py-0.5 rounded-full bg-surface-hover t-meta font-semibold text-text-muted tabular-nums">
                {remark.length}/{MAX_REMARK}
              </span>
            )}
          </div>
        </div>

        {attachments}
      </form>

      {history && (
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
          {history}
        </div>
      )}
    </Modal>
  );
};
