import { useMemo } from 'react';
import { Camera, Check, CornerUpLeft, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Modal, Textarea, ToggleChip } from '../../components';
import { EvidenceThumb } from '../checklist/instance/EvidenceThumb';
import { QUICK_REASONS, SEND_BACK_NOTE_MAX, composeSendBackNote, hasItemReason, hasReason, orderedItemReasons, toggleItemReason, toggleReason } from '../checklist/instance/sendBackNote';
import type { ReviewDraft } from './useReviewDraft';
import type { CorrectionItem, SendBackPayload } from './correctionItems';

const QUESTION_NOTE_MAX = 200;
const PHOTO_PROBLEMS = new Set(['Photo not clear', 'Old photo']);

const FIX_BY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'No deadline', hours: null },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '24 hours', hours: 24 },
];

interface CorrectionDialogProps {
  items: CorrectionItem[];
  assigneeNames: string[];
  draft: ReviewDraft;
  onSend: (payload: SendBackPayload) => void;
  busy?: boolean;
  allowFixBy?: boolean;
  wholeLabel?: string;
}

export const CorrectionDialog = ({ items, assigneeNames, draft, onSend, busy = false, allowFixBy = true, wholeLabel = 'The whole checklist goes back.' }: CorrectionDialogProps) => {
  const { picked, pickedIds, pickedSet, photoOnlySet, note, fixByHours, sending } = draft;
  const names = assigneeNames.length > 0 ? assigneeNames.join(', ') : 'the team';

  const ordered = useMemo(
    () => [...items.filter((i) => i.problems.length > 0), ...items.filter((i) => i.problems.length === 0)],
    [items],
  );

  const composed = useMemo(() => {
    const labelById = new Map(items.map((i) => [i.id, i.label]));
    return composeSendBackNote(note, pickedIds.map((id) => ({ label: labelById.get(id) ?? 'Question', note: picked[id] ?? '' })));
  }, [items, note, pickedIds, picked]);
  const tooLong = composed.length > SEND_BACK_NOTE_MAX;
  const count = pickedIds.length;
  const photoCount = pickedIds.filter((id) => photoOnlySet.has(id)).length;

  const toggle = (item: CorrectionItem) => {
    const adding = !pickedSet.has(item.id);
    draft.togglePicked(item.id);
    if (!adding) return;
    if (item.canPhotoOnly && item.problems.some((p) => PHOTO_PROBLEMS.has(p))) draft.togglePhotoOnly(item.id);
    const reasons = item.problems.filter((p) => p !== 'Not done');
    if (reasons.length) draft.setItemNote(item.id, reasons.slice(0, 2).join('; '));
  };

  const send = () => {
    if (busy) return;
    onSend({ itemIds: pickedIds, note: composed, fixByHours: allowFixBy ? fixByHours : null, photoOnlyItemIds: pickedIds.filter((id) => photoOnlySet.has(id)) });
  };

  const summary = count === 0
    ? `Nothing ticked. ${wholeLabel}`
    : `${count} ${count === 1 ? 'question' : 'questions'}${photoCount > 0 ? `, ${photoCount} only need a new photo` : ''}`;

  return (
    <Modal
      open={sending}
      onClose={() => { if (!busy) draft.setSending(false); }}
      title="Send for correction"
      description={`To ${names}. They see your remarks and fix only what you tick.`}
      icon={<CornerUpLeft size={18} aria-hidden />}
      iconTone="danger"
      size="xl"
      dirty={count > 0 || note.trim().length > 0}
      contentClassName="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"
      bodyClassName="flex flex-col gap-6"
      footer={(
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn('t-meta font-display', tooLong ? 'text-danger' : 'text-text-muted')} aria-live="polite">
            {tooLong ? `The remarks are ${composed.length - SEND_BACK_NOTE_MAX} characters too long.` : summary}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={busy} onClick={() => draft.setSending(false)}>Cancel</Button>
            <Button size="sm" variant="danger" className="flex-1 sm:flex-none" disabled={composed.length === 0 || tooLong} isLoading={busy} onClick={send}>
              {!busy && <CornerUpLeft size={14} aria-hidden />}
              {count > 0 ? `Send ${count} back` : 'Send all back'}
            </Button>
          </div>
        </div>
      )}
    >
      {ordered.length > 0 && (
        <section aria-labelledby="correction-questions" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="correction-questions" className="t-card font-display font-bold text-text">Tick what needs fixing</h3>
            <span className="t-meta text-text-muted">Problems first</span>
          </div>
          <ul className="flex flex-col gap-2">
            {ordered.map((item) => {
              const on = pickedSet.has(item.id);
              const photoOnly = photoOnlySet.has(item.id);
              const itemNote = picked[item.id] ?? '';
              return (
                <li key={item.id} className={cn('flex flex-col overflow-hidden rounded-lg border transition-colors duration-150', on ? 'border-danger/50 bg-danger/5' : 'border-border/60')}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => toggle(item)}
                    className="flex min-h-11 w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 disabled:cursor-not-allowed"
                  >
                    <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-150', on ? 'border-danger bg-danger text-white' : 'border-border-hover bg-surface')}>
                      {on && <Check size={13} strokeWidth={3} aria-hidden />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="t-card font-display font-semibold leading-snug text-text">{item.label}</span>
                      {item.problems.length > 0 && (
                        <span className="flex flex-wrap gap-1.5">
                          {item.problems.map((p) => (
                            <span key={p} className="rounded-full bg-danger/10 px-2 py-0.5 t-meta font-display font-semibold text-danger">{p}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>

                  {item.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-3 pb-3 pl-11">
                      {item.photos.map((img) => <EvidenceThumb key={img.id} image={img} siblings={item.photos} />)}
                    </div>
                  )}

                  {on && (
                    <div className="flex flex-col gap-2.5 border-t border-border/50 px-3 py-3 sm:pl-11">
                      {item.canPhotoOnly && (
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`What to fix for: ${item.label}`}>
                          {[
                            { value: true, label: 'New photo only', hint: 'Rest stays as it is', icon: Camera },
                            { value: false, label: 'Redo it', hint: 'Answer and photo', icon: PencilLine },
                          ].map((o) => {
                            const selected = photoOnly === o.value;
                            return (
                              <button
                                key={o.label}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={busy}
                                onClick={() => { if (!selected) draft.togglePhotoOnly(item.id); }}
                                className={cn(
                                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed',
                                  selected ? 'border-primary-500 bg-primary-500/10' : 'border-border hover:border-border-hover',
                                )}
                              >
                                <o.icon size={16} className={selected ? 'text-primary-600 dark:text-primary-300' : 'text-text-muted'} aria-hidden />
                                <span className="flex min-w-0 flex-col">
                                  <span className="t-meta font-display font-bold text-text">{o.label}</span>
                                  <span className="t-meta text-text-muted">{o.hint}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0" role="group" aria-label={`Reasons for: ${item.label}`}>
                        {orderedItemReasons(item.problems).map((reason) => (
                          <ToggleChip key={reason} on={hasItemReason(itemNote, reason)} disabled={busy} onClick={() => draft.setItemNote(item.id, toggleItemReason(itemNote, reason, QUESTION_NOTE_MAX))}>
                            {reason}
                          </ToggleChip>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={itemNote}
                        maxLength={QUESTION_NOTE_MAX}
                        disabled={busy}
                        onChange={(e) => draft.setItemNote(item.id, e.target.value)}
                        placeholder="Remark for this question"
                        aria-label={`Remark for: ${item.label}`}
                        className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-display text-text outline-none placeholder:text-text-light hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 disabled:opacity-60 sm:h-9"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="correction-remarks" className="flex flex-col gap-3">
        <h3 id="correction-remarks" className="t-card font-display font-bold text-text">Remarks for the team</h3>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((reason) => (
            <ToggleChip key={reason} on={hasReason(note, reason)} disabled={busy} onClick={() => draft.setNote(toggleReason(note, reason))}>
              {reason}
            </ToggleChip>
          ))}
        </div>
        <Textarea
          label="Remarks for the team"
          labelClassName="sr-only"
          value={note}
          disabled={busy}
          onChange={(e) => draft.setNote(e.target.value)}
          placeholder={count > 0 ? 'Anything else they should know' : 'What needs fixing before this can be approved?'}
          rows={3}
          maxLength={SEND_BACK_NOTE_MAX}
          className="min-h-0 resize-none py-2.5"
        />
        {allowFixBy && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Fix within">
            <span className="t-meta font-display font-semibold text-text-secondary">Fix within</span>
            {FIX_BY_OPTIONS.map((o) => (
              <ToggleChip key={o.label} on={fixByHours === o.hours} disabled={busy} onClick={() => draft.setFixBy(o.hours)}>
                {o.label}
              </ToggleChip>
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
};
