import { useEffect, useCallback, type MutableRefObject } from 'react';
import { useBlocker } from 'react-router';
import { useConfirm } from '@/components/confirmDialog';

export const useUnsavedChangesGuard = (isDirtyNow: () => boolean, justSavedRef: MutableRefObject<boolean>) => {
  const confirm = useConfirm();
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => isDirtyNow() && !justSavedRef.current && currentLocation.pathname !== nextLocation.pathname,
      [isDirtyNow, justSavedRef],
    ),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let cancelled = false;
    (async () => {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'This checklist has changes that haven\'t been saved yet. Leaving now will lose them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (cancelled) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyNow()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirtyNow]);
};
