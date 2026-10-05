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
  /** What they are wearing for this audit, shown as quiet text in the people list. */
  dressType: string | null;
}

// Where one person stands, read off what the server already holds (ticks, photos, remarks). A
// submitted person with something unticked reads "Flagged" so a gap is visible without opening them.
export const auditStatus = (s: ChecklistInstanceItemSubmission): AuditStatus => {
  if (s.isDone && s.isNotApplicable) return 'na';
  if (s.isDone) return s.accessories.some(a => !a.checked) ? 'flagged' : 'done';
  const started = s.accessories.some(a => a.checked) || (s.images?.length ?? 0) > 0 || !!s.remarks?.trim();
  return started ? 'progress' : 'new';
};

// The dress type this person is checked against, stated only when one is set (never guessed).
export const uniformLabel = (submission: Pick<ChecklistInstanceItemSubmission, 'dressType'> | null | undefined): string | null =>
  submission?.dressType?.name ?? null;

// Types this person can wear: no gender on the type means anyone; an unknown gender on the person
// shows every type rather than hiding one they might need.
export const dressTypeChoices = (
  options: ChecklistAuditDressTypeOption[] | undefined,
  gender: 'FEMALE' | 'MALE' | null | undefined,
): ChecklistAuditDressTypeOption[] =>
  (options ?? []).filter(o => !o.gender || !gender || o.gender === gender);
