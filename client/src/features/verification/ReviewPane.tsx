import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Flag, CornerUpLeft, CheckCircle2, Ticket } from 'lucide-react';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
import { IconChip, Modal, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { formatPeriodSpan, formatDateTime } from '../checklist/checklistDisplay';
import { DetailItemRow } from '../checklist/instance/ChecklistDetailItemRow';
import { ComplianceMeter } from './ComplianceMeter';
import { PersonContext } from './PersonContext';
import { ReviewActions, SendBackForm } from '../checklist/instance/ReviewActions';
import { SEND_BACK_NOTE_MAX, composeSendBackNote } from '../checklist/instance/sendBackNote';
import type { ReviewDraft } from './useReviewDraft';
import type { ChecklistRow } from './verificationModel';

export interface SendBackPayload {
  itemIds: string[];
  note: string;
  fixByHours?: number | null;
}

const rateTone = (rate: number): FigureTone => (rate >= GOOD_FROM ? 'good' : rate >= FAIR_FROM ? 'fair' : 'bad');

interface BodyProps {
  row: ChecklistRow;
  picked: Readonly<Record<string, string>>;
  pickedSet: ReadonlySet<string>;
  onTogglePicked: (itemId: string) => void;
  onItemNote: (itemId: string, note: string) => void;
  hideTitle?: boolean;
}

const ReviewPaneBody = memo(function ReviewPaneBody({ row, picked, pickedSet, onTogglePicked, onItemNote, hideTitle = false }: BodyProps) {
  const { instance, risk } = row;
  const { user } = useAuth();
  const canWaive = !!user && ['ADMIN', 'PC', 'MANAGER', 'SENIOR'].includes(user.role) && !instance.assigneeIds.includes(user.id);
  const canRaiseTicket = !instance.assigneeIds.includes(user?.id ?? '');
  const items = useMemo(() => [...instance.items].sort((x, y) => x.order - y.order), [instance.items]);
  const hasSections = items.some((i) => i.section);
  const photos = risk.photosNeeded > 0 ? `${risk.photosHave}/${risk.photosNeeded}` : 'None';

  const fullPageLink = (
    <Link
      to={`/checklists/${instance.id}`}
      className="inline-flex items-center justify-center gap-1 shrink-0 min-h-11 min-w-11 sm:min-h-8 sm:min-w-0 px-2 -mr-2 rounded-md t-meta font-display font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span className="sr-only sm:not-sr-only">Open full page</span> <ExternalLink size={14} aria-hidden />
    </Link>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        {!hideTitle && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="t-section font-display font-bold text-text leading-snug">{instance.title}</h2>
            {fullPageLink}
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display text-text-muted">
            {row.storeName && <span>{row.storeName}</span>}
            <span>{formatPeriodSpan(instance)}</span>
            {instance.submittedAt && (
              <span>
                {instance.submittedByName ? `Submitted by ${instance.submittedByName}, ` : 'Submitted '}
                {formatDateTime(instance.submittedAt)}
              </span>
            )}
          </p>
          {hideTitle && fullPageLink}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {risk.criticalFailed > 0 && (
            <IconChip icon={Flag} tone="bg-danger" label="Critical question failed" className="border-danger/40 bg-danger/10" />
          )}
          {risk.sentBackTimes > 0 && (
            <IconChip
              icon={CornerUpLeft}
              tone="bg-danger"
              label={risk.sentBackTimes === 1 ? 'Sent back once' : `Sent back ${risk.sentBackTimes} times`}
              title="Total times questions in this run were sent back"
            />
          )}
          {risk.ticketsRaised > 0 && (
            <IconChip icon={Ticket} tone="bg-danger" label={risk.ticketsRaised === 1 ? '1 ticket raised' : `${risk.ticketsRaised} tickets raised`} />
          )}
          {risk.clean && <IconChip icon={CheckCircle2} tone="bg-success" label="No issues" />}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <FigureCard
          label="Completion"
          help="Share of the questions that were answered."
          value={risk.completion}
          format={(n) => `${Math.round(n)}%`}
          tone={rateTone(risk.completion)}
          bar={risk.completion}
          loading={false}
        />
        <FigureCard
          label="Compliance"
          short="Right"
          help="Share of the scored answers that match the accepted answer."
          value={risk.compliance ?? 100}
          format={(n) => `${Math.round(n)}%`}
          tone={rateTone(risk.compliance ?? 100)}
          bar={risk.compliance ?? 100}
          loading={false}
        />
        <FigureCard
          label="Photos"
          help={risk.photosNeeded === 0 ? 'No photos are needed for this checklist.' : `${risk.photosHave} of ${risk.photosNeeded} required photo questions have their photos.`}
          value={risk.photosNeeded === 0 ? null : risk.photosHave}
          text={photos}
          tone={risk.photosNeeded === 0 ? 'plain' : risk.photosHave < risk.photosNeeded ? 'bad' : 'good'}
          bar={risk.photosNeeded === 0 ? null : (risk.photosHave / risk.photosNeeded) * 100}
          loading={false}
        />
      </div>

      <ComplianceMeter risk={risk} className="rounded-lg border border-border/60 bg-surface-hover/30 p-3" />

      <PersonContext items={items} />

      <p className="t-meta font-display text-text-muted leading-relaxed">
        Same view as the filled checklist. Tap Send back under a question to return only that one.
      </p>
      <div className="flex flex-col gap-3">
        {items.map((item, idx) => (
          <DetailItemRow
            key={item.id}
            item={item}
            instanceId={instance.id}
            canWork={false}
            isLocked
            currentUserId={user?.id}
            overdue={false}
            showHeader={hasSections && (idx === 0 || items[idx - 1].section !== item.section)}
            isFirst={idx === 0}
            selecting
            picked={pickedSet.has(item.id)}
            onTogglePicked={onTogglePicked}
            canWaive={canWaive}
            canRaiseTicket={canRaiseTicket}
            note={picked[item.id] ?? ''}
            onNoteChange={onItemNote}
          />
        ))}
      </div>
    </div>
  );
});

interface FooterProps {
  row: ChecklistRow;
  draft: ReviewDraft;
  onApprove: (row: ChecklistRow) => void;
  onSendBack: (row: ChecklistRow, payload: SendBackPayload) => void;
}

const ReviewPaneFooter = memo(function ReviewPaneFooter({ row, draft, onApprove, onSendBack }: FooterProps) {
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
          onSubmit={() => onSendBack(row, { itemIds: pickedIds, note: composed, fixByHours: draft.fixByHours })}
          fixBy={{ value: draft.fixByHours, onChange: draft.setFixBy }}
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 w-full">
      <p className={cn('t-meta font-display text-text-secondary', count === 0 && 'hidden sm:block')}>
        {count > 0 ? (
          <>
            <span className="sm:hidden">{count} picked</span>
            <span className="hidden sm:inline">{`${count} ${count === 1 ? 'question' : 'questions'} picked. Send them back, or untick them to approve.`}</span>
          </>
        ) : 'Approve it, or tick the questions that were not done properly.'}
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
