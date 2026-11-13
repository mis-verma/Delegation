import { memo, useCallback, useId, useRef, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { AlertTriangle, Camera, Check, ImageUp, MessageSquareText, Pencil, TicketPlus, BellRing, X, type LucideIcon } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { Button, IconChip, Textarea } from '../../../components';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { EvidenceThumb } from './EvidenceThumb';
import { FailedPhotoNote } from './FailedPhotoNote';
import { isFailedPhoto, passingPhotos } from '../photoQuality';
import { CaptureButton, UploadingHint } from './CaptureButton';
import { MAX_LIVE_PHOTOS } from './cameraSupport';
import { isFlaggedAnswer } from '../checklistDisplay';
import { RemarkDialog } from './ItemRemarksField';
import { isEarlierPhoto, photosInRound, useRoundStart } from './correctionRound';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { ChecklistConditionalAction } from '../../../api/checklistDefinitions';
import type { CaptureMethod } from '../../../api/ticket';

interface ChecklistInstanceItemBooleanCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

type Answer = 'YES' | 'NO';

const LABELS_BY_ITEM_TYPE: Partial<Record<ChecklistInstanceItem['itemType'], { yes: string; no: string }>> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const FOLLOW_UP: Record<ChecklistConditionalAction, { label: string; icon: LucideIcon }> = {
  REQUIRE_PHOTO: { label: 'Add a photo', icon: Camera },
  ASK_REASON: { label: 'Say why', icon: MessageSquareText },
  CREATE_ISSUE: { label: 'A ticket is raised', icon: TicketPlus },
  NOTIFY_AREA_MANAGER: { label: 'Area manager is told', icon: BellRing },
};

const ANSWER_BASE =
  'group relative flex min-w-0 items-center justify-center gap-2 min-h-13 sm:min-h-11 pointer-coarse:min-h-13 px-3 rounded-xl border t-card font-display font-semibold tracking-tight transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent]';

type Tone = 'good' | 'bad' | 'plain' | 'muted';

const TONE_LOOK: Record<Tone, { saved: string; picked: string; idle: string }> = {
  good: {
    saved: 'border-success/45 bg-success/12 text-success-strong font-bold dark:text-success',
    picked: 'border-success/60 bg-surface text-success-strong ring-2 ring-success/20 dark:text-success',
    idle: 'border-border/70 bg-surface text-text hover:border-success/45 hover:bg-success/[0.06]',
  },
  bad: {
    saved: 'border-danger/45 bg-danger/10 text-danger font-bold',
    picked: 'border-danger/60 bg-surface text-danger ring-2 ring-danger/20',
    idle: 'border-border/70 bg-surface text-text hover:border-danger/45 hover:bg-danger/[0.05]',
  },
  plain: {
    saved: 'border-primary-500/45 bg-primary-500/10 text-primary-700 font-bold dark:text-primary-300',
    picked: 'border-primary-500/60 bg-surface text-primary-700 ring-2 ring-primary-500/20 dark:text-primary-300',
    idle: 'border-border/70 bg-surface text-text hover:border-primary-500/40 hover:bg-primary-500/[0.05]',
  },
  muted: { saved: '', picked: '', idle: 'border-border/60 bg-surface-hover/40 text-text-secondary hover:border-border-hover hover:bg-surface-hover hover:text-text' },
};



const toneFor = (accepted: readonly string[], value: Answer): Tone =>
  accepted.length ? (accepted.includes(value) ? 'good' : 'bad') : 'plain';


export const ChecklistInstanceItemBooleanCard = memo(function ChecklistInstanceItemBooleanCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemBooleanCardProps) {
  const reasonId = useId();
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceImageMutation(instanceId);
  const labels = LABELS_BY_ITEM_TYPE[item.itemType] ?? LABELS_BY_ITEM_TYPE.YES_NO!;
  const interactive = canWork && !isLocked;

  const yesActions = item.yesActions ?? [];
  const noActions = item.noActions ?? [];
  const actionsFor = (value: Answer) => (value === 'YES' ? yesActions : noActions);
  const isTriggering = (value: Answer) => actionsFor(value).length > 0;

  const [pendingAnswer, setPendingAnswer] = useState<Answer | null>(null);
  const [editingSaved, setEditingSaved] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const baselinePhotos = useRef<ReadonlySet<string>>(new Set());
  const [reasonDraft, setReasonDraft] = useState(item.conditionalReasonValue ?? '');
  const [naOpen, setNaOpen] = useState(false);
  const [noOpen, setNoOpen] = useState(false);
  const accepted = item.acceptableAnswers ?? [];

  const shownAnswer = pendingAnswer ?? (item.isDone ? item.booleanAnswer : null);
  const activeActions = shownAnswer ? actionsFor(shownAnswer) : [];
  const needsPhoto = activeActions.includes('REQUIRE_PHOTO');
  const needsReason = activeActions.includes('ASK_REASON');
  const conditionalPurpose = shownAnswer ? (`CONDITIONAL_${shownAnswer}` as const) : null;
  const images = (item.images ?? []).filter((img) => img.purpose === conditionalPurpose);
  const sessionPhotos = images.filter((img) => !baselinePhotos.current.has(img.id));
  const sessionIds = new Set(sessionPhotos.map((img) => img.id));
  const reasonReady = !needsReason || reasonDraft.trim().length > 0;
  const roundStart = useRoundStart(item);
  const photoRoom = Math.max(0, Math.min(item.maxImageCount ?? MAX_LIVE_PHOTOS, MAX_LIVE_PHOTOS) - passingPhotos(photosInRound(images, roundStart)).length);
  const photoReady = !needsPhoto || passingPhotos(images).length > 0;
  const readyToSave = pendingAnswer !== null && reasonReady && photoReady;

  const discardSession = () => {
    for (const img of sessionPhotos) if (!isFailedPhoto(img)) deleteImage.mutate(img.id);
    baselinePhotos.current = new Set(images.filter((img) => !sessionPhotos.includes(img) || isFailedPhoto(img)).map((img) => img.id));
  };

  const { mutate: mutateDone, isPending: saving } = setItemDone;
  const { isPending: uploading } = uploadImages;
  const itemId = item.id;
  const closeEditor = useCallback(() => {
    setEditingSaved(false);
    setPendingAnswer(null);
  }, []);
  const save = useCallback((answer: Answer, reason: string | undefined) => {
    mutateDone(
      { itemId, isDone: true, booleanAnswer: answer, conditionalReasonValue: reason },
      { onSuccess: closeEditor },
    );
  }, [mutateDone, itemId, closeEditor]);

  const savedDone = item.isDone;
  const savedAnswer = item.booleanAnswer;
  const savedReasonText = (item.conditionalReasonValue ?? '').trim();
  const commit = useCallback((answer: Answer, reason: string | undefined) => {
    if (savedDone && savedAnswer === answer && (reason ?? '') === savedReasonText) {
      closeEditor();
      return;
    }
    save(answer, reason);
  }, [savedDone, savedAnswer, savedReasonText, save, closeEditor]);

  const startEditReason = () => {
    if (!interactive || !item.isDone || !item.booleanAnswer) return;
    haptic('tap');
    baselinePhotos.current = new Set(images.map((img) => img.id));
    setReasonDraft(item.conditionalReasonValue ?? '');
    setEditingSaved(true);
    setPendingAnswer(item.booleanAnswer);
  };

  const pickAnswer = (value: Answer) => {
    if (!interactive || setItemDone.isPending) return;
    haptic('tap');
    if (pendingAnswer === value) {
      discardSession();
      closeEditor();
      setReasonDraft(item.conditionalReasonValue ?? '');
      return;
    }
    if (!pendingAnswer && item.isDone && item.booleanAnswer === value) return;
    if (value === 'NO' && !isTriggering('NO')) {
      if (pendingAnswer !== null) {
        discardSession();
        closeEditor();
      }
      setNoOpen(true);
      return;
    }
    if (isTriggering(value)) {
      if (pendingAnswer === null) baselinePhotos.current = new Set(images.map((img) => img.id));
      else discardSession();
      setReasonDraft(item.booleanAnswer === value ? item.conditionalReasonValue ?? '' : '');
      setEditingSaved(false);
      setPendingAnswer(value);
      return;
    }
    if (pendingAnswer !== null) {
      discardSession();
      closeEditor();
    }
    setReasonDraft('');
    save(value, undefined);
  };

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length || !conditionalPurpose) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod, purpose: conditionalPurpose });
  };

  const savedReason = pendingAnswer === null && item.isDone ? item.conditionalReasonValue : null;
  const showFollowUp = pendingAnswer !== null || (item.isDone && isTriggering((item.booleanAnswer ?? 'YES') as Answer) && (needsReason || needsPhoto)) || !!savedReason;
  const previousAnswer = !item.isDone && !pendingAnswer && item.booleanAnswer ? (item.booleanAnswer === 'YES' ? labels.yes : labels.no) : null;
  const flagged = item.isDone && isFlaggedAnswer(item);
  const canFollowUp = yesActions.length > 0 || noActions.length > 0 || !!item.conditionalReasonValue;
  const canMarkNa = interactive && !item.isDone && pendingAnswer === null && !setItemDone.isPending && item.allowNotApplicable !== false;

  const pendingTone = pendingAnswer ? toneFor(accepted, pendingAnswer) : 'plain';
  const pendingLabel = pendingAnswer === 'NO' ? labels.no : labels.yes;
  const sheetTitle = needsReason
    ? (pendingAnswer === 'NO' ? (item.itemType === 'PASS_FAIL' ? 'Why did it fail?' : 'Why is it No?') : `Why is it ${pendingLabel}?`)
    : needsPhoto ? `Add a photo for ${pendingLabel}` : `Answer ${pendingLabel}`;

  const cancelPending = () => {
    discardSession();
    closeEditor();
    setReasonDraft(item.conditionalReasonValue ?? '');
  };

  const followUpBody = (
    <div className="flex flex-col gap-3">
      {pendingAnswer && item.sendBackNote && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 t-meta font-display text-text">
          <span className="font-semibold text-danger">Reviewer said: </span>{item.sendBackNote}
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Needed for this answer">
        {activeActions.map((action) => {
          const { label, icon } = FOLLOW_UP[action];
          const done = action === 'ASK_REASON' ? reasonReady : action === 'REQUIRE_PHOTO' ? photoReady : true;
          return (
            <li key={action}>
              <IconChip icon={done ? Check : icon} tone={done ? 'bg-success' : 'bg-warning'} label={label} labelClassName={done ? 'text-success' : 'text-warning'} />
            </li>
          );
        })}
        {saving && <li><IconChip icon={false} label="Saving" /></li>}
      </ul>

      {(needsReason || !!savedReason) && (
        pendingAnswer ? (
          <Textarea
            ref={reasonRef}
            id={reasonId}
            label="Reason"
            labelClassName="font-display font-medium"
            autoFocus
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Say what you saw. The reviewer reads this."
            className="min-h-0 px-3 py-2 rounded-lg resize-none"
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 t-meta font-display italic text-text"><span className="not-italic font-semibold text-text-muted">Reason: </span>"{item.conditionalReasonValue}"</p>
            {interactive && needsReason && !!savedReason && (
              <Button variant="ghost" size="sm" onClick={startEditReason} aria-label={`Edit reason: ${item.label}`}>
                <Pencil size={13} aria-hidden />
                Edit
              </Button>
            )}
          </div>
        )
      )}

      {needsPhoto && (
        <div className="flex flex-col gap-2">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <EvidenceThumb
                  key={img.id}
                  image={img}
                  siblings={images}
                  large
                  earlier={isEarlierPhoto(img, roundStart)}
                  onDelete={pendingAnswer && (!editingSaved || sessionIds.has(img.id)) ? deleteImage.mutate : undefined}
                  deleting={deleteImage.isPending && deleteImage.variables === img.id}
                />
              ))}
            </div>
          )}
          <FailedPhotoNote count={images.length - passingPhotos(images).length} needsMore={passingPhotos(images).length === 0} />
          {pendingAnswer && (
            <div className={cn('grid gap-2 sm:flex sm:flex-wrap sm:items-center', item.requiresLivePhoto ? 'grid-cols-1' : 'grid-cols-2')}>
              <CaptureButton icon={Camera} label="Take photo" ariaLabel={`Take photo: ${item.label}`} live burst limit={photoRoom} accept="image/*" disabled={uploading || photoRoom <= 0} onFiles={(files) => handleFiles(files, 'LIVE')} />
              {!item.requiresLivePhoto && (
                <CaptureButton icon={ImageUp} label="Gallery" ariaLabel={`Gallery photo: ${item.label}`} live={false} accept="image/*" disabled={uploading} onFiles={(files) => handleFiles(files, 'GALLERY')} />
              )}
              {uploadImages.isPending && <UploadingHint progress={uploadImages.progress} />}
            </div>
          )}
        </div>
      )}

      {pendingAnswer && needsPhoto && (
        <p className="t-meta font-display text-text-muted">
          {photoReady
            ? `${passingPhotos(images).length} ${passingPhotos(images).length === 1 ? 'photo' : 'photos'} added. Add more if you like, then tap Save.`
            : 'Take at least one clear photo, then tap Save.'}
        </p>
      )}
    </div>
  );

  const answerButton = (value: Answer) => {
    const label = value === 'YES' ? labels.yes : labels.no;
    const on = shownAnswer === value;
    const look = TONE_LOOK[toneFor(accepted, value)];
    const filled = on && item.isDone && !pendingAnswer;
    return (
      <button
        key={value}
        type="button"
        disabled={!interactive}
        onClick={() => pickAnswer(value)}
        aria-pressed={on}
        className={cn(
          ANSWER_BASE,
          filled ? look.saved : on ? look.picked : look.idle,
          interactive ? 'cursor-pointer' : cn('cursor-not-allowed', !on && 'opacity-50'),
        )}
      >
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => { closeEditor(); setReasonDraft(''); setItemDone.mutate({ itemId: item.id, isDone: false, booleanAnswer: item.booleanAnswer ?? undefined }); }}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />

      {previousAnswer && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was answered {previousAnswer} before. Answer it again.</p>
      )}

      <div className={cn('grid gap-2 sm:max-w-lg', canMarkNa ? 'grid-cols-[1fr_1fr_auto] sm:grid-cols-3' : 'grid-cols-2')} role="group" aria-label={`Answer: ${item.label}`}>
        {answerButton('YES')}
        {answerButton('NO')}
        {canMarkNa && (
          <button
            type="button"
            onClick={() => { haptic('tap'); setNaOpen(true); }}
            aria-label={`Mark not applicable: ${item.label}`}
            className={cn(ANSWER_BASE, TONE_LOOK.muted.idle, 'cursor-pointer')}
          >
            N/A
          </button>
        )}
      </div>
      {naOpen && (
        <RemarkDialog
          item={item}
          instanceId={instanceId}
          mode="na"
          saved=""
          missing={false}
          onClose={() => setNaOpen(false)}
        />
      )}

      {noOpen && (
        <RemarkDialog
          item={item}
          instanceId={instanceId}
          mode="no"
          saved=""
          missing={false}
          onClose={() => setNoOpen(false)}
        />
      )}

      {!shownAnswer && interactive && (yesActions.length > 0 || noActions.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What each answer asks for">
          {([['YES', labels.yes, yesActions], ['NO', labels.no, noActions]] as const).filter(([, , a]) => a.length > 0).map(([key, label, actions]) => (
            <li key={key}>
              <IconChip icon={Check} tone={key === 'YES' ? 'bg-success' : 'bg-danger'} label={`${label}: ${actions.map((a) => FOLLOW_UP[a].label.toLowerCase()).join(', ')}`} />
            </li>
          ))}
        </ul>
      )}

      {canFollowUp && pendingAnswer === null && showFollowUp && (
        <div className="view-enter flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-hover/40 p-3">
          {followUpBody}
        </div>
      )}

      <Dialog open={pendingAnswer !== null} onOpenChange={(next) => { if (!next && !saving) cancelPending(); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-4 sm:max-w-md" onOpenAutoFocus={(e) => { if (!needsReason) e.preventDefault(); }}>
          <DialogHeader className="items-start text-left">
            <span className={cn('flex size-11 items-center justify-center rounded-2xl text-white', pendingTone === 'bad' ? 'bg-danger' : pendingTone === 'good' ? 'bg-success-strong' : 'bg-primary-600')} aria-hidden="true">
              {pendingAnswer === 'NO' ? <X size={20} strokeWidth={3} /> : <Check size={20} strokeWidth={3} />}
            </span>
            <DialogTitle className="text-lg">{sheetTitle}</DialogTitle>
            <DialogDescription className="t-card font-medium text-text-secondary">{item.label}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{followUpBody}</div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={cancelPending} className="pointer-coarse:h-12">Cancel</Button>
            <Button
              type="button"
              variant="primary"
              disabled={!readyToSave || uploading}
              isLoading={saving}
              onClick={() => { if (pendingAnswer) commit(pendingAnswer, needsReason ? reasonDraft.trim() : undefined); }}
              className="pointer-coarse:h-12"
            >
              {!saving && <Check size={15} strokeWidth={2.75} aria-hidden="true" />}
              Save {pendingAnswer === 'NO' ? labels.no : labels.yes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {item.issueId && shownAnswer && !activeActions.includes('CREATE_ISSUE') && (
        <p className="flex items-start gap-1.5 t-meta font-display text-text-muted">
          <TicketPlus className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          A ticket was raised for an earlier answer. It stays open until someone closes it.
        </p>
      )}

      {flagged && !interactive && (
        <IconChip icon={AlertTriangle} tone="bg-danger" label="Flagged: counts against compliance, even with a reason or photo" className="h-auto min-h-7 w-fit max-w-full py-1" labelClassName="whitespace-normal text-danger" />
      )}
    </ItemCardShell>
  );
});
