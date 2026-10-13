import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { checklistReportApi, type ChecklistReportParams, type ChecklistReportFormat } from '../../../api/checklistReports';
import { notifyError, handleQueryRetry } from '../../../lib/queryHelpers';

// The live preview under the options. Kept on screen while a changed option reloads, so the table
// does not flash back to skeletons on every chip tap.
export const useChecklistReportPreview = (params: ChecklistReportParams, enabled: boolean) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-report-preview', params] as const,
    queryFn: () => checklistReportApi.preview(params),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
};

export const useChecklistReportDownload = () =>
  useMutation({
    mutationFn: ({ params, format }: { params: ChecklistReportParams; format: ChecklistReportFormat }) =>
      checklistReportApi.download(params, format),
    onSuccess: () => toast.success('Report downloaded'),
    onError: (err) => notifyError(err, "Couldn't download the report. Try again."),
  });
