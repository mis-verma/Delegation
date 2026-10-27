import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  reportApi,
  type DepartmentReportModule,
  type DepartmentReportParams,
  type ReportModule,
  type ReportExportParams,
} from '../../api/reports';
import { errorMessage } from '../../lib/queryHelpers';

export const useReportExportMutation = (reportModule: ReportModule) =>
  useMutation({
    mutationFn: (params: ReportExportParams) => reportApi.downloadExport(reportModule, params),
    onError: (err) => toast.error(errorMessage(err, 'Failed to export report')),
  });

export const useDepartmentReportMutation = (reportModule: DepartmentReportModule) =>
  useMutation({
    mutationFn: (params: DepartmentReportParams) => reportApi.downloadDepartmentReport(reportModule, params),
    onSuccess: () => toast.success('Report downloaded'),
    onError: (err) => toast.error(errorMessage(err, 'Failed to export report')),
  });
