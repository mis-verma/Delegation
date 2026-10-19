import type {
  ChecklistAuditDressTypeOption,
  ChecklistInstanceItemSubmission,
} from '../../../api/checklistInstances';

export type AuditStatus = 'new' | 'progress' | 'done' | 'flagged' | 'na';

export interface AuditPerson {
  id:     string;
  name:   string;
  isMe:   boolean;
  store:  string | null;
  status: AuditStatus;
  dressType: string | null;
}

export const auditStatus = (s: ChecklistInstanceItemSubmission): AuditStatus => {
  if (s.isDone && s.isNotApplicable) return 'na';
  if (s.isDone) return s.accessories.some(a => !a.checked) ? 'flagged' : 'done';
  const started = s.accessories.some(a => a.checked) || (s.images?.length ?? 0) > 0 || !!s.remarks?.trim();
  return started ? 'progress' : 'new';
};

export const uniformLabel = (submission: Pick<ChecklistInstanceItemSubmission, 'dressType'> | null | undefined): string | null =>
  submission?.dressType?.name ?? null;

export const dressTypeChoices = (
  options: ChecklistAuditDressTypeOption[] | undefined,
  gender: 'FEMALE' | 'MALE' | null | undefined,
): ChecklistAuditDressTypeOption[] =>
  (options ?? []).filter(o => !o.gender || !gender || o.gender === gender);
