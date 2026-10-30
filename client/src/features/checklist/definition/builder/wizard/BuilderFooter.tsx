import { AlertCircle, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Button } from '../../../../../components';

interface Props {
  step: number;
  stepCount: number;
  stepValid: boolean;
  blockReason: string;
  isEditing: boolean;
  isDirty: boolean;
  canSubmit: boolean;
  hasPeople: boolean;
  hasName: boolean;
  savedDraftId?: string;
  isSaving: boolean;
  isSavingDraft: boolean;
  hasError: boolean;
  errorMessage: string;
  isConflict: boolean;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSaveStay: () => void;
  onSubmit: () => void;
  onReloadLatest: () => void;
}

export const BuilderFooter = ({
  step, stepCount, stepValid, blockReason, isEditing, isDirty, canSubmit, hasPeople, hasName, savedDraftId,
  isSaving, isSavingDraft, hasError, errorMessage, isConflict,
  onBack, onNext, onSaveDraft, onSaveStay, onSubmit, onReloadLatest,
}: Props) => (
    <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-4 sm:-mx-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-8 py-3 border-t border-border/60 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 rounded-b-2xl">
      {hasError && (
        <div role="alert" className="order-first flex w-full flex-wrap items-start gap-x-3 gap-y-1.5 t-meta font-display font-medium text-danger">
          <p className="flex min-w-0 flex-1 items-start gap-1.5">
            <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden />
            <span className="min-w-0 break-words">{errorMessage}</span>
          </p>
          {isEditing && isConflict && (
            <Button type="button" variant="outline" size="sm" onClick={onReloadLatest} className="font-display pointer-coarse:h-11">
              Load latest version
            </Button>
          )}
        </div>
      )}
      {step < stepCount - 1 && !stepValid && (
        <p role="status" className="order-first flex w-full items-start gap-2 rounded-xl border border-warning/30 bg-warning/8 px-3 py-2 t-meta font-display font-medium text-warning">
          <AlertCircle size={14} className="mt-px shrink-0" aria-hidden />
          <span className="min-w-0">{blockReason}</span>
        </p>
      )}
      {step > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBack}
          className="font-display pointer-coarse:h-11"
        >
          <ChevronLeft size={15} />
          <span>Back</span>
        </Button>
      ) : <span />}

      {step < stepCount - 1 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isEditing && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onSaveDraft}
              isLoading={isSavingDraft}
              disabled={!hasName}
              title={!hasName ? 'Give it a name first' : 'Save what you have and finish later'}
              className="font-display pointer-coarse:h-11"
            >
              <Save size={15} aria-hidden />
              <span>{savedDraftId ? 'Update draft' : 'Save draft'}</span>
            </Button>
          )}
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onSaveStay}
              isLoading={isSaving}
              disabled={!canSubmit || !isDirty}
              title={!canSubmit ? 'Fix the step that needs attention first' : !isDirty ? 'Nothing to save yet' : 'Save now and keep editing'}
              className="font-display pointer-coarse:h-11"
            >
              <Save size={15} aria-hidden />
              <span>{isDirty ? 'Save' : 'Saved'}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onNext}
            aria-disabled={!stepValid}
            className={`font-display pointer-coarse:h-11 ${stepValid ? '' : 'opacity-60'}`}
          >
            <span>Next</span>
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
      {step === stepCount - 1 && !isEditing && (
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={onSaveDraft}
          isLoading={isSavingDraft}
          disabled={!hasName}
          className="font-display pointer-coarse:h-11"
        >
          <Save size={15} aria-hidden />
          <span>{savedDraftId ? 'Update draft' : 'Save draft'}</span>
        </Button>
      )}
      {step === stepCount - 1 && (
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={onSubmit}
          isLoading={isSaving}
          disabled={!canSubmit}
          className="font-display pointer-coarse:h-11"
        >
          {isSaving ? 'Saving…' : !hasPeople ? 'Save as draft' : isEditing ? 'Save changes' : 'Create checklist'}
        </Button>
      )}
    </div>
);
