import type { ChecklistInstanceItemSubmission, ChecklistInstanceItemSubmissionUser } from '../../../api/checklistInstances';

export type AuditStatus = 'new' | 'progress' | 'done' | 'flagged' | 'na';

export interface AuditPerson {
  id:     string;
  name:   string;
  isMe:   boolean;
  store:  string | null;
  status: AuditStatus;
}

// Where one person stands, read off what the server already holds (ticks, photos, remarks). A
// submitted person with something unticked reads "Flagged" so a gap is visible without opening them.
export const auditStatus = (s: ChecklistInstanceItemSubmission): AuditStatus => {
  if (s.isDone && s.isNotApplicable) return 'na';
  if (s.isDone) return s.accessories.some(a => !a.checked) ? 'flagged' : 'done';
  const started = s.accessories.some(a => a.checked) || (s.images?.length ?? 0) > 0 || !!s.remarks?.trim();
  return started ? 'progress' : 'new';
};

// The uniform that applies to this person, stated only when it is known. A woman with no dress code
// set gets the usual female list, a man or an unknown gender gets nothing (never guessed).
export const uniformLabel = (user: Pick<ChecklistInstanceItemSubmissionUser, 'gender' | 'dressCode'> | null | undefined): string | null => {
  if (user?.gender !== 'FEMALE') return null;
  return user.dressCode === 'SAREE' ? 'Saree' : 'Coat, pant and heels';
};

