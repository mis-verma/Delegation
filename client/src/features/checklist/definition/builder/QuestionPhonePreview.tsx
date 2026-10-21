import { Camera, Check, ImageUp, MapPin, Pencil, QrCode, Star, Video } from 'lucide-react';
import { Modal } from '../../../../components';
import { cn } from '@/lib/utils';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';

const FIELD = 'flex min-h-11 items-center rounded-xl border border-border bg-surface px-3 t-meta font-display text-text-muted';
const ANSWER = 'flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border t-card font-display font-semibold text-text';

const PhotoButtons = ({ draft, noun = 'photo' }: { draft: ItemDraft; noun?: 'photo' | 'video' }) => (
  <div className="flex flex-wrap gap-2">
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary-500/50 px-3 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">
      {noun === 'video' ? <Video size={14} aria-hidden /> : <Camera size={14} aria-hidden />}
      {noun === 'video' ? 'Record video' : 'Take photo'}
    </span>
    {!draft.requiresLivePhoto && (
      <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary">
        <ImageUp size={14} aria-hidden />
        {noun === 'video' ? 'Choose video' : 'Gallery'}
      </span>
    )}
  </div>
);

const Body = ({ draft }: { draft: ItemDraft }) => {
  const photos = Number(draft.requiredImageCount) || 0;
  const photoLine = photos > 0 && (
    <div className="flex flex-col gap-2">
      <span className="t-meta font-display font-semibold text-text-muted">
        {draft.requiresLivePhoto ? 'Live ' : ''}{draft.itemType === 'VIDEO_UPLOAD' ? 'video' : 'photo'}: 0 of {photos}{draft.maxImageCount ? `, up to ${draft.maxImageCount}` : ''}
      </span>
      <PhotoButtons draft={draft} noun={draft.itemType === 'VIDEO_UPLOAD' ? 'video' : 'photo'} />
    </div>
  );

  switch (draft.itemType) {
    case 'YES_NO':
    case 'PASS_FAIL': {
      const [yes, no] = draft.itemType === 'YES_NO' ? ['Yes', 'No'] : ['Pass', 'Fail'];
      const rules = [...draft.yesActions.map((a) => `${yes}: ${a}`), ...draft.noActions.map((a) => `${no}: ${a}`)];
      return (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2"><span className={ANSWER}>{yes}</span><span className={ANSWER}>{no}</span></div>
          {rules.length > 0 && <p className="t-meta font-display text-warning">{rules.length} follow-up {rules.length === 1 ? 'rule' : 'rules'} will ask for more.</p>}
          {(draft.yesActions.includes('REQUIRE_PHOTO') || draft.noActions.includes('REQUIRE_PHOTO')) && <PhotoButtons draft={draft} />}
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
      return <span className={FIELD}>{draft.options[0] ?? 'Select an option'}</span>;
    case 'RATING':
      return (
        <div className="flex">
          {Array.from({ length: Number(draft.ratingScale) || 5 }, (_, i) => <Star key={i} size={26} className="text-border" strokeWidth={1.5} aria-hidden />)}
        </div>
      );
    case 'NUMBER_ENTRY':
    case 'CASH_TALLY':
      return <span className={FIELD}>{draft.numberEntryUnit ? `Enter amount in ${draft.numberEntryUnit}` : 'Enter a number'}</span>;
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
      return <span className={FIELD}>Tick each person and their uniform items</span>;
    default:
      return (
        <div className="flex flex-col gap-3">
          <span className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
            <span className="flex size-6 items-center justify-center rounded-full border-2 border-text-light text-transparent"><Check size={13} /></span>
            <span className="t-card font-display font-medium text-text">Tap to mark done</span>
          </span>
          {photoLine}
        </div>
      );
  }
};

export const QuestionPhonePreview = ({ draft, open, onClose }: { draft: ItemDraft; open: boolean; onClose: () => void }) => {
  const photos = Number(draft.requiredImageCount) || 0;
  const showPhotoLine = photos > 0 && draft.itemType !== 'STANDARD' && draft.itemType !== 'YES_NO' && draft.itemType !== 'PASS_FAIL';
  return (
    <Modal open={open} onClose={onClose} title="How staff see it" description="A preview of this question on a phone." size="sm">
      <div className="mx-auto flex w-full max-w-72 flex-col gap-3 rounded-[1.75rem] border-4 border-border bg-surface-hover/40 p-3">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-border" aria-hidden="true" />
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3.5">
          <p className="t-card font-display font-semibold leading-snug text-text">
            {draft.label.trim() || <span className="font-medium italic text-text-light">Your question shows here</span>}
          </p>
          {draft.isCritical && <span className="w-fit rounded-full bg-danger/10 px-2 py-0.5 t-meta font-display font-bold text-danger">Critical</span>}
          <Body draft={draft} />
          {showPhotoLine && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <span className="t-meta font-display font-semibold text-text-muted">{draft.requiresLivePhoto ? 'Live ' : ''}photo: 0 of {photos}</span>
              <PhotoButtons draft={draft} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
