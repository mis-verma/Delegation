import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { AlertTriangle, Camera, Check, ImageUp, MessageSquareText, TicketPlus, BellRing, X, type LucideIcon } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { IconChip, Textarea } from '../../../components';
import { cn } from '@/lib/utils';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { EvidenceThumb } from './EvidenceThumb';
import { CaptureButton, UploadingHint } from './CaptureButton';
import { isFlaggedAnswer } from '../checklistDisplay';
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
  'group flex flex-1 items-center justify-center gap-2 min-h-12 sm:min-h-11 px-4 rounded-xl border-2 t-card sm:text-sm font-display font-bold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.98] [-webkit-tap-highlight-color:transparent]';

const AUTO_SAVE_REASON_MS = 800;
const AUTO_SAVE_PHOTO_MS = 150;

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
  const baselinePhotos = useRef<ReadonlySet<string>>(new Set());
  const [reasonDraft, setReasonDraft] = useState(item.conditionalReasonValue ?? '');

  const shownAnswer = pendingAnswer ?? (item.isDone ? item.booleanAnswer : null);
  const activeActions = shownAnswer ? actionsFor(shownAnswer) : [];
  const needsPhoto = activeActions.includes('REQUIRE_PHOTO');
  const needsReason = activeActions.includes('ASK_REASON');
  const conditionalPurpose = shownAnswer ? (`CONDITIONAL_${shownAnswer}` as const) : null;
  const images = (item.images ?? []).filter((img) => img.purpose === conditionalPurpose);
  const sessionPhotos = images.filter((img) => !baselinePhotos.current.has(img.id));
  const reasonReady = !needsReason || reasonDraft.trim().length > 0;
  const photoReady = !needsPhoto || images.length > 0;
  const readyToSave = pendingAnswer !== null && reasonReady && photoReady;

  const discardSession = () => {
    for (const img of sessionPhotos) deleteImage.mutate(img.id);
    baselinePhotos.current = new Set(images.filter((img) => !sessionPhotos.includes(img)).map((img) => img.id));
  };

  const { mutate: mutateDone, isPending: saving } = setItemDone;
  const itemId = item.id;
  const save = useCallback((answer: Answer, reason: string | undefined) => {
    mutateDone(
      { itemId, isDone: true, booleanAnswer: answer, conditionalReasonValue: reason },
      { onSuccess: () => setPendingAnswer(null) },
    );
  }, [mutateDone, itemId]);

  useEffect(() => {
    if (!readyToSave || !pendingAnswer || saving) return undefined;
    const wait = needsReason ? AUTO_SAVE_REASON_MS : AUTO_SAVE_PHOTO_MS;
    const timer = setTimeout(() => save(pendingAnswer, needsReason ? reasonDraft.trim() : undefined), wait);
    return () => clearTimeout(timer);
  }, [readyToSave, pendingAnswer, reasonDraft, needsReason, saving, save]);

  const pickAnswer = (value: Answer) => {
    if (!interactive || setItemDone.isPending) return;
    haptic('tap');
    if (pendingAnswer === value) {
      discardSession();
      setPendingAnswer(null);
      setReasonDraft(item.conditionalReasonValue ?? '');
      return;
    }
    if (!pendingAnswer && item.isDone && item.booleanAnswer === value) return;
    if (isTriggering(value)) {
      if (pendingAnswer === null) baselinePhotos.current = new Set(images.map((img) => img.id));
      else discardSession();
      setReasonDraft(item.booleanAnswer === value ? item.conditionalReasonValue ?? '' : '');
      setPendingAnswer(value);
      return;
    }
    if (pendingAnswer !== null) {
      discardSession();
      setPendingAnswer(null);
    }
    setReasonDraft('');
    save(value, undefined);
  };

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length || !conditionalPurpose) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod, purpose: conditionalPurpose });
  };

  const waitingOnFollowUp = pendingAnswer !== null && !readyToSave;
  const savedReason = pendingAnswer === null && item.isDone ? item.conditionalReasonValue : null;
  const showFollowUp = pendingAnswer !== null || (item.isDone && isTriggering((item.booleanAnswer ?? 'YES') as Answer) && (needsReason || needsPhoto)) || !!savedReason;
  const previousAnswer = !item.isDone && !pendingAnswer && item.booleanAnswer ? (item.booleanAnswer === 'YES' ? labels.yes : labels.no) : null;
  const flagged = item.isDone && isFlaggedAnswer(item);

  const answerButton = (value: Answer) => {
    const label = value === 'YES' ? labels.yes : labels.no;
    const on = shownAnswer === value;
    const good = value === 'YES';
    const Icon = good ? Check : X;
    return (
      <button
        key={value}
        type="button"
        disabled={!interactive}
        onClick={() => pickAnswer(value)}
        aria-pressed={on}
        className={cn(
          ANSWER_BASE,
          on && item.isDone && !pendingAnswer
            ? good ? 'border-success-strong bg-success-strong text-white' : 'border-danger bg-danger text-white'
            : on
              ? good ? 'border-success bg-success/10 text-success' : 'border-danger bg-danger/10 text-danger'
              : good ? 'border-border text-text hover:border-success/60 hover:bg-success/5' : 'border-border text-text hover:border-danger/60 hover:bg-danger/5',
          interactive ? 'cursor-pointer' : cn('cursor-not-allowed', !on && 'opacity-50'),
        )}
      >
        <Icon size={17} strokeWidth={3} aria-hidden="true" />
        {label}
      </button>
    );
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => { setPendingAnswer(null); setReasonDraft(''); setItemDone.mutate({ itemId: item.id, isDone: false, booleanAnswer: item.booleanAnswer ?? undefined }); }}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />

      {previousAnswer && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was answered {previousAnswer} before. Answer it again.</p>
      )}

      <div className="flex items-center gap-2 sm:max-w-md">
        {answerButton('YES')}
        {answerButton('NO')}
      </div>

      {!shownAnswer && interactive && (yesActions.length > 0 || noActions.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What each answer asks for">
          {([['YES', labels.yes, yesActions], ['NO', labels.no, noActions]] as const).filter(([, , a]) => a.length > 0).map(([key, label, actions]) => (
            <li key={key}>
              <IconChip icon={Check} tone={key === 'YES' ? 'bg-success' : 'bg-danger'} label={`${label}: ${actions.map((a) => FOLLOW_UP[a].label.toLowerCase()).join(', ')}`} />
            </li>
          ))}
        </ul>
      )}

      {showFollowUp && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface-hover/40 p-3">
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
                id={reasonId}
                label="Reason"
                labelClassName="font-display font-medium"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                rows={2}
                placeholder="Why? It saves by itself when you stop typing."
                className="min-h-0 px-3 py-2 rounded-lg"
              />
            ) : (
              <p className="t-meta font-display italic text-text"><span className="not-italic font-semibold text-text-muted">Reason: </span>"{item.conditionalReasonValue}"</p>
            )
          )}

          {needsPhoto && (
            <div className="flex flex-col gap-2">
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <EvidenceThumb key={img.id} image={img} siblings={images} large={!pendingAnswer} onDelete={pendingAnswer ? deleteImage.mutate : undefined} deleting={deleteImage.isPending} />
                  ))}
                </div>
              )}
              {pendingAnswer && (
                <div className="flex flex-wrap items-center gap-2">
                  <CaptureButton icon={Camera} label="Take photo" live accept="image/*" onFiles={(files) => handleFiles(files, 'LIVE')} />
                  {!item.requiresLivePhoto && (
                    <CaptureButton icon={ImageUp} label="Gallery" live={false} accept="image/*" onFiles={(files) => handleFiles(files, 'GALLERY')} />
                  )}
                  {uploadImages.isPending && <UploadingHint progress={uploadImages.progress} />}
                </div>
              )}
            </div>
          )}

          {waitingOnFollowUp && <p className="t-meta font-display text-text-muted">Tap the {shownAnswer === 'YES' ? labels.yes : labels.no} button again to go back.</p>}
        </div>
      )}

      {item.issueId && shownAnswer && !activeActions.includes('CREATE_ISSUE') && (
        <p className="flex items-start gap-1.5 t-meta font-display text-text-muted">
          <TicketPlus className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          A ticket was raised for an earlier answer. It stays open until someone closes it.
        </p>
      )}

      {flagged && (
        <IconChip icon={AlertTriangle} tone="bg-danger" label="Flagged: counts against compliance, even with a reason or photo" className="h-auto min-h-7 w-fit max-w-full py-1" labelClassName="whitespace-normal text-danger" />
      )}
    </ItemCardShell>
  );
});
