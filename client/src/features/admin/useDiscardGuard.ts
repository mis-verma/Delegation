import { useCallback } from 'react';
import { useConfirm } from '../../components';

/**
 * Wraps a form's close handler so Cancel, Esc, the X and a click outside all ask first when the
 * form has unsaved edits. Returns a stable function; call it instead of `onClose` directly.
 * A successful save should still call the raw `onClose` (nothing left to discard).
 */
export const useDiscardGuard = (isDirty: boolean, isBusy: boolean, onClose: () => void) => {
  const confirm = useConfirm();

  return useCallback(async () => {
    if (isBusy) return;
    if (isDirty) {
      const discard = await confirm({
        title: 'Discard changes?',
        description: 'What you typed here has not been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!discard) return;
    }
    onClose();
  }, [confirm, isDirty, isBusy, onClose]);
};
