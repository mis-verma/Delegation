import { useMutation } from '@tanstack/react-query';
import { scoreApi, type DataCheckResult } from '../../../api/scores';
import { ApiError } from '../../../api/http';

/** Plain words for the failures an admin can actually meet here. */
const dataCheckErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 403) return 'Only an Admin or the PC can run the data check.';
  if (error instanceof ApiError && error.status === 400 && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "We couldn't run the check. Check your connection and try again.";
};

/**
 * Runs only when asked (a button), never on its own: the check re-reads every score cut for the period,
 * so it is heavier than a normal page load. The last result stays on screen until the next run lands;
 * `variables` is the period that result belongs to.
 */
export const useDataCheck = () => {
  const mutation = useMutation<DataCheckResult, unknown, { from: string; to: string }>({
    mutationFn: (period) => scoreApi.dataCheck(period),
  });
  return {
    run: mutation.mutate,
    result: mutation.data,
    ranFor: mutation.variables,
    isRunning: mutation.isPending,
    isError: mutation.isError,
    errorMessage: mutation.isError ? dataCheckErrorMessage(mutation.error) : null,
  };
};
