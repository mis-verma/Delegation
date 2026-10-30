import { useId } from 'react';
import { Check, CornerUpLeft } from 'lucide-react';
import { Button, Textarea, ToggleChip } from '../../../components';
import { cn } from '@/lib/utils';
import { QUICK_REASONS, hasReason, toggleReason } from './sendBackNote';

interface ReviewActionsProps {
  onSendBack: () => void;
  onApprove: () => void;
  busy: boolean;
  approving: boolean;
  pickedCount?: number;
  showKeys?: boolean;
  stretch?: boolean;
}

const Key = ({ children }: { children: string }) => (
  <kbd className="hidden lg:inline-flex items-center justify-center min-w-4 px-1 rounded border border-current/30 t-meta font-display font-semibold leading-4 opacity-70" aria-hidden>
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
      {pickedCount > 0 ? (
        <>
          Send back <span className="sm:hidden">({pickedCount})</span>
          <span className="hidden sm:inline">{pickedCount} {pickedCount === 1 ? 'question' : 'questions'}</span>
        </>
      ) : 'Send back'}
      {showKeys && <Key>S</Key>}
    </Button>
    <Button
      size="sm"
      className={cn('bg-success-strong text-white hover:bg-success-strong/90 hover:text-white', stretch && 'flex-1 sm:flex-none')}
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

const FIX_BY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'No deadline', hours: null },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '24 hours', hours: 24 },
];

interface SendBackFormProps {
  note: string;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isSending: boolean;
  busy: boolean;
  submitLabel: string;
  placeholder: string;
  maxLength?: number;
  autoFocus?: boolean;
  quickReasons?: boolean;
  helper?: string;
  fixBy?: { value: number | null; onChange: (hours: number | null) => void };
}

export const SendBackForm = ({
  note, onNoteChange, onCancel, onSubmit, canSubmit, isSending, busy, submitLabel, placeholder, maxLength, autoFocus, quickReasons = false, helper, fixBy,
}: SendBackFormProps) => {
  const id = useId();
  return (
    <>
      {quickReasons && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0" role="group" aria-label="Quick reasons">
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
      {fixBy && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Fix by">
          <span className="t-meta font-display font-semibold text-text-secondary">Fix within</span>
          {FIX_BY_OPTIONS.map((o) => (
            <ToggleChip key={o.label} on={fixBy.value === o.hours} disabled={busy} onClick={() => fixBy.onChange(o.hours)}>
              {o.label}
            </ToggleChip>
          ))}
        </div>
      )}
      {helper && <p className="t-meta font-display text-text-muted">{helper}</p>}
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
