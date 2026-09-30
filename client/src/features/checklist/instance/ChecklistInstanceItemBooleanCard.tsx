import { useState } from 'react';
import { Camera, ImageUp, X, Loader2, Zap, AlertTriangle } from 'lucide-react';
import {
  useSetChecklistInstanceItemDoneMutation,
  useUploadChecklistInstanceImagesMutation,
  useDeleteChecklistInstanceImageMutation,
} from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { isFlaggedAnswer } from '../checklistDisplay';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { ChecklistConditionalAction } from '../../../api/checklistDefinitions';
import type { CaptureMethod } from '../../../api/ticket';

const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

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

export const ChecklistInstanceItemBooleanCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemBooleanCardProps) => {
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

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => { setPendingAnswer(null); setItemDone.mutate({ itemId: item.id, isDone: false, booleanAnswer: item.booleanAnswer ?? undefined }); }}
      />

      {setItemDone.isError && (
        <p className="text-xs text-danger">
          {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that answer."}
        </p>
      )}

      {!item.isDone && !pendingAnswer && (yesActions.length > 0 || noActions.length > 0) && (
        <div className="flex flex-col gap-1">
          {yesActions.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] font-display text-coral-700 dark:text-coral-400">
              <Zap size={11} className="shrink-0" />
              If you answer {labels.yes}, you'll need to provide {yesActions.map(a => ACTION_HINT[a]).join(', ')}.
            </p>
          )}
          {noActions.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] font-display text-coral-700 dark:text-coral-400">
              <Zap size={11} className="shrink-0" />
              If you answer {labels.no}, you'll need to provide {noActions.map(a => ACTION_HINT[a]).join(', ')}.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!interactive || item.isDone}
          onClick={() => pickAnswer('YES')}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-display font-medium transition-colors ${
            (pendingAnswer ?? item.booleanAnswer) === 'YES'
              ? 'border-success/60 bg-success/10 text-success'
              : 'border-border text-text-secondary hover:bg-surface-hover'
          } ${!interactive || item.isDone ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {labels.yes}
        </button>
        <button
          type="button"
          disabled={!interactive || item.isDone}
          onClick={() => pickAnswer('NO')}
          className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-display font-medium transition-colors ${
            (pendingAnswer ?? item.booleanAnswer) === 'NO'
              ? 'border-danger/60 bg-danger/10 text-danger'
              : 'border-border text-text-secondary hover:bg-surface-hover'
          } ${!interactive || item.isDone ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {labels.no}
        </button>
      </div>

      {item.isDone && isFlaggedAnswer(item) && (
        <p className="flex items-center gap-1.5 text-[11px] font-display font-medium text-danger">
          <AlertTriangle size={12} className="shrink-0" />
          Flagged — this answer counts against compliance, even with a reason or photo on file.
        </p>
      )}

      {showFollowUp && (
        <div className="flex flex-col gap-2.5 pt-2.5 border-t border-dashed border-border/60">
          {requiresReason && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-display text-text-muted">Reason</span>
              {pendingAnswer ? (
                <textarea
                  value={reasonDraft}
                  onChange={e => setReasonDraft(e.target.value)}
                  rows={2}
                  placeholder="Why? (required)"
                  className="w-full px-2.5 py-2 text-xs font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-y"
                />
              ) : (
                <p className="text-xs font-display text-text italic">"{item.conditionalReasonValue}"</p>
              )}
            </div>
          )}

          {requiresPhoto && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-display text-text-muted">
                Photo {images.length > 0 ? `(${images.length})` : '(required)'}
              </span>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map(img => (
                    <div key={img.id} className="relative">
                      <img
                        src={`${UPLOADS_BASE}${img.url}`}
                        alt={img.originalFilename ?? 'evidence'}
                        className="size-14 object-cover rounded-md border border-border"
                      />
                      {pendingAnswer && (
                        <button
                          onClick={() => deleteImage.mutate(img.id)}
                          disabled={deleteImage.isPending}
                          className="absolute -top-2 -right-2 size-6 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted hover:text-danger opacity-90 hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
                          aria-label="Delete image"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {pendingAnswer && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
                    <Camera size={11} />
                    Take photo
                    <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
                      onChange={e => { handleFiles(e.target.files, 'LIVE'); e.target.value = ''; }} />
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-display font-medium px-2.5 py-1 rounded-md border border-border text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1">
                    <ImageUp size={11} />
                    Gallery
                    <input type="file" accept="image/*" multiple className="sr-only"
                      onChange={e => { handleFiles(e.target.files, 'GALLERY'); e.target.value = ''; }} />
                  </label>
                  {uploadImages.isPending && <Loader2 size={12} className="animate-spin text-text-muted" />}
                </div>
              )}
            </div>
          )}

          {pendingAnswer && (
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setPendingAnswer(null); setReasonDraft(item.conditionalReasonValue ?? ''); }}
                className="text-xs font-display font-medium px-2.5 py-1 rounded-md text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingAnswer}
                disabled={!canConfirm || setItemDone.isPending}
                className="flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
                Confirm answer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
