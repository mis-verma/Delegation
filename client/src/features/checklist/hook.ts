import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  checklistDefinitionApi,
  type CreateChecklistDefinitionPayload,
  type UpdateChecklistDefinitionPayload,
  type ListChecklistDefinitionsParams,
  type ChecklistRecurrence,
  type LiveRunsSummary,
} from '../../api/checklistDefinitions';
import { checklistInstanceApi, checklistItemHistoryApi, type ChecklistInstance, type ChecklistInstanceStatus, type ChecklistVerificationStatus, type VerifyChecklistInstancePayload, type SendBackChecklistInstancePayload } from '../../api/checklistInstances';
import { checklistInstanceItemSubmissionApi } from '../../api/checklistInstanceItemSubmissions';
import type { ChecklistImagePurpose, ChecklistInstanceItemSubmissionAccessory } from '../../api/checklistInstances';
import type { CaptureMethod } from '../../api/ticket';
import { checklistBulkImportApi, type BulkImportPublishPayload } from '../../api/checklistBulkImport';
import { useEntityMutation, notifyError, handleQueryRetry, invalidateScoreCaches } from '../../lib/queryHelpers';
import type { DashboardQueryOptions } from '../../lib/dashboardQuery';

const KEYS = {
  definitions:            (filters: ListChecklistDefinitionsParams) => ['checklist-definitions', filters] as const,
  definitionDetail:       (id: string) => ['checklist-definitions', 'detail', id] as const,
  myInstances:            (status?: ChecklistInstanceStatus) => ['checklist-instances', 'mine', status ?? 'all'] as const,
  instanceDetail:         (id: string) => ['checklist-instances', 'detail', id] as const,
  auditHistory:           () => ['checklist-instances', 'audit-history'] as const,
  instancesForDefinition: (definitionId: string) => ['checklist-instances', 'by-definition', definitionId] as const,
  instancesBoard:         (filter: { storeId?: string; assigneeId?: string; status?: ChecklistInstanceStatus }) =>
    ['checklist-instances', 'board', filter] as const,
};

const DEFINITIONS_PAGE_SIZE = 30;

export const useChecklistScoringGapsQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-definitions', 'scoring-gaps'] as const,
    queryFn: () => checklistDefinitionApi.getScoringGaps().then((r) => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });
};

export const useChecklistDefinitionsQuery = (filters: Omit<ListChecklistDefinitionsParams, 'page' | 'limit'> = {}) => {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: KEYS.definitions(filters),
    queryFn: ({ pageParam }) => checklistDefinitionApi.getAll({ ...filters, page: pageParam, limit: DEFINITIONS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta?.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const useChecklistDefinitionQuery = (id: string) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.definitionDetail(id),
    queryFn: () => checklistDefinitionApi.getOne(id).then(r => r.data),
    enabled: !!token && !!id,
    refetchOnMount: 'always',
    retry: handleQueryRetry,
  });
};

export const useCreateChecklistDefinitionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateChecklistDefinitionPayload) =>
      checklistDefinitionApi.create(payload).then(r => r.data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
      toast.success(created.isActive ? 'Checklist created' : 'Saved as a draft', created.isActive ? undefined : { description: 'Add people when their accounts are ready and it goes live.' });
    },
    onError: (err) => notifyError(err, "Couldn't create the checklist. Try again."),
  });
};

const savedMessage = (live?: LiveRunsSummary) => {
  const lines: string[] = [];
  if (live?.refreshed) lines.push(live.refreshed === 1 ? "Today's run is updated." : `${live.refreshed} of today's runs are updated.`);
  if (live?.updated) {
    lines.push(`${live.updated} ${live.updated === 1 ? 'run' : 'runs'} already started ${live.updated === 1 ? 'has' : 'have'} your changes too. Answers already entered are kept.`);
  }
  if (live?.kept) {
    lines.push(`${live.kept} ${live.kept === 1 ? 'run stays' : 'runs stay'} as ${live.kept === 1 ? 'it was' : 'they were'} (already sent for review, approved, or taken out of this checklist).`);
  }
  return lines.join(' ');
};

export const useUpdateChecklistDefinitionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateChecklistDefinitionPayload }) =>
      checklistDefinitionApi.update(id, payload).then(r => ({ definition: r.data, liveRuns: r.liveRuns, wentLive: r.wentLive, paused: r.paused, lateToday: r.lateToday })),
    onSuccess: ({ definition, liveRuns, wentLive, paused, lateToday }) => {
      queryClient.setQueryData(KEYS.definitionDetail(definition.id), definition);
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      if (liveRuns?.refreshed || liveRuns?.updated || wentLive || paused) {
        queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
        queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
      }
      if (wentLive) {
        toast.success('Checklist is live', { description: lateToday ? "Today's closing time has already passed, so today's run counts as missed. Tomorrow's run starts fresh." : "People are assigned, so today's run is on their list." });
        return;
      }
      if (paused) { toast.success('Saved as a draft', { description: "Nobody is assigned, so it is off everyone's list. Add people to put it live." }); return; }
      const description = savedMessage(liveRuns);
      toast.success('Checklist updated', description ? { description, duration: liveRuns?.kept ? 8000 : undefined } : undefined);
    },
    onError: (err) => notifyError(err, "Couldn't update the checklist. Try again."),
  });
};

export const useSetChecklistDefinitionActiveMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      checklistDefinitionApi.setActive(id, isActive).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(KEYS.definitionDetail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
      toast.success(updated.isActive ? "Checklist resumed. Today's run is back on people's lists." : "Checklist paused. It is off everyone's list and won't count until you resume it.");
    },
    onError: (err) => notifyError(err, "Couldn't update the checklist. Try again."),
  });
};

export const useDeleteChecklistDefinitionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checklistDefinitionApi.remove(id),
    onSuccess: (_result, id) => {
      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
        queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
        invalidateScoreCaches(queryClient);
      };
      refresh();
      toast.success('Checklist deleted', {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () => {
            checklistDefinitionApi.restore(id)
              .then(() => { refresh(); toast.success('Checklist restored'); })
              .catch((err) => notifyError(err, "Couldn't restore the checklist. Try again."));
          },
        },
      });
    },
    onError: (err) => notifyError(err, "Couldn't delete the checklist. Try again."),
  });
};

export const useChecklistBulkImportPreviewMutation = () =>
  useMutation({
    mutationFn: (file: File) => checklistBulkImportApi.preview(file).then(r => r.data),
    onError: (err) => notifyError(err, "Couldn't read that file. Try again."),
  });

export const useChecklistBulkImportPublishMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkImportPublishPayload) => checklistBulkImportApi.publish(payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      invalidateScoreCaches(queryClient);
    },
    onError: (err) => notifyError(err, "Couldn't publish this batch. Try again."),
  });
};

export const useChecklistInstanceSummaryQuery = (
  filter: {
    mine?: boolean;
    storeId?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    definitionId?: string;
    recurrence?: ChecklistRecurrence;
    verificationStatus?: ChecklistVerificationStatus;
    departmentId?: string;
    from?: string;
    to?: string;
    includeDeleted?: boolean;
  } = {},
  options: DashboardQueryOptions & { enabled?: boolean; keepPrevious?: boolean } = {},
) => {
  const { token } = useAuth();
  const { enabled = true, keepPrevious = false, ...queryOptions } = options;
  return useQuery({
    queryKey: ['checklist-instances', 'summary', filter],
    queryFn: () => checklistInstanceApi.getSummary(filter).then(r => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    ...queryOptions,
  });
};

export const useChecklistPendingApprovalQuery = (enabled = true, options?: DashboardQueryOptions) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'pending-approval-preview'] as const,
    queryFn: () => checklistInstanceApi.getPendingApprovalPreview(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    ...options,
  });
};

export const useMyChecklistInstancesQuery = (
  filter: {
    status?: ChecklistInstanceStatus;
    storeId?: string;
    recurrence?: ChecklistRecurrence;
    verificationStatus?: ChecklistVerificationStatus;
    departmentId?: string;
    assigneeIds?: string[];
    from?: string;
    to?: string;
  } = {},
  paging: { page?: number; limit?: number } = {},
  options: DashboardQueryOptions & { enabled?: boolean } = {},
) => {
  const { token } = useAuth();
  const { enabled = true, ...queryOptions } = options;
  return useQuery({
    queryKey: [...KEYS.myInstances(filter.status), filter, paging],
    queryFn: () => checklistInstanceApi.getMine(filter, paging).then(r => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    ...queryOptions,
  });
};

export const useAuditHistoryQuery = (
  filter: { storeId?: string; personId?: string; from?: string; to?: string } = {},
  paging: { page?: number; limit?: number } = {},
  options: { enabled?: boolean } = {},
) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEYS.auditHistory(), filter, paging],
    queryFn: () => checklistInstanceApi.getAuditHistory(filter, paging),
    enabled: !!token && (options.enabled ?? true),
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const useFormerPeopleQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'former-people'],
    queryFn: () => checklistInstanceApi.getFormerPeople(),
    enabled: !!token,
    retry: handleQueryRetry,
  });
};

export const usePersonRunsQuery = (userId: string | null, page: number) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'former-people', userId, 'runs', page],
    queryFn: () => checklistInstanceApi.getPersonRuns(userId!, { page, limit: 15 }),
    enabled: !!token && !!userId,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const useChecklistInstanceQuery = (id: string) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.instanceDetail(id),
    queryFn: () => checklistInstanceApi.getOne(id).then(r => r.data),
    enabled: !!token && !!id,
    retry: handleQueryRetry,
  });
};

export const useInstancesForDefinitionQuery = (definitionId: string, paging: { page?: number; limit?: number } = {}) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.instancesForDefinition(definitionId),
    queryFn: () => checklistInstanceApi.getForDefinition(definitionId, paging).then(r => r.data),
    enabled: !!token && !!definitionId,
    retry: handleQueryRetry,
  });
};

export const useDepartmentScoresQuery = (from: string, to: string, storeId: string | undefined, enabled: boolean) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'department-scores', from, to, storeId ?? ''],
    queryFn: () => checklistInstanceApi.getDepartmentScores(from, to, storeId).then(r => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const usePeriodReportQuery = (from: string, to: string, storeId?: string, departmentId?: string, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'period-report', from, to, storeId ?? '', departmentId ?? ''],
    queryFn: () => checklistInstanceApi.getPeriodReport(from, to, storeId, departmentId).then(r => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

export const useChecklistInstancesBoardQuery = (
  filter: { storeId?: string; assigneeId?: string; status?: ChecklistInstanceStatus; from?: string; to?: string; includeDeleted?: boolean; page?: number; limit?: number } = {},
  options: { enabled?: boolean } = {},
) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.instancesBoard(filter),
    queryFn: () => checklistInstanceApi.list(filter),
    enabled: !!token && (options.enabled ?? true),
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
};

type SetChecklistInstanceItemDoneVars = {
  itemId: string;
  isDone: boolean;
  numericValue?: number;
  booleanAnswer?: 'YES' | 'NO';
  textValue?: string;
  dateValue?: string;
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracy?: number;
  signatureValue?: string;
  secondSignatureValue?: string;
  conditionalReasonValue?: string;
  remarks?: string | null;
  notApplicable?: boolean;
};

export const useSetChecklistInstanceItemDoneMutation = (instanceId: string) => {
  const queryClient = useQueryClient();
  const instanceKey = KEYS.instanceDetail(instanceId);

  const mutation = useMutation<unknown, unknown, SetChecklistInstanceItemDoneVars, { previous?: ChecklistInstance; wasComplete: boolean }>({
    mutationFn: ({ itemId, isDone, numericValue, booleanAnswer, textValue, dateValue, gpsLat, gpsLng, gpsAccuracy, signatureValue, secondSignatureValue, conditionalReasonValue, remarks, notApplicable }) =>
      checklistInstanceApi.setItemDone(itemId, isDone, {
        numericValue, booleanAnswer, textValue, dateValue, gpsLat, gpsLng, gpsAccuracy, signatureValue, secondSignatureValue, conditionalReasonValue, remarks, notApplicable,
      }).then(r => r.data),
    onMutate: async ({ itemId, notApplicable, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: instanceKey });
      const previous = queryClient.getQueryData<ChecklistInstance>(instanceKey);
      const wasComplete = !!previous && previous.items.length > 0 && previous.items.every((i) => i.isDone);
      if (previous) {
        queryClient.setQueryData<ChecklistInstance>(instanceKey, {
          ...previous,
          items: previous.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  ...patch,
                  completedAt: patch.isDone === item.isDone ? item.completedAt : patch.isDone ? new Date().toISOString() : null,
                  isNotApplicable: notApplicable === true
                    ? true
                    : patch.isDone === item.isDone && Object.keys(patch).every((k) => k === 'isDone' || k === 'remarks')
                      ? item.isNotApplicable
                      : false,
                }
              : item,
          ),
        });
      }
      return { previous, wasComplete };
    },
    onSuccess: (_data, _vars, context) => {
      const current = queryClient.getQueryData<ChecklistInstance>(instanceKey);
      const isCompleteNow = !!current && current.items.length > 0 && current.items.every((i) => i.isDone);
      if (!context || context.wasComplete !== isCompleteNow) {
        queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
        invalidateScoreCaches(queryClient);
      }
    },
    onError: (err, vars, context) => {
      if (context?.previous) queryClient.setQueryData(instanceKey, context.previous);
      notifyError(err, "Couldn't save your answer. Try again.", {
        id: `answer-not-saved-${vars.itemId}`,
        persistent: true,
        format: (message, { offline }) => (offline ? "Not saved, you're offline." : `Not saved. ${message}`),
        retry: () => mutation.mutate(vars),
      });
    },
  });
  return mutation;
};

export const useUploadChecklistInstanceImagesMutation = (instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ itemId, files, captureMethod, purpose }: { itemId: string; files: File[]; captureMethod: CaptureMethod; purpose?: ChecklistImagePurpose }) =>
      checklistInstanceApi.uploadImages(itemId, files, captureMethod, purpose).then(r => r.data),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    successMessage: 'Photos uploaded',
    errorFallback: "Couldn't upload the photos. Try again.",
  });

export const useDeleteChecklistInstanceImageMutation = (instanceId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => checklistInstanceApi.deleteImage(id),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    successMessage: 'Photo deleted',
    errorFallback: "Couldn't delete the photo. Try again.",
    retryable: true,
  });

export const useSetChecklistInstanceItemSubmissionDoneMutation = (_instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ id, isDone, notApplicable, remarks }: { id: string; isDone: boolean; notApplicable?: boolean; remarks?: string }) =>
      checklistInstanceItemSubmissionApi.setDone(id, isDone, { notApplicable, remarks }).then(r => r.data),
    invalidateKeys: [['checklist-instances']],
    errorFallback: "Couldn't update the submission. Try again.",
    retryable: true,
  });

export const useUpdateChecklistInstanceItemSubmissionAccessoriesMutation = (instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ id, accessories }: { id: string; accessories: ChecklistInstanceItemSubmissionAccessory[] }) =>
      checklistInstanceItemSubmissionApi.updateAccessories(id, accessories).then(r => r.data),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    errorFallback: "Couldn't update the accessories. Try again.",
  });

export const useSetChecklistInstanceItemSubmissionDressTypeMutation = (instanceId: string) => {
  const queryClient = useQueryClient();
  const instanceKey = KEYS.instanceDetail(instanceId);
  return useMutation({
    mutationFn: ({ id, dressTypeId }: { id: string; dressTypeId: string | null }) =>
      checklistInstanceItemSubmissionApi.setDressType(id, dressTypeId).then(r => r.data),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData<ChecklistInstance>(instanceKey, (current) => current && ({
        ...current,
        items: current.items.map(item => (item.submissions?.some(s => s.id === id)
          ? {
              ...item,
              submissions: item.submissions.map(s =>
                s.id === id ? { ...s, dressType: data.dressType ?? null, accessories: data.accessories } : s),
            }
          : item)),
      }));
      queryClient.invalidateQueries({ queryKey: instanceKey });
    },
    onError: (err) => notifyError(err, "Couldn't change the dress type. Try again."),
  });
};

export const useUpdateChecklistInstanceItemSubmissionRemarksMutation =(instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string | null }) =>
      checklistInstanceItemSubmissionApi.updateRemarks(id, remarks).then(r => r.data),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    successMessage: 'Remarks saved',
    errorFallback: "Couldn't save the remarks. Try again.",
  });

export const useUploadChecklistInstanceItemSubmissionImagesMutation = (instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ submissionId, files, captureMethod }: { submissionId: string; files: File[]; captureMethod: CaptureMethod }) =>
      checklistInstanceItemSubmissionApi.uploadImages(submissionId, files, captureMethod).then(r => r.data),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    successMessage: 'Photos uploaded',
    errorFallback: "Couldn't upload the photos. Try again.",
  });

export const useDeleteChecklistInstanceItemSubmissionImageMutation = (instanceId: string) =>
  useEntityMutation({
    mutationFn: (id: string) => checklistInstanceItemSubmissionApi.deleteImage(id),
    invalidateKeys: [KEYS.instanceDetail(instanceId)],
    successMessage: 'Photo deleted',
    errorFallback: "Couldn't delete the photo. Try again.",
    retryable: true,
  });

export const usePendingVerificationChecklistInstancesQuery = (limit: number, enabled = true) => {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['checklist-instances', 'pending-verification', limit],
    queryFn: ({ pageParam }) => checklistInstanceApi.getPendingVerification({ page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta?.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};

export const useVerifyChecklistInstanceMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VerifyChecklistInstancePayload }) =>
      checklistInstanceApi.verify(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances']],
    successMessage: (updated) => (updated.verificationStatus === 'APPROVED' ? 'Checklist verified' : 'Checklist sent back'),
    errorFallback: "Couldn't save the review. Try again.",
    retryable: true,
  });

export const useSubmitChecklistInstanceMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => checklistInstanceApi.submit(id).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances']],
    successMessage: 'Submitted for approval',
    errorFallback: "Couldn't submit the checklist. Try again.",
  });

export const useSendBackChecklistInstanceMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SendBackChecklistInstancePayload }) =>
      checklistInstanceApi.sendBack(id, payload).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances']],
    successMessage: 'Sent back to the team',
    errorFallback: "Couldn't send the questions back. Try again.",
    retryable: true,
  });

export const useRaiseChecklistTicketMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, itemId, note, tatHours, priority }: { id: string; itemId: string; note: string; tatHours: number; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) =>
      checklistInstanceApi.raiseTicket(id, itemId, { note, tatHours, priority }).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances'], ['checklist-reports'], ['scores'], ['tickets']],
    successMessage: 'Ticket raised. It counts as a failed check.',
    errorFallback: "Couldn't raise the ticket. Try again.",
    retryable: true,
  });

export const useWaiveChecklistItemMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, itemId, reason }: { id: string; itemId: string; reason: string }) =>
      checklistInstanceApi.waiveItem(id, itemId, reason).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances'], ['checklist-reports'], ['scores']],
    successMessage: 'Question waived',
    errorFallback: "Couldn't waive the question. Try again.",
    retryable: true,
  });

export const useUnwaiveChecklistItemMutation = () =>
  useEntityMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) => checklistInstanceApi.unwaiveItem(id, itemId).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances'], ['checklist-reports'], ['scores']],
    successMessage: 'Waiver taken back',
    errorFallback: "Couldn't take the waiver back. Try again.",
    retryable: true,
  });

export const useReopenApprovalMutation = () =>
  useEntityMutation({
    mutationFn: (id: string) => checklistInstanceApi.reopenApproval(id).then(r => r.data),
    setDetailData: (updated) => ({ key: KEYS.instanceDetail(updated.id), data: updated }),
    invalidateKeys: [['checklist-instances']],
    successMessage: 'Approval reopened',
    errorFallback: "Couldn't reopen the approval. Try again.",
    retryable: true,
  });

export { useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery } from '../tickets/hook';
export { useChecklistTemplatesQuery } from '../admin/hook';

export const useChecklistItemHistoryQuery = (instanceId: string, enabled: boolean) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'item-history', instanceId],
    queryFn: () => checklistItemHistoryApi.get(instanceId).then((r) => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};
