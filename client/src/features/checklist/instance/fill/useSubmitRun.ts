import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useConfirm } from '@/components/confirmDialog';
import { errorMessage } from '../../../../lib/queryHelpers';
import { useSubmitChecklistInstanceMutation } from '../../hook';

export type SubmitSummary = { title: string; description: string };

export const useSubmitRun = (instanceId: string, summary?: () => SubmitSummary) => {
  const submit = useSubmitChecklistInstanceMutation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { mutate } = submit;
  const send = useCallback(async () => {
    if (summary) {
      const { title, description } = summary();
      const ok = await confirm({ title, description, confirmLabel: 'Submit', cancelLabel: 'Check again' });
      if (!ok) return;
    }
    mutate(instanceId, { onSuccess: () => navigate('/checklists') });
  }, [mutate, instanceId, navigate, confirm, summary]);
  return {
    send,
    pending: submit.isPending,
    failed: submit.isError && !submit.isPending,
    errorText: errorMessage(submit.error, "Couldn't reach the server."),
  };
};

export type SubmitRun = ReturnType<typeof useSubmitRun>;
