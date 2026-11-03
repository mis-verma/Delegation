import { apiFetch } from '../../api/http';
import { useEntityMutation } from '../../lib/queryHelpers';
import type { PhotoReviewReason, PhotoReviewStatus } from '../../api/checklistInstances';
import type { PhotoReviewKind, PhotoReviewState } from './instance/photoReviewContext';

const BASE: Record<PhotoReviewKind, string> = {
  run: '/checklist-instance-images',
  task: '/task-images',
  ticket: '/checklist-images',
};

const KEYS: Record<PhotoReviewKind, string[][]> = {
  run: [['checklist-instances']],
  task: [['tasks']],
  ticket: [['tickets']],
};

type ReviewVars = { id: string } & ({ action: 'REJECT'; reason: PhotoReviewReason } | { action: 'ACCEPT' });

export const usePhotoReviewMutation = (state: PhotoReviewState) =>
  useEntityMutation({
    mutationFn: ({ id, ...payload }: ReviewVars) =>
      apiFetch<{ success: boolean; data: { id: string; reviewStatus: PhotoReviewStatus } }>(`${BASE[state.kind]}/${id}/review`, { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
    invalidateKeys: KEYS[state.kind],
    successMessage: (image) => (image.reviewStatus === 'REJECTED' ? 'Photo rejected. Send it back so they can add a clear one.' : 'Photo accepted'),
    errorFallback: "Couldn't save your decision on that photo. Try again.",
    retryable: true,
  });
