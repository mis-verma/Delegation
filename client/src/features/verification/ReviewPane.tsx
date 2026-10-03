import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Flag, CornerUpLeft, CheckCircle2 } from 'lucide-react';
import { IconChip, Modal, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import { complianceToneClass, formatDate, formatDateTime } from '../checklist/checklistDisplay';
import { InstanceReviewPanel } from '../checklist/instance/InstanceReviewPanel';
import { ReviewActions, SendBackForm } from '../checklist/instance/ReviewActions';
import { SEND_BACK_NOTE_MAX, composeSendBackNote } from '../checklist/instance/sendBackNote';
import type { ReviewDraft } from './useReviewDraft';
import type { ChecklistRow } from './verificationModel';

export interface SendBackPayload {
  /** Empty means the whole run goes back. */
  itemIds: string[];
  note: string;
}

const Tile = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="flex flex-col gap-0.5 p-3 rounded-lg border border-border/60 bg-surface-hover/40">
    <span className="text-xs font-display text-text-muted">{label}</span>
    <span className={cn('text-lg font-display font-bold tabular-nums text-text', tone)}>{value}</span>
  </div>
);

interface BodyProps {
  row: ChecklistRow;
  /** Picked question id -> its own note, and the same ids as a set. */
  picked: Readonly<Record<string, string>>;
  pickedSet: ReadonlySet<string>;
  onTogglePicked: (itemId: string) => void;
  onItemNote: (itemId: string, note: string) => void;
  /** The sheet already shows the title in its own header. */
  hideTitle?: boolean;
}

// Everything a reviewer reads about one run: who did it and when, three score tiles, then the
// questions with the failing ones first.
export const ReviewPaneBody = memo(function ReviewPaneBody({ row, picked, pickedSet, onTogglePicked, onItemNote, hideTitle = false }: BodyProps) {
  const { instance, risk } = row;
  const photos = risk.photosNeeded > 0 ? `${risk.photosHave}/${risk.photosNeeded}` : 'None needed';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          {!hideTitle && <h2 className="text-base font-display font-bold text-text leading-snug">{instance.title}</h2>}
          <Link
            to={`/checklists/${instance.id}`}
            className="inline-flex items-center gap-1 shrink-0 min-h-11 sm:min-h-8 px-2 -mr-2 rounded-md text-xs font-display font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Open full page <ExternalLink size={12} aria-hidden />
          </Link>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-display text-text-muted">
          {row.storeName && <span>{row.storeName}</span>}
          <span>{formatDate(instance.periodStart)} – {formatDate(instance.periodEnd)}</span>
          {instance.submittedAt && (
            <span>
              {instance.submittedByName ? `Submitted by ${instance.submittedByName}, ` : 'Submitted '}
              {formatDateTime(instance.submittedAt)}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {risk.criticalFailed > 0 && (
            <IconChip icon={Flag} tone="bg-danger" label="Critical failed" className="border-danger/40 bg-danger/10" />
          )}
          {risk.sentBackTimes > 0 && (
            <IconChip icon={CornerUpLeft} tone="bg-danger" label={`Sent back ${risk.sentBackTimes}x`} title="Total times questions in this run were sent back" />
          )}
          {risk.clean && <IconChip icon={CheckCircle2} tone="bg-success" label="Clean" />}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Completion" value={`${risk.completion}%`} />
        <Tile
          label="Compliance"
          value={risk.compliance === null ? 'Not scored' : `${risk.compliance}%`}
          tone={risk.compliance === null ? 'text-text-muted text-sm leading-7' : complianceToneClass(risk.compliance)}
        />
        <Tile
          label="Photos"
          value={photos}
          tone={risk.photosNeeded === 0 ? 'text-text-muted text-sm leading-7' : risk.photosHave < risk.photosNeeded ? 'text-danger' : 'text-success'}
        />
      </div>

      <InstanceReviewPanel
        items={instance.items}
        selected={pickedSet}
        onToggle={onTogglePicked}
        notes={picked}
        onNoteChange={onItemNote}
        lastSendBackNote={instance.verificationNote}
        showScores={false}
      />
    </div>
  );
});

interface FooterProps {
  row: ChecklistRow;
  draft: ReviewDraft;
  onApprove: (row: ChecklistRow) => void;
  onSendBack: (row: ChecklistRow, payload: SendBackPayload) => void;
}

// The action bar: Send back / Approve, or the send-back form once the reviewer starts one.
export const ReviewPaneFooter = memo(function ReviewPaneFooter({ row, draft, onApprove, onSendBack }: FooterProps) {
  const { pickedIds, picked, note, sending, setNote, setSending } = draft;
  const items = row.instance.items;

  const composed = useMemo(() => {
    const labelById = new Map(items.map((i) => [i.id, i.label]));
    return composeSendBackNote(note, pickedIds.map((id) => ({ label: labelById.get(id) ?? 'Question', note: picked[id] ?? '' })));
  }, [items, note, pickedIds, picked]);

  const noted = pickedIds.filter((id) => (picked[id] ?? '').trim().length > 0).length;
  const tooLong = composed.length > SEND_BACK_NOTE_MAX;
  const count = pickedIds.length;

  if (sending) {
    return (
      <div className="flex flex-col gap-3 w-full">
        <p className="text-sm font-display font-semibold text-text">
          {count > 0 ? `Send back ${count} ${count === 1 ? 'question' : 'questions'}` : 'Send the whole checklist back'}
        </p>
        <SendBackForm
          autoFocus
          quickReasons
          note={note}
          onNoteChange={setNote}
          onCancel={() => setSending(false)}
          onSubmit={() => onSendBack(row, { itemIds: pickedIds, note: composed })}
          canSubmit={composed.length > 0 && !tooLong}
          isSending={false}
          busy={false}
          submitLabel={count > 0 ? `Send back ${count}` : 'Send back all'}
          placeholder={count > 0 ? 'What needs fixing on these questions?' : 'What needs fixing before this can be approved?'}
          maxLength={SEND_BACK_NOTE_MAX}
          helper={
            tooLong
              ? `The note is ${composed.length - SEND_BACK_NOTE_MAX} characters too long. Shorten a note.`
              : noted > 0
                ? `${noted} ${noted === 1 ? 'question note' : 'question notes'} will be added below your note.`
                : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
      <p className="text-xs font-display text-text-secondary">
        {count > 0
          ? `${count} ${count === 1 ? 'question' : 'questions'} picked. Send them back, or untick them to approve.`
          : 'Approve it, or tick the questions that were not done properly.'}
      </p>
      <ReviewActions
        stretch
        showKeys
        busy={false}
        approving={false}
        pickedCount={count}
        onSendBack={() => setSending(true)}
        onApprove={() => onApprove(row)}
      />
    </div>
  );
});

interface PaneProps extends FooterProps {
  className?: string;
}

/** The desktop review pane: scrolls on its own, action bar pinned to the bottom. */
export const ReviewPane = ({ row, draft, onApprove, onSendBack, className }: PaneProps) => (
  <section aria-label={`Review ${row.instance.title}`} className={cn(PANEL_CLASS, 'flex flex-col min-h-0 lg:max-h-[calc(100dvh-7rem)]', className)}>
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-5">
      <ReviewPaneBody row={row} picked={draft.picked} pickedSet={draft.pickedSet} onTogglePicked={draft.togglePicked} onItemNote={draft.setItemNote} />
    </div>
    <div className="shrink-0 flex border-t border-border/60 p-3.5 sm:p-4">
      <ReviewPaneFooter row={row} draft={draft} onApprove={onApprove} onSendBack={onSendBack} />
    </div>
  </section>
);

interface SheetProps extends FooterProps {
  onClose: () => void;
}

/** The same review as a full-screen sheet on a phone, buttons fixed at the bottom. */
export const ReviewSheet = ({ row, draft, onApprove, onSendBack, onClose }: Omit<SheetProps, 'row'> & { row: ChecklistRow | null }) => (
  <Modal
    open={!!row}
    onClose={onClose}
    title={row?.instance.title ?? 'Review'}
    size="2xl"
    contentClassName="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"
    footer={row ? <ReviewPaneFooter row={row} draft={draft} onApprove={onApprove} onSendBack={onSendBack} /> : undefined}
  >
    {row && <ReviewPaneBody key={row.id} row={row} picked={draft.picked} pickedSet={draft.pickedSet} onTogglePicked={draft.togglePicked} onItemNote={draft.setItemNote} hideTitle />}
  </Modal>
);
