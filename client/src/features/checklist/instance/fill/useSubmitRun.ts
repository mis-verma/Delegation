import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../../../lib/queryHelpers';
import { useSubmitChecklistInstanceMutation } from '../../hook';

export const useSubmitRun = (instanceId: string) => {
  const submit = useSubmitChecklistInstanceMutation();
  const navigate = useNavigate();
  const { mutate } = submit;
  const send = useCallback(() => mutate(instanceId, { onSuccess: () => navigate('/checklists') }), [mutate, instanceId, navigate]);
  return {
    send,
    pending: submit.isPending,
    failed: submit.isError && !submit.isPending,
    errorText: errorMessage(submit.error, "Couldn't reach the server."),
  };
};

export type SubmitRun = ReturnType<typeof useSubmitRun>;
