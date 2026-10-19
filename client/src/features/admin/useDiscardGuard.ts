import { useCallback } from 'react';
import { useConfirm } from '../../components';

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
