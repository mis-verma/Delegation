import { memo, type ReactNode } from 'react';
import { Ban, Camera, Check, ChevronDown, ImageUp, MapPin, MessageSquare, Pencil, QrCode, Star, Video, X } from 'lucide-react';
import { Modal, ThumbImage } from '../../../../components';
import { UPLOADS_BASE } from '../../../../lib/uploadsBase';
import { cn } from '@/lib/utils';
import { hasInlineNa } from '../../instance/fill/inlineNa';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

const FIELD = 'flex min-h-11 items-center rounded-xl border border-border bg-surface px-3 t-meta font-display text-text-muted';
const ANSWER = 'flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border t-card font-display font-semibold';
const STAFF_CHIP = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface-hover/60 px-2.5 t-meta font-display font-semibold text-text-muted';

const ACTION_WORD: Record<string, string> = {
  REQUIRE_PHOTO: 'photo',
  ASK_REASON: 'reason',
  CREATE_ISSUE: 'ticket',
  NOTIFY_AREA_MANAGER: 'alert',
};

const followUpLine = (answer: string, actions: string[]) =>
  actions.length === 0 ? null : (
    <li key={answer} className="flex flex-wrap items-center gap-1.5 t-meta font-display text-text-secondary">
      <span className="font-semibold text-text">If {answer}:</span>
      {actions.map((a) => (
        <span key={a} className="rounded-full bg-warning/12 px-2 py-0.5 font-semibold text-warning">{ACTION_WORD[a] ?? a}</span>
      ))}
    </li>
  );

const mediaNoun = (draft: ItemDraft) => (draft.itemType === 'VIDEO_UPLOAD' ? 'video' : 'photo');

const PhotoButtons = ({ draft }: { draft: ItemDraft }) => {
  const isVideo = draft.itemType === 'VIDEO_UPLOAD';
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary-500/50 px-3 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">
        {isVideo ? <Video size={14} aria-hidden /> : <Camera size={14} aria-hidden />}
        {isVideo ? 'Record video' : 'Take photo'}
      </span>
      {!draft.requiresLivePhoto && (
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary">
          <ImageUp size={14} aria-hidden />
          {isVideo ? 'Choose video' : 'Gallery'}
        </span>
      )}
    </div>
  );
};

/** The photo counter staff see above the capture buttons, worded exactly like the fill screen. */
const PhotoLine = ({ draft }: { draft: ItemDraft }) => {
  const need = Number(draft.requiredImageCount) || 0;
  if (need <= 0) return null;
  const max = Number(draft.maxImageCount) || 0;
  const noun = mediaNoun(draft);
  return (
    <div className="flex flex-col gap-2">
      <span className="t-meta font-display font-semibold text-text-muted">
        0/{need} {noun}{need === 1 ? '' : 's'}{draft.requiresLivePhoto ? ' (live only)' : ''}{max > 0 ? ` · max ${max}` : ''}
      </span>
      <PhotoButtons draft={draft} />
    </div>
  );
};

const ExamplePhoto = ({ url }: { url: string }) => (
  <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-hover/30 p-2.5">
    <ThumbImage src={`${UPLOADS_BASE}${url}`} alt="Example photo" width={160} className="size-14 shrink-0 rounded-lg border border-border object-cover" />
    <p className="min-w-0 t-meta font-display text-text-secondary">
      <span className="block font-semibold text-text">Example photo</span>
      What a good photo of this looks like.
    </p>
  </div>
);

/** Mirrors the remark and not-applicable row at the bottom of every question on the fill screen. */
const StaffFooter = ({ draft }: { draft: ItemDraft }) => {
  const showNa = draft.allowNotApplicable && !hasInlineNa(draft);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
      <span className={STAFF_CHIP}><MessageSquare size={12} aria-hidden />Add remark</span>
      {showNa && <span className={STAFF_CHIP}><Ban size={12} aria-hidden />Not applicable</span>}
    </div>
  );
};

const numberHint = (draft: ItemDraft) => {
  const unit = draft.numberEntryUnit.trim();
  const min = draft.numberEntryMin.trim();
  const max = draft.numberEntryMax.trim();
  const base = unit ? `Enter amount in ${unit}` : 'Enter a number';
  if (min && max) return `${base} (${min} to ${max})`;
  if (min) return `${base} (${min} or more)`;
  if (max) return `${base} (up to ${max})`;
  return base;
};

const Body = ({ draft }: { draft: ItemDraft }) => {
  switch (draft.itemType) {
    case 'YES_NO':
    case 'PASS_FAIL': {
      const [yes, no] = draft.itemType === 'YES_NO' ? ['Yes', 'No'] : ['Pass', 'Fail'];
      const hasRules = draft.yesActions.length + draft.noActions.length > 0;
      const needsPhoto = draft.yesActions.includes('REQUIRE_PHOTO') || draft.noActions.includes('REQUIRE_PHOTO');
      return (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <span className={cn(ANSWER, 'border-success/50 bg-success/10 text-success')}><Check size={15} strokeWidth={3} aria-hidden />{yes}</span>
            <span className={cn(ANSWER, 'border-danger/50 bg-danger/10 text-danger')}><X size={15} strokeWidth={3} aria-hidden />{no}</span>
            {draft.allowNotApplicable && (
              <span className={cn(ANSWER, 'max-w-16 border-border/60 bg-surface-hover/40 text-text-secondary')}>N/A</span>
            )}
          </div>
          {hasRules && (
            <ul className="flex flex-col gap-1.5 rounded-xl bg-surface-hover/60 p-2.5" aria-label="Follow-ups after the answer">
              {followUpLine(yes, draft.yesActions)}
              {followUpLine(no, draft.noActions)}
            </ul>
          )}
          {needsPhoto && <PhotoButtons draft={draft} />}
        </div>
      );
    }
    case 'MULTIPLE_CHOICE':
      return (
        <div className="flex flex-wrap gap-2">
          {(draft.options.length ? draft.options : ['Option 1', 'Option 2']).map((o) => (
            <span key={o} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 t-meta font-display font-medium text-text-secondary">{o}</span>
          ))}
        </div>
      );
    case 'DROPDOWN':
      return (
        <span className={cn(FIELD, 'justify-between gap-2')}>
          Select an option
          <ChevronDown size={14} className="shrink-0 text-text-light" aria-hidden />
        </span>
      );
    case 'RATING':
      return (
        <div className="flex">
          {Array.from({ length: Number(draft.ratingScale) || 5 }, (_, i) => <Star key={i} size={26} className="text-border" strokeWidth={1.5} aria-hidden />)}
        </div>
      );
    case 'NUMBER_ENTRY':
    case 'CASH_TALLY':
      return <span className={FIELD}>{numberHint(draft)}</span>;
    case 'TEXT_BOX':
      return <span className={cn(FIELD, 'min-h-20 items-start py-3')}>Type the answer</span>;
    case 'DATE_TIME':
      return <span className={FIELD}>Pick a date and time</span>;
    case 'GPS':
      return <span className={cn(FIELD, 'gap-2')}><MapPin size={14} aria-hidden />Share your location</span>;
    case 'QR_SCAN':
      return <span className={cn(FIELD, 'gap-2')}><QrCode size={14} aria-hidden />Scan the code</span>;
    case 'SIGNATURE':
    case 'DUAL_SIGNATURE':
      return <span className={cn(FIELD, 'min-h-24 justify-center gap-2')}><Pencil size={14} aria-hidden />{draft.itemType === 'DUAL_SIGNATURE' ? 'Two people sign here' : 'Sign here'}</span>;
    case 'AUDIT':
      return (
        <span className={cn(FIELD, 'flex-col items-start gap-1 py-2')}>
          Tick each person and their uniform items
          {draft.criticalAccessories.length > 0 && (
            <span className="t-meta font-display font-semibold text-danger">Critical: {draft.criticalAccessories.join(', ')}</span>
          )}
          {Object.keys(draft.accessoryPoints).length > 0 && (
            <span className="t-meta font-display text-text-muted">
              Points: {Object.entries(draft.accessoryPoints).map(([name, value]) => `${name} ${value}`).join(', ')}
            </span>
          )}
          {draft.auditPhotoOnlyOnMiss && <span className="t-meta font-display text-text-muted">Photo only when something is missing</span>}
        </span>
      );
    default:
      return (
        <div className="flex flex-col gap-3">
          <span className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
            <span className="flex size-6 items-center justify-center rounded-full border-2 border-text-light text-transparent"><Check size={13} /></span>
            <span className="t-card font-display font-medium text-text">Tap to mark done</span>
          </span>
        </div>
      );
  }
};

/** YES_NO and PASS_FAIL draw their own photo buttons inside the answer flow. */
const handlesPhotosInBody = (draft: ItemDraft) => draft.itemType === 'YES_NO' || draft.itemType === 'PASS_FAIL';

const QuestionPreviewCardImpl = ({ draft, index, highlighted = false }: { draft: ItemDraft; index?: number; highlighted?: boolean }) => {
  const need = Number(draft.requiredImageCount) || 0;
  const markComplete = need > 0 && !handlesPhotosInBody(draft) && draft.itemType !== 'AUDIT';
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border bg-surface p-3.5 transition-colors duration-200',
        highlighted ? 'border-primary-500/70 ring-2 ring-primary-500/20' : 'border-border/60',
      )}
    >
      <div className="flex items-start gap-2">
        {index !== undefined && (
          <span className="mt-0.5 w-5 shrink-0 t-meta font-display font-bold tabular-nums text-text-light">{index + 1}</span>
        )}
        <p className="min-w-0 flex-1 t-card font-display font-semibold leading-snug text-text break-words">
          {draft.label.trim() || <span className="font-medium italic text-text-light">Your question shows here</span>}
        </p>
      </div>
      {draft.isCritical && <span className="w-fit rounded-full bg-danger/10 px-2 py-0.5 t-meta font-display font-bold text-danger">Critical</span>}
      {draft.referenceImageUrl && <ExamplePhoto url={draft.referenceImageUrl} />}
      <Body draft={draft} />
      {!handlesPhotosInBody(draft) && <PhotoLine draft={draft} />}
      {markComplete && (
        <span className="inline-flex min-h-11 w-fit items-center gap-1.5 self-end rounded-lg bg-primary-700 px-3.5 t-meta font-display font-semibold text-white dark:bg-primary-500">
          <Check size={14} strokeWidth={2.75} aria-hidden />
          Mark complete
        </span>
      )}
      <StaffFooter draft={draft} />
    </div>
  );
};

/** Memoized so typing in one question doesn't redraw every other card in the live preview. */
export const QuestionPreviewCard = memo(QuestionPreviewCardImpl);

export const PhoneFrame = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mx-auto flex w-full max-w-72 flex-col gap-3 rounded-[1.75rem] border-4 border-border bg-surface-hover/40 p-3', className)}>
    <div className="mx-auto h-1.5 w-16 shrink-0 rounded-full bg-border" aria-hidden="true" />
    {children}
  </div>
);

export const QuestionPhonePreview = ({ draft, open, onClose }: { draft: ItemDraft; open: boolean; onClose: () => void }) => (
  <Modal open={open} onClose={onClose} title="How staff see it" description="A preview of this question on a phone." size="sm">
    <PhoneFrame>
      <QuestionPreviewCard draft={draft} />
    </PhoneFrame>
  </Modal>
);
