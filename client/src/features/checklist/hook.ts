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
import type { ChecklistInstanceItemSubmissionAccessory } from '../../api/checklistInstances';
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

/** Live checklists with questions that have no good answer set (ADMIN/PC). Cheap, so a short stale time is enough. */
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

// Infinite, not the old unbounded fetch-everything call — GET /checklist-definitions used to
// hydrate every matching definition (items, stores, assignees, reviewers) on every load of the
// templates grid. useInfiniteQuery fetches and caches each page exactly once and appends them.
export const useChecklistDefinitionsQuery = (filters: Omit<ListChecklistDefinitionsParams, 'page' | 'limit'> = {}) => {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: KEYS.definitions(filters),
    queryFn: ({ pageParam }) => checklistDefinitionApi.getAll({ ...filters, page: pageParam, limit: DEFINITIONS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.meta?.hasNext ? lastPage.meta.page + 1 : undefined),
    enabled: !!token,
    retry: handleQueryRetry,
    // Changing a filter keeps the old list on screen until the new one lands, instead of flashing skeletons.
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

// Saving an edit goes live in today's runs straight away: runs nobody started are rebuilt, runs that
// already have answers get the edit merged in with every answer kept, and runs already sent for
// review or approved stay as signed off. Say which happened, so "I saved it but it isn't live" never
// has to be guessed.
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
      // Runs changed too, so every list/board/detail/count built from them has to reload.
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
      // The delete only hides the checklist, so a mistake can be taken back for a few seconds.
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

// Read-only — parses + matches the uploaded file but never writes anything, so no cache
// invalidation belongs here.
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

/**
 * Counts straight from the database, instead of `useMyChecklistInstancesQuery().length`.
 *
 * The dashboard cards and the compliance board used to download every instance — items, images,
 * submissions and all — purely to count them. That is why those list endpoints had to stay
 * unbounded; this is what lets them paginate.
 */
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
  /** keepPrevious: keep showing the last counts while a changed filter (e.g. another period) loads. */
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

// Dashboard's "Needs your approval" card — `enabled` is the caller's own role check (ADMIN/PC and
// the department heads who can approve), same convention as the task/ticket summary hooks'
// `enabled` param. Returns the oldest few rows plus the real queue size.
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

// Audit history (History page): submitted audit rows, newest first. Under the 'checklist-instances'
// prefix on purpose, so submitting or reopening any audit row invalidates it along with everything
// else on that prefix. The server scopes it by role (ADMIN/PC all, MANAGER/SENIOR their department).
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

// Powers the admin Compliance Board — every generated instance matching whichever store/person/
// status filters are picked, across every checklist definition (not scoped to one, unlike
// useInstancesForDefinitionQuery above).
/** Returns the whole `{ data, meta }` page — the board needs `meta.totalPages` for its pager. */
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
  /** null clears the remark. */
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
    // Checking an item off (or filling in its answer) should reflect on the card immediately —
    // waiting on the round-trip made every tap feel laggy. Patch the cached instance's item now,
    // roll back in onError if the server rejects it.
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
                  // Only a change of done-ness moves the completion stamp; a remark saved on a
                  // finished item used to re-stamp it "Completed just now" locally.
                  completedAt: patch.isDone === item.isDone ? item.completedAt : patch.isDone ? new Date().toISOString() : null,
                  // Mirrors the server: only an explicit N/A save sets it; a remark-only save
                  // leaves it; anything else (complete, reopen) clears it.
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
      // No success toast here — keeps checkbox-toggling snappy, matching
      // useUpdateChecklistItemMutation in tickets/hook.ts.
      // The optimistic patch above already keeps this instance's own detail view correct for the
      // common case (item toggled, instance still incomplete) — no refetch needed there. Only
      // when this tap actually crossed the completion boundary (finished the instance, or undid
      // its only remaining item) do the summary card, compliance board, and verification queue
      // need to hear about it, so the wider invalidation is reserved for that transition instead
      // of firing on every single tap.
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
      // The tap was rolled back, so say so and keep the message up until the person retries or
      // dismisses it: a quick toast is too easy to miss and they would think the answer was kept.
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
    mutationFn: ({ itemId, files, captureMethod }: { itemId: string; files: File[]; captureMethod: CaptureMethod }) =>
      checklistInstanceApi.uploadImages(itemId, files, captureMethod).then(r => r.data),
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

// Mutations below act on one AUDIT item's per-auditor ChecklistInstanceItemSubmission (see
// ChecklistInstanceItemAuditCard.tsx) — all invalidate the same instance-detail key as the
// STANDARD-item mutations above, since a submission change also flips its parent item's derived
// isDone (and possibly the instance's verificationStatus) server-side.
// instanceId kept in the signature (unused) to match its sibling submission mutations below,
// which all take it for their own narrower invalidateKeys — SubmissionRow calls all of them
// uniformly with the same instanceId argument.
export const useSetChecklistInstanceItemSubmissionDoneMutation = (_instanceId: string) =>
  useEntityMutation({
    mutationFn: ({ id, isDone, notApplicable, remarks }: { id: string; isDone: boolean; notApplicable?: boolean; remarks?: string }) =>
      checklistInstanceItemSubmissionApi.setDone(id, isDone, { notApplicable, remarks }).then(r => r.data),
    // Whole prefix, not just this instance's own detail key — same reasoning as
    // useSetChecklistInstanceItemDoneMutation above: a submission can complete the whole
    // instance, which the summary/board/verification-queue queries need to reflect too.
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

// Switches what one person is wearing. The server swaps their accessory rows for the new type's
// list (all unticked), so the cached submission is patched from the response right away; the
// refetch after it just confirms. Errors toast the server's plain-text reason.
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

// Powers the PC/Admin verification queue's Checklists section — instances with every item done,
// awaiting review. Scoped server-side (PC gets their own department, ADMIN gets every department).
// Returns `meta` (not just `data`) so the queue's "Load more" button can check `hasNext` instead
// of guessing from whether the last page came back full.
// Infinite, not a growing flat `limit` — a "Load more" that just widens `limit` refetches every
// already-loaded row from offset 0 on each click (5 clicks to reach 100 rows transfers 300
// row-equivalents). useInfiniteQuery fetches and caches each page exactly once and appends them
// for free, so callers don't need to hand-roll accumulation (which would mean calling setState
// from inside a useEffect — an anti-pattern this codebase's lint config flags).
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

// ADMIN only: an approved run goes back to the review queue.
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
// Templates are a separate one-off feature (see ChecklistDefinition model comment), but the
// definition form lets admins import a template's step labels as a starting point.
export { useChecklistTemplatesQuery } from '../admin/hook';

// The answer history of one run, fetched only when a reviewer opens a question's history. One request
// covers every question in the run, so opening a second question costs nothing.
export const useChecklistItemHistoryQuery = (instanceId: string, enabled: boolean) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'item-history', instanceId],
    queryFn: () => checklistItemHistoryApi.get(instanceId).then((r) => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
  });
};
