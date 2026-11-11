import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Flag, CornerUpLeft, CheckCircle2, Ticket, ChevronDown, Layers, ArrowDownToLine } from 'lucide-react';
import { FigureCard, type FigureTone } from '../dashboard/FigureCard';
import { itemFlags } from '../checklist/instance/reviewFlags';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';
import { IconChip, Modal, NoticeBanner, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { formatPeriodSpan, formatDateTime } from '../checklist/checklistDisplay';
import { DetailItemRow } from '../checklist/instance/ChecklistDetailItemRow';
import { PhotoReviewContext } from '../checklist/instance/photoReviewContext';
import { canWaiveRun } from '../checklist/instance/canWaive';
import { ComplianceMeter } from './ComplianceMeter';
import { PersonContext } from './PersonContext';
import { ReviewActions } from '../checklist/instance/ReviewActions';
import { approveLabelFor } from '../checklist/approvalStage';
import { CorrectionDialog } from './CorrectionDialog';
import { ReviewScoreStrip } from './ReviewScoreStrip';
import { projectReviewScores } from './reviewScore';
import { pickDefaults, runCorrectionItems, type CorrectionItem, type PickDefaults, type SendBackPayload } from './correctionItems';
import type { ReviewDraft } from './useReviewDraft';
import type { ChecklistRow } from './verificationModel';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

export type { SendBackPayload } from './correctionItems';

const rateTone = (rate: number): FigureTone => (rate >= GOOD_FROM ? 'good' : rate >= FAIR_FROM ? 'fair' : 'bad');

const NO_SECTION = '__none__';

const hasIssue = (item: ChecklistInstanceItem) => {
  const flags = itemFlags(item);
  return flags.needsLook || flags.criticalFailed || (!item.isDone && !item.isNotApplicable);
};

interface Section {
  key: string;
  name: string;
  items: ChecklistInstanceItem[];
  issues: number;
}

const groupSections = (items: ChecklistInstanceItem[]): Section[] => {
  const sections: Section[] = [];
  for (const item of items) {
    const key = item.section ?? NO_SECTION;
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.items.push(item);
    else sections.push({ key, name: item.section ?? 'Other questions', items: [item], issues: 0 });
  }
  for (const section of sections) section.issues = section.items.filter(hasIssue).length;
  return sections;
};

const useReviewProgress = (row: ChecklistRow, draft: ReviewDraft) => {
  const items = row.instance.items;
  const scores = useMemo(() => projectReviewScores(items, draft.pickedSet), [items, draft.pickedSet]);
  const reviewed = useMemo(
    () => items.filter((i) => draft.pickedSet.has(i.id) || draft.looksRightSet.has(i.id)).length,
    [items, draft.pickedSet, draft.looksRightSet],
  );
  return { scores, reviewed, total: items.length };
};

interface BodyProps {
  row: ChecklistRow;
  picked: Readonly<Record<string, string>>;
  pickedSet: ReadonlySet<string>;
  photoOnlySet: ReadonlySet<string>;
  looksRightSet: ReadonlySet<string>;
  onTogglePicked: (itemId: string) => void;
  onPickWith: (itemId: string, defaults: PickDefaults) => void;
  onToggleLooksRight: (itemId: string) => void;
  onTogglePhotoOnly: (itemId: string) => void;
  onItemNote: (itemId: string, note: string) => void;
  hideTitle?: boolean;
}

const ReviewPaneBody = memo(function ReviewPaneBody({ row, picked, pickedSet, photoOnlySet, looksRightSet, onTogglePicked, onPickWith, onToggleLooksRight, onTogglePhotoOnly, onItemNote, hideTitle = false }: BodyProps) {
  const { instance, risk } = row;
  const { user } = useAuth();
  const canWaive = canWaiveRun(user, instance);
  const canRaiseTicket = !instance.assigneeIds.includes(user?.id ?? '');
  const items = useMemo(() => [...instance.items].sort((x, y) => x.order - y.order), [instance.items]);
  const correctionById = useMemo(() => new Map<string, CorrectionItem>(runCorrectionItems(items).map((c) => [c.id, c])), [items]);
  const hasSections = items.some((i) => i.section);
  const sections = useMemo(() => (hasSections ? groupSections(items) : []), [hasSections, items]);
  const sectionOf = useMemo(() => new Map(sections.flatMap((s) => s.items.map((i) => [i.id, s.key] as const))), [sections]);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set(sections.filter((s) => s.issues > 0).map((s) => s.key)));
  const criticalItems = useMemo(() => items.filter((i) => itemFlags(i).criticalFailed), [items]);
  const photos = risk.photosNeeded > 0 ? `${risk.photosHave}/${risk.photosNeeded}` : 'None';

  const toggleSection = (key: string) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const goTo = useCallback((id: string) => {
    const key = sectionOf.get(id);
    if (key) setOpenSections((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
    requestAnimationFrame(() => {
      const el = document.getElementById(`item-${id}`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    });
  }, [sectionOf]);

  const jumpTo = (id: string | undefined) => (id ? () => goTo(id) : undefined);
  const firstUnanswered = items.find((i) => !i.isDone && !i.isNotApplicable)?.id;
  const firstNoPhoto = items.find((i) => itemFlags(i).missingPhotos)?.id;

  const togglePicked = useCallback((itemId: string) => {
    if (pickedSet.has(itemId)) {
      onTogglePicked(itemId);
      return;
    }
    const correction = correctionById.get(itemId);
    if (correction) onPickWith(itemId, pickDefaults(correction));
    else onTogglePicked(itemId);
  }, [pickedSet, correctionById, onTogglePicked, onPickWith]);

  const renderRow = (item: ChecklistInstanceItem, idx: number) => (
    <DetailItemRow
      key={item.id}
      item={item}
      instanceId={instance.id}
      canWork={false}
      isLocked
      currentUserId={user?.id}
      overdue={false}
      showHeader={false}
      inSectionBox={hasSections}
      isFirst={idx === 0}
      selecting
      picked={pickedSet.has(item.id)}
      onTogglePicked={togglePicked}
      looksRight={looksRightSet.has(item.id)}
      onToggleLooksRight={onToggleLooksRight}
      photoOnly={photoOnlySet.has(item.id)}
      onTogglePhotoOnly={onTogglePhotoOnly}
      canWaive={canWaive}
      canRaiseTicket={canRaiseTicket}
      note={picked[item.id] ?? ''}
      onNoteChange={onItemNote}
    />
  );

  const fullPageLink = (
    <Link
      to={`/checklists/${instance.id}`}
      className="inline-flex items-center justify-center gap-1 shrink-0 min-h-11 min-w-11 sm:min-h-8 sm:min-w-0 sm:pointer-coarse:min-h-11 px-2 rounded-md t-meta font-display font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span className="sr-only sm:not-sr-only">Open full page</span> <ExternalLink size={14} aria-hidden />
    </Link>
  );

  return (
    <PhotoReviewContext.Provider value={instance.verificationStatus === 'PENDING_APPROVAL' ? { kind: 'run', ownerId: instance.id } : null}>
      <div className="flex flex-col gap-4">
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

        {criticalItems.length > 0 && (
          <NoticeBanner tone="danger" icon={Flag}>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-text">
                {criticalItems.length === 1 ? '1 critical question failed' : `${criticalItems.length} critical questions failed`}
              </p>
              <ul className="flex flex-col gap-1.5">
                {criticalItems.map((item) => {
                  const isPicked = pickedSet.has(item.id);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 line-clamp-2 leading-snug text-text-secondary">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => goTo(item.id)}
                          className="inline-flex min-h-11 sm:min-h-8 sm:pointer-coarse:min-h-11 items-center gap-1 rounded-full border border-border bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 ease-out hover:border-border-hover hover:text-text active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40"
                        >
                          <ArrowDownToLine size={13} aria-hidden />
                          Go to
                        </button>
                        <button
                          type="button"
                          aria-pressed={isPicked}
                          onClick={() => togglePicked(item.id)}
                          className={cn(
                            'inline-flex min-h-11 sm:min-h-8 sm:pointer-coarse:min-h-11 items-center gap-1 rounded-full border px-3 t-meta font-display font-semibold outline-none transition-colors duration-150 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
                            isPicked ? 'border-danger/40 bg-danger/10 text-danger' : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
                          )}
                        >
                          <CornerUpLeft size={13} aria-hidden />
                          {isPicked ? 'Sending back' : 'Send back'}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </NoticeBanner>
        )}

        <div className="grid grid-cols-2 gap-2">
          <FigureCard
            label="Completion"
            help="Share of the questions that were answered."
            value={risk.completion}
            format={(n) => `${Math.round(n)}%`}
            tone={rateTone(risk.completion)}
            bar={risk.completion}
            loading={false}
            compact
            onClick={jumpTo(firstUnanswered)}
          />
          <FigureCard
            label="Photos"
            help={risk.photosNeeded === 0 ? 'No photos are needed for this checklist.' : `${risk.photosHave} of ${risk.photosNeeded} required photo questions have their photos.`}
            value={risk.photosNeeded === 0 ? null : risk.photosHave}
            text={photos}
            tone={risk.photosNeeded === 0 ? 'plain' : risk.photosHave < risk.photosNeeded ? 'bad' : 'good'}
            bar={risk.photosNeeded === 0 ? null : (risk.photosHave / risk.photosNeeded) * 100}
            loading={false}
            compact
            onClick={jumpTo(firstNoPhoto)}
          />
        </div>

        <ComplianceMeter risk={risk} className="rounded-lg border border-border/60 bg-surface-hover/30 p-3" />

        <PersonContext items={items} />

        <p className="t-meta font-display text-text-muted leading-relaxed">
          Mark each question Looks right or Send back. Picked questions go back for correction together.
        </p>

        {hasSections ? (
          <div className="flex flex-col gap-3">
            {sections.map((section) => {
              const open = openSections.has(section.key);
              const panelId = `review-section-${instance.id}-${section.key}`;
              return (
                <section key={section.key} aria-label={section.name} className="flex flex-col gap-3">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggleSection(section.key)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-surface-hover/30 px-3 text-left outline-none transition-colors duration-150 ease-out hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <Layers size={14} className="shrink-0 text-text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 t-card font-display font-bold text-text line-clamp-2 leading-snug">{section.name}</span>
                    <span className={cn('shrink-0 t-meta font-display font-semibold tabular-nums', section.issues > 0 ? 'text-danger' : 'text-success')}>
                      {section.issues > 0 ? `${section.issues} ${section.issues === 1 ? 'issue' : 'issues'}` : 'No issues'}
                      <span className="text-text-muted"> · {section.items.length} {section.items.length === 1 ? 'question' : 'questions'}</span>
                    </span>
                    <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-text-muted transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-180')} />
                  </button>
                  <div id={panelId} hidden={!open} className="flex flex-col gap-3">
                    {section.items.map((item, idx) => renderRow(item, idx))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, idx) => renderRow(item, idx))}
          </div>
        )}
      </div>
    </PhotoReviewContext.Provider>
  );
});

interface FooterProps {
  row: ChecklistRow;
  draft: ReviewDraft;
  onApprove: (row: ChecklistRow) => void;
  onSendBack: (row: ChecklistRow, payload: SendBackPayload) => void;
}

const ReviewPaneFooter = memo(function ReviewPaneFooter({ row, draft, onApprove, onSendBack, showScore = false }: FooterProps & { showScore?: boolean }) {
  const count = draft.pickedIds.length;
  const items = useMemo(() => runCorrectionItems(row.instance.items), [row.instance.items]);
  const progress = useReviewProgress(row, draft);
  const { user: reviewer } = useAuth();

  return (
    <div className="flex w-full flex-col gap-2">
      {showScore && <ReviewScoreStrip scores={progress.scores} reviewed={progress.reviewed} total={progress.total} compact />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 w-full">
        <p className={cn('t-meta font-display text-text-secondary', count === 0 && 'hidden sm:block')}>
          {count > 0 ? (
            <>
              <span className="sm:hidden">{count} picked</span>
              <span className="hidden sm:inline">{`${count} ${count === 1 ? 'question' : 'questions'} picked. Send them for correction, or untick them to approve.`}</span>
            </>
          ) : 'Approve it, or send it for correction.'}
        </p>
        <ReviewActions
          stretch
          showKeys
          busy={false}
          approving={false}
          pickedCount={count}
          approveLabel={approveLabelFor(reviewer?.role, row.instance)}
          onSendBack={() => draft.setSending(true)}
          onApprove={() => onApprove(row)}
        />
      </div>
      <CorrectionDialog items={items} assigneeNames={row.assigneeNames} draft={draft} onSend={(payload) => onSendBack(row, payload)} />
    </div>
  );
});

const PaneScore = ({ row, draft }: { row: ChecklistRow; draft: ReviewDraft }) => {
  const progress = useReviewProgress(row, draft);
  return <ReviewScoreStrip scores={progress.scores} reviewed={progress.reviewed} total={progress.total} />;
};

interface PaneProps extends FooterProps {
  className?: string;
}

const bodyProps = (row: ChecklistRow, draft: ReviewDraft) => ({
  row,
  picked: draft.picked,
  pickedSet: draft.pickedSet,
  photoOnlySet: draft.photoOnlySet,
  looksRightSet: draft.looksRightSet,
  onTogglePicked: draft.togglePicked,
  onPickWith: draft.pickWith,
  onToggleLooksRight: draft.toggleLooksRight,
  onTogglePhotoOnly: draft.togglePhotoOnly,
  onItemNote: draft.setItemNote,
});

export const ReviewPane = ({ row, draft, onApprove, onSendBack, className }: PaneProps) => (
  <section aria-label={`Review ${row.instance.title}`} className={cn(PANEL_CLASS, 'flex flex-col min-h-0 lg:max-h-[calc(100dvh-7rem)]', className)}>
    <div className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
      <PaneScore row={row} draft={draft} />
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-5">
      <ReviewPaneBody {...bodyProps(row, draft)} />
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
    footer={row ? <ReviewPaneFooter row={row} draft={draft} onApprove={onApprove} onSendBack={onSendBack} showScore /> : undefined}
  >
    {row && <ReviewPaneBody key={row.id} {...bodyProps(row, draft)} hideTitle />}
  </Modal>
);
