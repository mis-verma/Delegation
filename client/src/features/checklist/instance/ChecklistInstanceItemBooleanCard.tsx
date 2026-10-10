import { memo, useId, useState } from 'react';
import { Camera, ImageUp, Zap, AlertTriangle } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { Button, Textarea } from '../../../components';
import { cn } from '@/lib/utils';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
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

const LABELS_BY_ITEM_TYPE: Partial<Record<ChecklistInstanceItem['itemType'], { yes: string; no: string }>> = {
  YES_NO: { yes: 'Yes', no: 'No' },
  PASS_FAIL: { yes: 'Pass', no: 'Fail' },
};

const ACTION_HINT: Record<ChecklistConditionalAction, string> = {
  REQUIRE_PHOTO: 'a photo',
  ASK_REASON: 'a reason',
  CREATE_ISSUE: 'an issue will be raised',
  NOTIFY_AREA_MANAGER: 'the area manager will be notified',
};

// The answer buttons size everything from their own font: the icon is 1.15em, so it grows and shrinks
// with the label (15px on phones, 14px from sm) and the two always sit in balance. Equal width, 48px
// tall on phones so a thumb never misses, 40px with a mouse.
const ANSWER_BASE =
  'group flex flex-1 items-center justify-center gap-2 min-h-12 sm:min-h-10 px-4 rounded-xl border t-card sm:text-sm font-display font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.98] [-webkit-tap-highlight-color:transparent]';

export const ChecklistInstanceItemBooleanCard = memo(function ChecklistInstanceItemBooleanCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemBooleanCardProps) {
  const reasonId = useId();
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceImageMutation(instanceId);
  const labels = LABELS_BY_ITEM_TYPE[item.itemType] ?? LABELS_BY_ITEM_TYPE.YES_NO!;
  const interactive = canWork && !isLocked;

  const yesActions = item.yesActions ?? [];
  const noActions = item.noActions ?? [];
  const actionsFor = (value: 'YES' | 'NO') => (value === 'YES' ? yesActions : noActions);
  const isTriggering = (value: 'YES' | 'NO') => actionsFor(value).length > 0;

  const [pendingAnswer, setPendingAnswer] = useState<'YES' | 'NO' | null>(null);
  const activeActions = pendingAnswer
    ? actionsFor(pendingAnswer)
    : item.isDone && item.booleanAnswer
      ? actionsFor(item.booleanAnswer)
      : [];
  const requiresPhoto = activeActions.includes('REQUIRE_PHOTO');
  const requiresReason = activeActions.includes('ASK_REASON');
  const [reasonDraft, setReasonDraft] = useState(item.conditionalReasonValue ?? '');
  const images = item.images ?? [];

  const pickAnswer = (value: 'YES' | 'NO') => {
    if (!interactive || setItemDone.isPending) return;
    if (isTriggering(value)) {
      setPendingAnswer(value);
      return;
    }
    setItemDone.mutate({ itemId: item.id, isDone: true, booleanAnswer: value });
  };

  const canConfirm =
    (!requiresReason || reasonDraft.trim().length > 0) &&
    (!requiresPhoto || images.length > 0);

  const confirmPendingAnswer = () => {
    if (!pendingAnswer || !canConfirm) return;
    setItemDone.mutate(
      {
        itemId: item.id,
        isDone: true,
        booleanAnswer: pendingAnswer,
        conditionalReasonValue: requiresReason ? reasonDraft.trim() : undefined,
      },
      { onSuccess: () => setPendingAnswer(null) },
    );
  };

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ itemId: item.id, files: Array.from(files), captureMethod });
  };

  // Follow-up UI shows while confirming a pending trigger answer, or read-only afterward if the
  // item was already completed with the triggering answer (so the reason/photos stay visible).
  const showFollowUp = pendingAnswer != null || (item.isDone && isTriggering((item.booleanAnswer ?? '') as 'YES' | 'NO'));
  const answerLocked = !interactive || item.isDone;
  // A reopened question keeps its old answer on file, but it is open again: show neither button as picked
  // (it used to look already answered), and say what it was before in small text instead.
  const shownAnswer = pendingAnswer ?? (item.isDone ? item.booleanAnswer : null);
  const previousAnswer = !item.isDone && !pendingAnswer && item.booleanAnswer ? (item.booleanAnswer === 'YES' ? labels.yes : labels.no) : null;

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => { setPendingAnswer(null); setItemDone.mutate({ itemId: item.id, isDone: false, booleanAnswer: item.booleanAnswer ?? undefined }); }}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />

      {!item.isDone && !pendingAnswer && (yesActions.length > 0 || noActions.length > 0) && (
        <div className="flex flex-col gap-1">
          {yesActions.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs font-display text-warning">
              <Zap className="size-3 shrink-0 mt-0.5" />
              If you answer {labels.yes}, you'll need to provide {yesActions.map(a => ACTION_HINT[a]).join(', ')}.
            </p>
          )}
          {noActions.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs font-display text-warning">
              <Zap className="size-3 shrink-0 mt-0.5" />
              If you answer {labels.no}, you'll need to provide {noActions.map(a => ACTION_HINT[a]).join(', ')}.
            </p>
          )}
        </div>
      )}

      {previousAnswer && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was answered {previousAnswer} before. Answer it again.</p>
      )}

      <div className="flex items-center gap-2 sm:max-w-md">
        <button
          type="button"
          disabled={answerLocked}
          onClick={() => pickAnswer('YES')}
          aria-pressed={shownAnswer === 'YES'}
          className={cn(
            ANSWER_BASE,
            shownAnswer === 'YES'
              ? item.isDone ? 'border-success-strong bg-success-strong text-white' : 'border-success bg-success/10 text-success'
              : 'border-border text-text hover:border-success/60 hover:bg-success/5',
            // Once answered, the chosen one stays clear and only the other one fades.
            answerLocked ? cn('cursor-not-allowed', shownAnswer !== 'YES' && 'opacity-50') : 'cursor-pointer',
          )}
        >
          {labels.yes}
        </button>
        <button
          type="button"
          disabled={answerLocked}
          onClick={() => pickAnswer('NO')}
          aria-pressed={shownAnswer === 'NO'}
          className={cn(
            ANSWER_BASE,
            shownAnswer === 'NO'
              ? item.isDone ? 'border-danger bg-danger text-white' : 'border-danger bg-danger/10 text-danger'
              : 'border-border text-text hover:border-danger/60 hover:bg-danger/5',
            answerLocked ? cn('cursor-not-allowed', shownAnswer !== 'NO' && 'opacity-50') : 'cursor-pointer',
          )}
        >
          {labels.no}
        </button>
      </div>

      {item.isDone && isFlaggedAnswer(item) && (
        <p className="flex items-start gap-1.5 text-xs font-display font-medium text-danger">
          <AlertTriangle className="size-3.5 shrink-0 mt-px" />
          Flagged. This answer counts against compliance, even with a reason or photo on file.
        </p>
      )}

      {showFollowUp && (
        <div className="flex flex-col gap-3 pt-3 border-t border-border/60">
          {requiresReason && (
            pendingAnswer ? (
              <Textarea
                id={reasonId}
                label="Reason"
                labelClassName="font-display font-medium"
                value={reasonDraft}
                onChange={e => setReasonDraft(e.target.value)}
                rows={2}
                placeholder="Why? (required)"
                className="min-h-0 px-3 py-2 rounded-lg"
              />
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-display text-text-muted">Reason</span>
                <p className="text-xs font-display text-text italic">"{item.conditionalReasonValue}"</p>
              </div>
            )
          )}

          {requiresPhoto && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-display text-text-muted">
                Photo {images.length > 0 ? `(${images.length})` : '(required)'}
              </span>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map(img => (
                    <EvidenceThumb
                      key={img.id}
                      image={img}
                      onDelete={pendingAnswer ? deleteImage.mutate : undefined}
                      deleting={deleteImage.isPending}
                    />
                  ))}
                </div>
              )}
              {pendingAnswer && (
                <div className="flex items-center gap-2 flex-wrap">
                  <CaptureButton icon={Camera} label="Take photo" live accept="image/*" onFiles={files => handleFiles(files, 'LIVE')} />
                  <CaptureButton icon={ImageUp} label="Gallery" live={false} accept="image/*" onFiles={files => handleFiles(files, 'GALLERY')} />
                  {uploadImages.isPending && <UploadingHint />}
                </div>
              )}
            </div>
          )}

          {pendingAnswer && (
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPendingAnswer(null); setReasonDraft(item.conditionalReasonValue ?? ''); }}
              >
                Cancel
              </Button>
              <ItemActionButton
                onClick={confirmPendingAnswer}
                disabled={!canConfirm}
                isLoading={setItemDone.isPending}
              >
                Confirm answer
              </ItemActionButton>
            </div>
          )}
        </div>
      )}
    </ItemCardShell>
  );
});
