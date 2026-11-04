import { useMemo } from 'react';
import { Camera, Check, CornerUpLeft, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Modal, Textarea, ToggleChip } from '../../components';
import { EvidenceThumb } from '../checklist/instance/EvidenceThumb';
import { itemFlags } from '../checklist/instance/reviewFlags';
import { QUICK_REASONS, SEND_BACK_NOTE_MAX, composeSendBackNote, hasItemReason, hasReason, orderedItemReasons, toggleItemReason, toggleReason } from '../checklist/instance/sendBackNote';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';
import type { ReviewDraft } from './useReviewDraft';
import type { ChecklistRow } from './verificationModel';
import type { SendBackPayload } from './ReviewPane';

const QUESTION_NOTE_MAX = 200;

const FIX_BY_OPTIONS: { label: string; hours: number | null }[] = [
  { label: 'No deadline', hours: null },
  { label: '2 hours', hours: 2 },
  { label: '4 hours', hours: 4 },
  { label: '24 hours', hours: 24 },
];

const generalPhotos = (item: ChecklistInstanceItem) => (item.images ?? []).filter((img) => (img.purpose ?? 'GENERAL') === 'GENERAL');

const problemsOf = (item: ChecklistInstanceItem): string[] => {
  const flags = itemFlags(item);
  return [
    ...(flags.weakPhoto ? ['Photo not clear'] : []),
    ...(flags.notLive ? ['Not live'] : []),
    ...(flags.reusedPhoto || flags.oldPhoto ? ['Old photo'] : []),
    ...(flags.missingPhotos && !flags.notLive ? ['Missing photo'] : []),
    ...(flags.bad ? ['Answer not matching'] : []),
  ];
};

interface CorrectionDialogProps {
  row: ChecklistRow;
  draft: ReviewDraft;
  onSend: (row: ChecklistRow, payload: SendBackPayload) => void;
}

export const CorrectionDialog = ({ row, draft, onSend }: CorrectionDialogProps) => {
  const { picked, pickedSet, photoOnlySet, note, fixByHours, sending } = draft;
  const names = row.assigneeNames.length > 0 ? row.assigneeNames.join(', ') : 'the team';

  const items = useMemo(() => {
    const sorted = [...row.instance.items].sort((a, b) => a.order - b.order);
    const withProblems = sorted.map((item) => ({ item, problems: problemsOf(item), photos: generalPhotos(item) }));
    return [...withProblems.filter((x) => x.problems.length > 0), ...withProblems.filter((x) => x.problems.length === 0)];
  }, [row.instance.items]);

  const pickedIds = draft.pickedIds;
  const composed = useMemo(() => {
    const labelById = new Map(row.instance.items.map((i) => [i.id, i.label]));
    return composeSendBackNote(note, pickedIds.map((id) => ({ label: labelById.get(id) ?? 'Question', note: picked[id] ?? '' })));
  }, [row.instance.items, note, pickedIds, picked]);
  const tooLong = composed.length > SEND_BACK_NOTE_MAX;
  const count = pickedIds.length;
  const photoCount = pickedIds.filter((id) => photoOnlySet.has(id)).length;

  const toggle = (item: ChecklistInstanceItem, problems: string[], hasPhotos: boolean) => {
    const adding = !pickedSet.has(item.id);
    draft.togglePicked(item.id);
    if (!adding) return;
    if (hasPhotos && problems.some((p) => p === 'Photo not clear' || p === 'Old photo')) draft.togglePhotoOnly(item.id);
    if (problems.length) draft.setItemNote(item.id, problems.slice(0, 2).join('; '));
  };

  const send = () => onSend(row, { itemIds: pickedIds, note: composed, fixByHours, photoOnlyItemIds: draft.photoOnlyIds });

  const summary = count === 0
    ? 'Nothing ticked. The whole checklist goes back.'
    : `${count} ${count === 1 ? 'question' : 'questions'}${photoCount > 0 ? `, ${photoCount} only need a new photo` : ''}`;

  return (
    <Modal
      open={sending}
      onClose={() => draft.setSending(false)}
      title="Send for correction"
      description={`To ${names}. They see your remarks and fix only what you tick.`}
      icon={<CornerUpLeft size={18} aria-hidden />}
      iconTone="danger"
      size="xl"
      contentClassName="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"
      bodyClassName="flex flex-col gap-6"
      footer={(
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn('t-meta font-display', tooLong ? 'text-danger' : 'text-text-muted')}>
            {tooLong ? `The remarks are ${composed.length - SEND_BACK_NOTE_MAX} characters too long.` : summary}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => draft.setSending(false)}>Cancel</Button>
            <Button size="sm" variant="danger" className="flex-1 sm:flex-none" disabled={composed.length === 0 || tooLong} onClick={send}>
              <CornerUpLeft size={14} aria-hidden />
              {count > 0 ? `Send ${count} back` : 'Send all back'}
            </Button>
          </div>
        </div>
      )}
    >
      <section aria-labelledby="correction-questions" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="correction-questions" className="t-card font-display font-bold text-text">Tick what needs fixing</h3>
          <span className="t-meta text-text-muted">Problems first</span>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map(({ item, problems, photos }) => {
            const on = pickedSet.has(item.id);
            const hasPhotos = item.itemType !== 'AUDIT' && (photos.length > 0 || item.requiredImageCount > 0);
            const photoOnly = photoOnlySet.has(item.id);
            const itemNote = picked[item.id] ?? '';
            return (
              <li key={item.id} className={cn('flex flex-col overflow-hidden rounded-lg border transition-colors duration-150', on ? 'border-danger/50 bg-danger/5' : 'border-border/60')}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item, problems, hasPhotos)}
                  className="flex min-h-11 w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
                >
                  <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors duration-150', on ? 'border-danger bg-danger text-white' : 'border-border-hover bg-surface')}>
                    {on && <Check size={13} strokeWidth={3} aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-card font-display font-semibold leading-snug text-text">{item.label}</span>
                    {problems.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {problems.map((p) => (
                          <span key={p} className="rounded-full bg-danger/10 px-2 py-0.5 t-meta font-display font-semibold text-danger">{p}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>

                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-3 pb-3 pl-11">
                    {photos.map((img) => <EvidenceThumb key={img.id} image={img} siblings={photos} />)}
                  </div>
                )}

                {on && (
                  <div className="flex flex-col gap-2.5 border-t border-border/50 px-3 py-3 sm:pl-11">
                    {hasPhotos && (
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`What to fix for: ${item.label}`}>
                        {[
                          { value: true, label: 'New photo only', hint: 'Answer stays', icon: Camera },
                          { value: false, label: 'Redo the question', hint: 'Answer and photo', icon: PencilLine },
                        ].map((o) => {
                          const selected = photoOnly === o.value;
                          return (
                            <button
                              key={o.label}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => { if (!selected) draft.togglePhotoOnly(item.id); }}
                              className={cn(
                                'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40',
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
                      {orderedItemReasons(problems).map((reason) => (
                        <ToggleChip key={reason} on={hasItemReason(itemNote, reason)} onClick={() => draft.setItemNote(item.id, toggleItemReason(itemNote, reason, QUESTION_NOTE_MAX))}>
                          {reason}
                        </ToggleChip>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={itemNote}
                      maxLength={QUESTION_NOTE_MAX}
                      onChange={(e) => draft.setItemNote(item.id, e.target.value)}
                      placeholder="Remark for this question"
                      aria-label={`Remark for: ${item.label}`}
                      className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-display text-text outline-none placeholder:text-text-light hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:h-9"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="correction-remarks" className="flex flex-col gap-3">
        <h3 id="correction-remarks" className="t-card font-display font-bold text-text">Remarks for the team</h3>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((reason) => (
            <ToggleChip key={reason} on={hasReason(note, reason)} onClick={() => draft.setNote(toggleReason(note, reason))}>
              {reason}
            </ToggleChip>
          ))}
        </div>
        <Textarea
          label="Remarks for the team"
          labelClassName="sr-only"
          value={note}
          onChange={(e) => draft.setNote(e.target.value)}
          placeholder={count > 0 ? 'Anything else they should know' : 'What needs fixing before this can be approved?'}
          rows={3}
          maxLength={SEND_BACK_NOTE_MAX}
          className="min-h-0 resize-none py-2.5"
        />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Fix within">
          <span className="t-meta font-display font-semibold text-text-secondary">Fix within</span>
          {FIX_BY_OPTIONS.map((o) => (
            <ToggleChip key={o.label} on={fixByHours === o.hours} onClick={() => draft.setFixBy(o.hours)}>
              {o.label}
            </ToggleChip>
          ))}
        </div>
      </section>
    </Modal>
  );
};
